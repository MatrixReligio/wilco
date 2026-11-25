<p align="right"><strong>English</strong> · <a href="bridge.zh-CN.md">简体中文</a></p>

# Terminal bridge (bridgeProtocolVersion 1)

A Pi session open in the Mac terminal reaches Wilco through wilco-bridge, a Pi extension ([`Bridge/`](../Bridge/)). The extension connects to Wilco Host over a Unix socket and speaks Pi's own RPC record format, so a device sees a terminal session exactly as it sees a session Wilco Host runs itself.

## Transport

- Socket: `~/Library/Application Support/Wilco/Host/bridge.sock`, mode `0600` (only the Mac user can connect). `WILCO_BRIDGE_SOCKET` names another path.
- Framing: one JSON object per line (LF), UTF-8, like Pi's RPC mode.
- The extension connects when a session starts in the terminal (`ctx.mode === "tui"`) and closes when it ends. In Pi's other modes it does nothing. If the Host is not running, it tries again (1 s, doubling to at most 5 s).

## Handshake

The extension's first line:

```json
{"type":"wilco_bridge_hello","bridgeProtocolVersion":1,"sessionId":"…","sessionFile":"/…/session.jsonl","cwd":"/…","piVersion":"1.6.0","commands":["prompt","steer","abort","…"]}
```

`sessionFile` is absent for a session that is not saved. `commands` lists the RPC command types the extension can run. Unknown fields are ignored.

The Host answers with one line:

| Reply | Meaning |
|---|---|
| `{"type":"wilco_bridge_welcome","bridgeProtocolVersion":1,"role":"writer"}` | The terminal's Pi runs the session. Devices send it commands. |
| `{"type":"wilco_bridge_welcome","bridgeProtocolVersion":1,"role":"follower"}` | Wilco Host's own Pi is running this session right now. The terminal does not take input until the Host hands the session over. |
| `{"type":"wilco_bridge_refused","reason":"not_shared"}` | The session's folder is not shared with Wilco. The connection closes. |
| `{"type":"wilco_bridge_refused","reason":"unsupported_version"}` | The Host does not speak this `bridgeProtocolVersion`. |
| `{"type":"wilco_bridge_refused","reason":"another_writer"}` | Another terminal already writes this session. |

Later, `{"type":"wilco_bridge_role","role":"writer"}` hands a follower the session: Wilco Host's Pi has finished its run and stopped. The extension reloads the session from its file before taking input.

## One writer per session

A session has at most one writer: Wilco Host's own Pi process, or one terminal. When a terminal opens a session that Wilco Host's Pi holds:

- if that Pi is idle, the Host stops it and the terminal becomes the writer;
- if it is running, the terminal follows until the run ends, then becomes the writer.

When the terminal closes, devices get the session's stopped record. The next time a device opens the session, Wilco Host starts its own Pi from the session file.

## After the handshake

Extension → Host: Pi's records, unchanged.
- Events: `agent_*`, `turn_*`, `message_*`, `tool_execution_*`, `queue_update`, `compaction_*`, `auto_retry_*`.
- `response` records, which carry the `id` of their command.
- `extension_ui_request` records, for wilco-guard's questions.

The extension also sends these records of its own:

| Record | Meaning |
|---|---|
| `{"type":"wilco_terminal_prompt","kind":"select","title":"…"}` | Another extension is asking a question in the terminal. It can be answered only there. |
| `{"type":"wilco_terminal_prompt_end"}` | That question has been answered. |
| `{"type":"wilco_dialog_closed","id":"…"}` | A wilco-guard question was answered in the terminal first. |

Host → extension: RPC commands with an `id`, and `extension_ui_response` records.

The extension runs these commands through Pi's extension API: `prompt`, `steer`, `follow_up`, `abort`, `get_state`, `get_messages`, `get_available_models`, `set_model`, `set_thinking_level`, `get_available_thinking_levels`, `get_session_stats`, `get_commands`, `set_session_name`, `compact`. A `prompt` sent while Pi is busy is delivered as its `streamingBehavior` says (`followUp` when there is none). Any other command is answered with `success: false` and the error `"Not available while the session is open in the terminal."`.
