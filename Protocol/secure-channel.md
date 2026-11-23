<p align="right"><strong>English</strong> · <a href="secure-channel.zh-CN.md">简体中文</a></p>

# Secure channel (protocol version 1)

Every byte between a Wilco client (the device) and a Wilco Host travels through this channel, whether over the local network, a direct address or the Wilco Relay. The relay only ever sees ciphertext.

## Connection preamble

The device's first message on a new connection, before any handshake message, is 4 bytes: `"WLC"` ‖ mode, where mode is `0x01` for a pairing handshake and `0x02` for a reconnect. It is framed like a Noise message. The Host closes the connection without a reply on any other preamble, on a pairing preamble while no invitation is active, and when the handshake and the device's `hello` have not completed within 15 seconds. (A pairing device that has sent its `hello` then waits for the owner's decision until the invitation ends.)

## Handshakes

The device is always the Noise **initiator**, the Host the **responder**. Both use Curve25519, ChaCha20-Poly1305 and SHA-256, implemented exactly as in the [Noise Protocol Framework](https://noiseprotocol.org/noise.html), revision 34.

| Purpose | Pattern | Prologue |
|---|---|---|
| First pairing | `Noise_XXpsk3_25519_ChaChaPoly_SHA256`, psk = the 32-byte invitation secret | `"wilco/pair/1"` ‖ `0x00` ‖ UTF-8 host ID |
| Every later connection | `Noise_IK_25519_ChaChaPoly_SHA256`; the device already knows the Host's static key | `"wilco/1"` ‖ `0x00` ‖ UTF-8 host ID |

Implementations must reproduce the vectors in [`test-vectors/noise/`](test-vectors/noise/README.md) byte for byte.

Handshake payloads and confirmation:

- **Every handshake message carries an empty payload**, in both directions.
- The device speaks first after the handshake: its first transport message is its `hello` control message.
- **The Host treats the device as connected only once that first transport message decrypts.** IK message 1 is replayable: anyone who captured one can make a Host complete the handshake again, but cannot produce a transport message under the new keys. Until the first message decrypts, the Host records nothing (no "last seen", no online state, no replacement of an existing connection) and sends nothing.
- The Host then checks the device's static key: for reconnects against its device registry (unknown or revoked keys are disconnected without a reply), for pairing through owner approval. Only then does it send its first transport message, `hello.ok`.
- In XX, the device checks that the Host's static key revealed in message 2 equals the key in the invitation, and aborts otherwise.
- The Host accepts a pairing handshake only while its invitation is active: at most one at a time, refused once `x` has passed or after one device was approved with it. The device's clock is not trusted for this.
- Any handshake error ends the attempt; a new attempt starts from scratch.

## Pairing invitation

The Host shows a QR code containing the link

```text
wilco://pair#<base64url(JSON), no padding>
```

Everything is in the URL fragment, which clients never send to a server. The JSON object has these keys:

| Key | Type | Meaning |
|---|---|---|
| `v` | integer | invitation version, `1` |
| `h` | string | host ID |
| `n` | string | host display name |
| `k` | base64url | Host static X25519 public key (32 bytes) |
| `r` | string, optional | relay channel ID |
| `l` | array of strings | local-network hints, `host:port` |
| `s` | base64url | one-time pairing secret (32 bytes) |
| `x` | integer | expiry, Unix seconds; invitations last 10 minutes |

A client rejects links with another scheme or host, an unknown `v`, missing or mistyped fields, keys of the wrong length, or `now ≥ x`.

### Confirmation code

After an XX handshake both screens show a 6-digit code. Matching codes prove both ends completed the same handshake; the Host owner approves the device only then.

```text
code = UInt64(big-endian, first 8 bytes of HMAC-SHA256(key: handshake_hash, "wilco pairing code")) mod 1 000 000
```

The code is written with leading zeros to six digits.

## Transport messages

After the handshake, each side has a sending and a receiving cipher (Noise `Split()`); nonces are implicit counters, so a replayed, reordered or dropped message fails to decrypt. **Any decryption or format error ends the session.**

An application message (one Wilco envelope) may be larger than one Noise message (65535 bytes), so it is split into fragments. Each fragment's plaintext is:

```text
flag (1 byte: 0x00 = more fragments follow, 0x01 = final) ‖ up to 65518 bytes of the message
```

- Each fragment is encrypted as one Noise transport message with empty associated data.
- Noise messages must be transmitted in the order they were encrypted.
- An empty message is a single final fragment.
- A non-final fragment must not be empty, and any other flag value is an error.
- Receivers enforce a maximum assembled message size (64 MiB by default) and fail the session before buffering beyond it.

## Framing

- **Byte streams (TCP):** each Noise message is prefixed with its length as a 2-byte big-endian integer. A zero length is an error.
- **Message transports (WebSocket via the relay):** one binary WebSocket message per Noise message.
