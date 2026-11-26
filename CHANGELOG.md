# Changelog

All notable changes to the open-source parts of Wilco are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

本文件记录 Wilco 开源部分的重要变更（英文撰写）。

## [Unreleased]

### Added
- `Protocol/control.md`: `files.list` and `files.read` (read-only workspace files), `stats.get` (token use and cost by day, workspace and model), `session.export` (a session as HTML), `session.open` with `worktree` (a new session in its own git worktree), `WorkspaceInfo.isGitRepository`, `SessionSummary.worktree`; capabilities `stats`, `export`, `worktree`; errors `outside_workspace`, `invalid_path`, `not_found`, `too_large`, `not_a_repository`.
- `Protocol/control.md`: `session.fork` (fork a session before one of its messages, or duplicate it, in a separate Pi) with `requestID` (a repeated request gets the same fork), and the forked text in `session.opened`'s `draft`; `session.tree` (the tree of the person's messages, read by the Host from the session's file); capability `fork`; error `cancelled`. `get_tree` is answered `not_available`.
- `docs/*/session-tools.md`: branches and forks, slash commands, photos, changes, details, rename and compact.
- `Bridge/` wilco-bridge: a Pi session open in the Mac terminal reaches Wilco on the phone, which can follow it and send prompts, steering, stops and answers; one writer per session, with the terminal waiting for Wilco Host's run to end before it takes over.
- `Protocol/bridge.md`: the terminal bridge protocol (Unix socket, hello and roles, the records a terminal sends); `Protocol/control.md`: session activity carries `writer` and `terminalCommands`.
- `docs/*/terminal-sessions.md`: using terminal sessions from the phone.
- `Bridge/` wilco-guard: Pi asks for approval before dangerous commands and writes outside the session's folder; command substitutions, wrappers and links are looked through, and anything it cannot read is asked about.
- `Protocol/push.md`: sealed notifications (HPKE to each device's key) and Live Activity updates, and the rules a device follows before it offers Approve on the Lock Screen.
- `Push/`: the push Worker, which passes sealed notifications and Live Activity updates to APNs without being able to read them.
- `docs/*/notifications-and-approvals.md`: approvals, encrypted notifications, Live Activities, widgets, Siri and Shortcuts.
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
