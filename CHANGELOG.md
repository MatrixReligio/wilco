# Changelog

All notable changes to the open-source parts of Wilco are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

本文件记录 Wilco 开源部分的重要变更（英文撰写）。

## [Unreleased]

### Added
- Project documentation in English and Simplified Chinese.
- `Tools/mock-llm`: scripted, OpenAI-compatible streaming server for deterministic Pi tests.
- `Tools/fixture-recorder`: records normalized Pi RPC transcripts in an isolated environment.
- `Protocol/secure-channel.md`: Noise XXpsk3 pairing and IK reconnect handshakes, pairing invitation link, confirmation code, fragmented transport messages and stream framing; cacophony test vectors in `Protocol/test-vectors/noise/`.
- `Relay/`: the relay Worker, one Durable Object per Host channel with WebSocket hibernation, tested in the Workers runtime.
- `docs/*/self-hosting-relay.md`: deploying your own relay, using it from Wilco Host or `wilcod --relay`, what the relay sees, and its limits.
- `Protocol/relay.md`: the relay protocol (channels keyed by the Host's Ed25519 key, challenge authentication, multiplexed device connections, relay tokens, limits) with test vectors in `Protocol/test-vectors/relay/`; pairing invitations gain `u` and `t`, the control channel gains `relay`.
- `Protocol/control.md`: control-channel messages for protocol version 1. A pairing device is told why pairing ended (`pairing_rejected`, `pairing_expired`).
- `Protocol/fixtures/pi/<version>/sessions/`: recorded Pi session files, written by the fixture recorder for scenarios that use a session directory.
- `Protocol/fixtures/pi/1.6.0`: nine recorded Pi 1.6.0 RPC scenarios (state, streaming, tool calls, steering and follow-ups, abort, queue clearing, extension UI, session tree, errors).
