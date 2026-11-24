<p align="right"><strong>English</strong> · <a href="control.zh-CN.md">简体中文</a></p>

# Control channel (protocol version 1)

Envelopes with `"ch":"control"` carry Wilco control messages: things Pi itself does not provide. Each message is a JSON object with a dotted `type`, an optional `id` that correlates a request with its result, and type-specific fields in camelCase.

## Compatibility

- Receivers ignore unknown fields.
- A message of an unknown `type`, or a known type with fields of the wrong type, is kept as an opaque value, not an error. A peer replies `error` with code `unsupported_by_host` if it cannot serve a request.
- In a list result, an element that does not parse is skipped; the rest of the list is used.
- An unknown `replay` value is treated as `resync`.
- Timestamps are ISO 8601; receivers accept them with or without fractional seconds.
- Sequence numbers (`seq`, `ack`, `lastSeq`) are integers from 0 to 2^53 − 1.
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

## Error codes

| `code` | Meaning |
|---|---|
| `unsupported_by_host` | The Host does not know this request or command; update Wilco Host. |
| `unsupported_protocol` | The device's `protocolVersion` is not served; the Host closes the connection. |
| `pairing_rejected` | Reply to a pairing device's `hello`: the owner declined it. The Host closes the connection. |
| `pairing_expired` | Reply to a pairing device's `hello`: the invitation ended (expired, cancelled, replaced or used) before the owner approved. The Host closes the connection. |
| `unknown_workspace` | The workspace is not (or no longer) shared on the Host. |
| `unknown_session` | The session does not exist, is outside every shared workspace, or (for commands) was not opened on this connection. |
| `launch_failed` | Pi could not be started. |
| `invalid_command` | A session command is not a JSON object with a `type`. |
| `use_session_open` | The command would change the session (`new_session`, `switch_session`, `fork`, `clone`); use `session.open`. |
| `not_granted` | The command needs a permission the owner has not given this device (e.g. `bash`). |
| `not_available` | Known, but not offered by this Host version. |
| `pi_timeout`, `pi_error` | Pi did not answer in time, or could not run the command. |
| `too_many_requests` | Too many commands are waiting on this connection. |
| `internal_error` | The Host could not complete the request. |

## Session channel

Envelopes with `"ch":"session"` and `sid` carry Pi RPC for one session that the device opened with `session.open` on the same connection.

- **Device → Host:** one Pi RPC command per envelope (`seq` is not used and may be 0). Commands of one session reach Pi in the order sent; a command does not wait for the previous one's response (so `abort_bash` can interrupt a running `bash`). The device's command `id` is returned unchanged in the response. A command that Pi does not answer within 60 seconds fails with `pi_timeout`, and the Host then stops that Pi process, since it no longer responds (the stream ends with `wilco_session_stopped`; opening the session again starts Pi anew). `bash` and `compact`, which Pi answers when their work ends, have no time limit.
- **Host → device, stream records:** Pi's events, numbered by `seq` from 1 within the session's `epoch`. These are what resume replays.
- **Host → device, responses:** the response to this device's command, or an error in Pi's response shape (`{"type":"response","id","command","success":false,"error","code"}`, codes as above), with `seq` 0: responses are not part of the stream and are never replayed. A response from Pi carries `ack`: the `seq` of the last stream record Pi wrote before it (0 if none in this epoch). Responses and records travel separately and can arrive in either order; `ack` says which records a response such as `get_messages` already reflects. One Host record also uses `seq` 0: `{"type":"wilco_session_stopped"}`, sent when the Host resumes a stream for a device that fell behind and finds that the session has stopped meanwhile.
- Host file-system paths outside shared workspaces are replaced with `"<outside-workspace>"`, and session file paths with opaque `"session:…"` ids.
- Two records come from the Host rather than Pi: `{"type":"wilco_session_stopped","code"?}`, the last record of a stream when the session's Pi process ended; and `{"type":"wilco_records_dropped","count"}`, in place of Pi output that could not be read or was not a JSON object (such output is never forwarded).

## Resume

`session.open` with the `epoch` and `lastSeq` the client last saw lets the Host replay missed session records from its buffer (`replaying`). If the epoch changed or the gap is no longer buffered, the Host answers `resync` and the client catches up with Pi's `get_entries` cursor and `get_state`.

If a device falls too far behind a live stream, the Host continues it from the last record it sent; if those records are no longer buffered it first sends an unsolicited `session.opened` (no `id`) with `replay: "resync"`.
