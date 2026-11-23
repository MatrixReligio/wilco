<p align="right"><strong>English</strong> · <a href="../zh-CN/protocol.md">简体中文</a></p>

# Protocol overview

> Status: draft. The normative specification will live in [`Protocol/`](../../Protocol/) with fixtures and test vectors.

## Layers

```text
Wilco envelope  { v, seq, ack, ch, sid, body }
      │            ch = "control" → Wilco control messages
      │            ch = "session" → body is an unmodified Pi RPC record
Noise transport (ChaCha20-Poly1305, ordered records)
      │
Direct TCP  or  WebSocket via Wilco Relay
```

## Session channel

`body` is exactly what Pi's RPC mode reads or writes: commands, responses, events and extension UI records. The host relays these records unchanged, with two exceptions: it replaces absolute paths outside authorized workspaces with opaque ids, and it may merge high-frequency streaming deltas into one frame.

## Control channel

Messages Pi doesn't provide: `hello` (versions and capabilities), `workspace.list`, `session.list`, `session.open`, `session.release`, `files.*`, `host.status`, `push.register` and `device.*`.

## Compatibility rules

- Major version 1 only changes additively. New fields and messages are optional and gated by capabilities that both sides declare in `hello`.
- Receivers ignore unknown fields and keep unknown record types as raw JSON.
- The host rejects Pi commands it doesn't know with `unsupported_by_host`.

## Resume

Every envelope has a sequence number. After reconnecting, the client sends its last `seq`. The host replays missed records from a bounded buffer, or answers `resync`. In that case the client catches up with Pi's `get_entries since=<entryId>` cursor.
