<p align="right"><strong>English</strong> · <a href="control.zh-CN.md">简体中文</a></p>

# Control channel (protocol version 1)

Envelopes with `"ch":"control"` carry Wilco control messages: things Pi itself does not provide. Each message is a JSON object with a dotted `type`, an optional `id` that correlates a request with its result, and type-specific fields in camelCase.

## Compatibility

- Receivers ignore unknown fields.
- A message of an unknown `type`, or a known type with fields of the wrong type, is kept as an opaque value, not an error. A peer replies `error` with code `unsupported` if it cannot serve a request.
- Capabilities are an open set of strings; peers keep the ones they don't know.

## Messages

| `type` | Direction | Fields |
|---|---|---|
| `hello` | device → Host | `protocolVersion`, `capabilities[]`, `clientVersion?`, `deviceName?` |
| `hello.ok` | Host → device | `protocolVersion`, `capabilities[]`, `hostVersion?`, `piVersion?` |
| `workspace.list` | device → Host | none |
| `workspace.list.result` | Host → device | `workspaces[]`: `{id, name, path}` (path is display-only, home shown as `~`) |
| `session.list` | device → Host | `workspaceID?` |
| `session.list.result` | Host → device | `sessions[]`: `{id, workspaceID, name?, firstMessage?, updatedAt, isRunning, writer?}`; `writer` is `"host"` or `"tui"`; `updatedAt` is ISO 8601 with fractional seconds |
| `session.open` | device → Host | `workspaceID`, `sessionID?` (absent = new session), `lastSeq?`, `epoch?` |
| `session.opened` | Host → device | `sessionID`, `epoch`, `replay`: `"upToDate"`, `"replaying"` or `"resync"` |
| `session.release` | device → Host | `sessionID` |
| `host.status` | device → Host | none |
| `host.status.result` | Host → device | `hostVersion`, `piVersion?`, `runningSessions`, `connectedDevices` |
| `error` | either | `code`, `message`, `requestType?` |

Capabilities defined so far: `sessions`, `files`, `bash`, `push`, `bridge.tui`, `relay`.

## Resume

`session.open` with the `epoch` and `lastSeq` the client last saw lets the Host replay missed session records from its buffer (`replaying`). If the epoch changed or the gap is no longer buffered, the Host answers `resync` and the client catches up with Pi's `get_entries` cursor and `get_state`.
