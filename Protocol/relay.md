<p align="right"><strong>English</strong> · <a href="relay.zh-CN.md">简体中文</a></p>

# Relay (protocol version 1)

The relay lets a device reach its Host when they are not on the same network. It forwards [secure-channel](secure-channel.md) messages without being able to read them: it sees a channel ID, connection IDs and message sizes, nothing else. A Host can use the hosted relay or [run its own](../docs/en/self-hosting-relay.md).

All binary values in JSON and URLs are base64url without padding. Byte strings below are written `a ‖ b`; `0x00` is a single zero byte.

## Channels and Host keys

Each Host has an Ed25519 key for the relay, separate from its X25519 key for the secure channel. Its **channel ID** is

```text
channel = base64url(SHA-256(Ed25519 public key))[first 22 characters]
```

so a channel belongs to whoever holds the key; there are no accounts. The pairing invitation carries the channel (`r`) and, for a relay other than the default one, its URL (`u`).

## Host connection

The Host opens a WebSocket to `wss://<relay>/v1/host/<channel>` and keeps it open. Hosts and devices accept a relay address only with `wss://`, except `ws://` to the same computer (`localhost`, `127.0.0.1`, `::1`) for a relay run locally during development: a plain WebSocket would show relay tokens to the network.

1. Relay → Host, text: `{"type":"challenge","nonce":"<32 bytes>"}`.
2. Host → relay, text: `{"type":"auth","key":"<Ed25519 public key>","sig":"<signature>"}`, signing
   `"wilco-relay/1" ‖ 0x00 ‖ "host" ‖ 0x00 ‖ channel ‖ 0x00 ‖ nonce`.
3. The relay checks that the key's channel ID is the one in the URL and that the signature is valid, then answers `{"type":"ready"}`. Otherwise it closes the socket with code 4401. A nonce is used once.

The Host has 10 seconds to authenticate, and anything other than `auth` before `ready` closes the connection (4401). A channel holds at most 4 connections that have not authenticated yet; a new one closes the oldest (4401), so holding them cannot lock the Host out. Only an authenticated Host connection counts: until there is one, devices get `503`.

A newly authenticated Host connection replaces an older one for the same channel; the relay closes the older one and every device connection that went through it.

The Host may send the text message `ping` at any time; the relay answers `pong`.

### Multiplexed device connections

Device connections reach the Host as binary messages on its connection:

```text
frame = type (1 byte) ‖ connection ID (4 bytes, big-endian) ‖ payload
```

| type | Direction | Payload |
|---|---|---|
| `1` open | relay → Host | the device token's ID (16 bytes) |
| `2` data | both | one secure-channel message |
| `3` close | both | empty |

Connection IDs are chosen by the relay and not reused while the Host connection lasts. Data for an unknown or closed connection is ignored. After the Host sends `close`, the relay closes that device's WebSocket; when a device hangs up, the relay sends `close`.

The Host also sends `{"type":"revoke","id":"<token ID>"}` when it removes a device: the relay remembers the ID, refuses it from then on and closes connections that used it.

## Device connection

A device opens a WebSocket to

```text
wss://<relay>/v1/connect/<channel>?token=<relay token>
```

Each binary WebSocket message is one secure-channel message; a text message closes the connection (code 1003). Each message is one secure-channel message (the connection preamble, handshake messages, then transport messages), exactly as over TCP but without the length prefix. Before upgrading, the relay answers:

| Status | When |
|---|---|
| `401` | the token is missing or malformed, or its signature is not the Host's |
| `403` | the token was revoked or has expired |
| `503` | the Host is not connected |
| `429` | the channel has too many device connections |

## Relay tokens

The Host issues tokens; the relay checks them with the Host's key and never stores them.

```text
body  = version (1 byte, 1) ‖ kind (1 byte) ‖ ID (16 bytes) ‖ expiry (8 bytes, big-endian Unix seconds; 0 = none)
token = body ‖ Ed25519 signature of ("wilco-relay-token/1" ‖ 0x00 ‖ channel ‖ 0x00 ‖ body)
```

| kind | Use |
|---|---|
| `1` device | Given to a paired device in the `relay` control message. Random ID per device, no expiry; revoking the device revokes the ID. |
| `2` pairing | Carried in the pairing invitation (`t`) so a device can pair through the relay. Expires with the invitation. |

## Limits

The hosted relay applies these limits; a self-hosted relay can change them.

- A WebSocket message is at most 1 MiB; a larger one closes the connection that sent it (code 1009).
- At most 32 device connections per channel.
- A channel forwards at most 64 MiB per minute; beyond that the relay closes the device connection that exceeded it (code 4429).
- A device connection with no traffic for 10 minutes is closed. Live connections are never idle: the device checks on a quiet Host every 15 seconds.

## Close codes

| Code | Meaning |
|---|---|
| `1000` | closed normally, or by the Host with a `close` frame |
| `1003` | a device sent a text message |
| `1009` | a message over the size limit |
| `1012` | the Host disconnected or reconnected (device connections) |
| `4401` | the Host failed or did not finish authentication |
| `4403` | the device's token was revoked |
| `4408` | the device connection was idle too long |
| `4409` | a newer Host connection replaced this one |
| `4429` | the channel's rate limit was exceeded |

## Test vectors

[`test-vectors/relay/vectors.json`](test-vectors/relay/vectors.json) gives, for a fixed Ed25519 seed, the public key, channel ID, a Host authentication signature, a device token, a pairing token and three frames. [`generate.mjs`](test-vectors/relay/generate.mjs) produces it. Implementations must reproduce these bytes.
