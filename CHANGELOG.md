# Changelog

All notable changes to the open-source parts of Wilco are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

本文件记录 Wilco 开源部分的重要变更（英文撰写）。

## [Unreleased]

### Added
- Project documentation in English and Simplified Chinese.
- `Tools/mock-llm`: scripted, OpenAI-compatible streaming server for deterministic Pi tests.
- `Tools/fixture-recorder`: records normalized Pi RPC transcripts in an isolated environment.
- `Protocol/secure-channel.md`: Noise XXpsk3 pairing and IK reconnect handshakes, pairing invitation link, confirmation code, fragmented transport messages and stream framing; cacophony test vectors in `Protocol/test-vectors/noise/`.
- `Protocol/control.md`: control-channel messages for protocol version 1.
- `Protocol/fixtures/pi/1.6.0`: nine recorded Pi 1.6.0 RPC scenarios (state, streaming, tool calls, steering and follow-ups, abort, queue clearing, extension UI, session tree, errors).
