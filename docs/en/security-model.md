<p align="right"><strong>English</strong> · <a href="../zh-CN/security-model.md">简体中文</a></p>

# Security model

## What stays on your Mac

Your repositories, provider credentials and Pi session history. Wilco has no accounts and no cloud database.

## Pairing

1. The Mac host shows a QR code containing its public key, host id, relay channel and a one-time pairing secret that expires after 10 minutes.
2. Your phone scans it and runs a **Noise XXpsk3** handshake (X25519, ChaCha20-Poly1305, SHA-256) bound to that secret.
3. The host shows the device name and a 6-digit confirmation code. You approve it on the Mac.
4. Both sides store each other's static public keys. Later connections use **Noise IK**, so each side proves its identity every time.

Keys live in the iOS and macOS Keychain and never leave the device that created them. Revoking a device on the Mac disconnects it immediately and invalidates its relay token.

## What the relay can see

The relay sees a channel id, connection times and the size of encrypted frames. It cannot read prompts, code, tool output or file names, and it stores nothing.

## Push notifications

Notification content is encrypted for your device before it leaves your Mac and is decrypted on your phone by a notification service extension. Apple and the relay only see ciphertext.

**Exception: Live Activities.** iOS cannot decrypt remote Live Activity updates on the device, so remote updates carry only minimal, non-sensitive fields: status, step count, elapsed time and a "needs you" flag. Never file names or text. When the app is running, it updates Live Activities locally with richer details.

## Workspace boundary

Authorizing a workspace controls where the phone can start or resume sessions, which files it can browse, and which sessions it can list. Paths are normalized, and symbolic links that point outside a workspace are rejected.

**Pi's own tools** (read, write, edit, bash) keep Pi's normal trust model, the same as when you use Pi on your Mac directly. Wilco does not sandbox Pi. To add guardrails, enable the `wilco-guard` approval policies; by default they ask before dangerous shell commands and before writes outside the workspace.

## Commands the phone may send

The host checks each command against a policy table. Commands that would choose arbitrary paths, such as switching to a session file or exporting HTML to a path, are only available through safe host operations. Running shell commands directly from the phone is off by default and must be enabled per device.

Found a problem? See [SECURITY.md](../../SECURITY.md).
