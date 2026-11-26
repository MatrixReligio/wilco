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
| `workspace.list.result` | Host → device | `workspaces[]`: `{id, name, path, isGitRepository?}` (path is display-only, home shown as `~`) |
| `session.list` | device → Host | `workspaceID?` |
| `session.list.result` | Host → device | `sessions[]`: `{id, workspaceID, name?, firstMessage?, updatedAt, isRunning, writer?, activity?, worktree?}`; `worktree` is the branch of the session's own git worktree; `writer` is `"host"` or `"tui"` (open in the Mac's terminal); `updatedAt` is ISO 8601 with fractional seconds; `activity` (see below) for sessions running on the Host |
| `session.open` | device → Host | `workspaceID`, `sessionID?` (absent = new session), `lastSeq?`, `epoch?`, `worktree?`: `true` for a new session in its own git worktree (Host runs `git worktree add -b wilco/<id> <workspace>/.wilco/worktrees/<id>`; needs `worktree` and a workspace with `isGitRepository`) |
| `session.opened` | Host → device | `sessionID`, `epoch`, `replay`: `"upToDate"`, `"replaying"` or `"resync"`; `pendingDialogs?`: the ids of the questions still waiting in the session (a device stops showing any other); `draft?`: in reply to `session.fork`, the text of the message the new session was forked from (a device puts it in its message field) |
| `session.fork` | device → Host | `workspaceID`, `sessionID`, `entryID?`, `requestID?`: a new session holding `sessionID` up to just before the person's message `entryID` (an id from `session.tree.result`), or, without `entryID`, a copy of the whole session. The Host does it in a Pi of its own, so the original session, even one running now, is not touched. A request repeated with the same `requestID` (as after a reconnect while the answer was on its way) is answered with the same new session for ten minutes. Reply: `session.opened` for the new session, as for `session.open`; it can take the Host up to a few minutes. Needs `fork`. |
| `session.tree` | device → Host | `workspaceID`, `sessionID`: the session's tree of the person's messages, which the Host reads from the session's file (Pi is not asked, so a running session is not slowed). Needs `fork`. |
| `session.tree.result` | Host → device | `sessionID`, `entries`: `[{id, parentID?, text, timestamp?}]`, one per message the person sent, in file order; `parentID` is the person's message before it on its route; `text` is the message's first 300 characters. `leafID?`: the message the session continues from. A running session with nothing sent yet has no entries. An entry a device cannot read is skipped. |
| `session.export` | device → Host | `workspaceID`, `sessionID`: the session as an HTML page, made by Pi's `export_html` (the Host starts the session's Pi if it is not running, and chooses where Pi writes the file). Needs `export`. |
| `session.export.result` | Host → device | `fileName` (suggested, ends in `.html`), `html`. A page over 16 MiB is refused with `too_large`. |
| `files.list` | device → Host | `workspaceID`, `path`: a folder in the workspace, relative to it (`""` is the workspace folder). Needs `files`. |
| `files.list.result` | Host → device | `path`, `entries`: `[{name, kind, size?, modifiedAt?}]`; `kind` is `file`, `directory` or `link` (a link leading out of the workspace, which cannot be opened); `truncated?`: more than 2000 entries, only the first are listed. `.git` is not listed. An entry a device cannot read is skipped. |
| `files.read` | device → Host | `workspaceID`, `path`: a file in the workspace. Needs `files`. |
| `files.read.result` | Host → device | `path`, `size` (the whole file, bytes), `kind`: `text` (`text`; `truncated?` when only the first 2 MiB are sent), `image` (`data`, base64, and `mimeType`; an image over 2 MiB is refused with `too_large`) or `binary` (no content). |
| `stats.get` | device → Host | `days` (1–90), `timeZone` (IANA name): token use and cost, read by the Host from the session files of the shared workspaces. Needs `stats`. |
| `stats.result` | Host → device | `rows`: `[{day, workspaceID, model, messages, input, output, cacheRead, cacheWrite, cost}]`, one per day (`yyyy-MM-dd` in `timeZone`), workspace and model (`provider/model`); `messages` counts Pi's replies. A row a device cannot read is skipped. |
| `session.release` | device → Host | `sessionID` |
| `host.status` | device → Host | none |
| `host.status.result` | Host → device | `hostVersion`, `piVersion?`, `runningSessions`, `connectedDevices` |
| `relay` | Host → device | `url`, `channel`, `token`: how to reach this Host through the [relay](relay.md); sent after `hello.ok` while the Host uses a relay, and again when that changes. A device keeps the latest one. |
| `guard.policy.get` | device → Host | none |
| `guard.policy.set` | device → Host | `policy`: `{dangerousCommands, outsideWorkspace, allBash}` (booleans; a missing rule keeps its default: `true`, `true`, `false`) |
| `guard.policy.result` | Host → device | `policy`: the rules now in force. Reply to both requests. |
| `session.activity` | Host → device | `sessionID`, `workspaceID`, `activity`: sent, without `id`, for every live session right after `hello.ok`, when a session opens in the Mac's terminal, and whenever its activity changes. A session that stopped gets a last one with state `idle`. |
| `dialog.answer` | device → Host | `sessionID`, `response`: a Pi `extension_ui_response` object. Answers a waiting question whether or not the session is open on this connection. |
| `dialog.answered` | Host → device | `sessionID`, `dialogID`: reply to `dialog.answer`. |
| `push.register` | device → Host | `token` (APNs, 64–200 hex digits), `environment` (`sandbox` or `production`), `key` (base64 of the device's 32-byte Curve25519 public key that notifications are sealed to), `events` (any of `approval`, `finished`, `failed`). Replaces the device's earlier registration; a device sends it on every connection. Reply: `ok`. |
| `push.unregister` | device → Host | The device gets no more notifications. Reply: `ok`. |
| `activity.register` | device → Host | `sessionID`, `token` (the Live Activity's push token): the Host keeps this Live Activity current while the session runs, and ends it when a run ends. Needs `push.register` first. Reply: `ok`. |
| `activity.end` | device → Host | `sessionID`: the device ended its Live Activity. Reply: `ok`. |
| `ok` | Host → device | The request was done. |
| `error` | either | `code`, `message`, `requestType?` |

`activity` is `{state, steps, startedAt?, tool?, pendingDialogs, writer?, terminalCommands?}`. `state` is `needsYou` while any question waits for an answer, otherwise `working` while Pi runs, otherwise `idle`; a device treats a state it does not know as `working`. `steps` counts the tools Pi started in the current (or last) run, which began at `startedAt`; `tool` is the one running now. `writer` is `"tui"` while the session is open in Pi in the Mac's terminal ([wilco-bridge](bridge.md)); it is absent when the Host's own Pi runs the session. `terminalCommands` then lists the commands the terminal runs; a device does not offer the others.

Capabilities defined so far: `sessions`, `files`, `bash`, `push`, `bridge.tui`, `relay`, `guard` (the Host runs every session under [wilco-guard](../Bridge/README.md) and serves `guard.policy.*`), `dialogs` (`session.activity`, `dialog.answer`, and the waiting-question rules below), `fork` (`session.fork`, `session.tree`), `stats` (`stats.get`), `export` (`session.export`), `worktree` (`session.open` with `worktree`); `files` covers `files.list` and `files.read`. A Host offers `push` when it sends notifications.

Notifications ([push.md](push.md)) follow these rules. A device hears only about the `events` it registered, and nothing about a session it has open on a live connection. `approval` is sent when a question starts waiting; `finished` when a run that took at least 10 seconds, or waited for an answer, ends; `failed` when a run ends with an error. Aborted runs are not announced. A token the push service reports dead is forgotten, and a revoked device's registration is dropped.

wilco-guard's questions are ordinary `confirm` extension UI requests whose `title` starts with `wilco-guard: `. They have no `timeout`: Pi waits until a device answers.

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
| `invalid_command` | A session command is not a JSON object with a `type`, or a `dialog.answer` does not carry an `extension_ui_response`. |
| `unknown_dialog` | The question was already answered (by any device), expired, or never asked. The answer is not passed to Pi. |
| `push_not_registered` | `activity.register` before `push.register`. |
| `cancelled` | An extension on the Mac stopped the request (for example a fork). |
| `use_session_open` | The command would change the session (`new_session`, `switch_session`, `fork`, `clone`); use `session.open`. |
| `outside_workspace` | The path leads out of the workspace (through `..` or a link). |
| `invalid_path` | The path is absolute, contains `..` or NUL, or is not a folder (`files.list`). |
| `not_found` | No such file or folder. |
| `too_large` | The file or page is larger than the Host sends. |
| `not_a_repository` | `worktree` was asked for in a folder that is not a git repository, or git could not add the worktree. |
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
- `get_tree` is answered `not_available`: Pi's tree nests one JSON level per entry, which no JSON reader takes past a few hundred entries. Ask the Host with `session.tree` instead.
- Host file-system paths outside shared workspaces are replaced with `"<outside-workspace>"`, and session file paths with opaque `"session:…"` ids.
- Three records come from the Host rather than Pi: `{"type":"wilco_session_stopped","code"?}`, the last record of a stream when the session's Pi process ended; `{"type":"wilco_records_dropped","count"}`, in place of Pi output that could not be read or was not a JSON object (such output is never forwarded); and `{"type":"wilco_dialog_closed","id"}`, when a question (an `extension_ui_request` dialog: `select`, `confirm`, `input`, `editor`) stops waiting because a device answered it or its `timeout` passed.
- **Waiting questions.** The Host keeps every dialog Pi asked until it is answered, it expires, or the session stops. Each takes one answer, from the session channel or from `dialog.answer`; later answers get `unknown_dialog`. When `session.opened` says `resync`, the questions still waiting follow it again with `seq` 0, so a device that missed them (or reconnected) can still answer; a device keeps one question per `id`. A session with a waiting question is never shut down as idle.

## Resume

`session.open` with the `epoch` and `lastSeq` the client last saw lets the Host replay missed session records from its buffer (`replaying`). If the epoch changed or the gap is no longer buffered, the Host answers `resync` and the client catches up with Pi's `get_entries` cursor and `get_state`.

If a device falls too far behind a live stream, the Host continues it from the last record it sent; if those records are no longer buffered it first sends an unsolicited `session.opened` (no `id`) with `replay: "resync"` and `pendingDialogs`, followed by the questions still waiting with `seq` 0.
