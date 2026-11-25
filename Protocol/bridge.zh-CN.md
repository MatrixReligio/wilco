<p align="right"><a href="bridge.md">English</a> · <strong>简体中文</strong></p>

# 终端桥接（bridgeProtocolVersion 1）

在 Mac 终端里打开的 Pi 会话，通过 Pi 扩展 wilco-bridge（[`Bridge/`](../Bridge/)）接入 Wilco。扩展通过 Unix socket 连接 Wilco Host，使用 Pi 自己的 RPC 记录格式。因此在设备上看终端会话，和看 Wilco Host 自己运行的会话没有区别。

## 传输

- Socket 路径：`~/Library/Application Support/Wilco/Host/bridge.sock`，权限 `0600`，只有这台 Mac 的当前用户能连接。可以用 `WILCO_BRIDGE_SOCKET` 指定其他路径。
- 分帧：每行一个 JSON 对象（以 LF 结尾），UTF-8，与 Pi 的 RPC 模式相同。
- 扩展在终端里的会话开始时连接（`ctx.mode === "tui"`），会话结束时断开；在 Pi 的其他模式下什么也不做。如果 Host 没有运行，扩展会重试，间隔从 1 秒开始翻倍，最长 5 秒。

## 握手

扩展发送的第一行：

```json
{"type":"wilco_bridge_hello","bridgeProtocolVersion":1,"sessionId":"…","sessionFile":"/…/session.jsonl","cwd":"/…","piVersion":"1.6.0","commands":["prompt","steer","abort","…"]}
```

- 不保存到文件的会话没有 `sessionFile`。
- `commands` 列出扩展能执行的 RPC 命令类型。
- 未知字段一律忽略。

Host 回复一行：

| 回复 | 含义 |
|---|---|
| `{"type":"wilco_bridge_welcome","bridgeProtocolVersion":1,"role":"writer"}` | 由终端里的 Pi 执行这个会话，设备发来的命令交给它。 |
| `{"type":"wilco_bridge_welcome","bridgeProtocolVersion":1,"role":"follower"}` | Wilco Host 自己的 Pi 正在运行这个会话。在 Host 交出会话之前，终端不接受输入。 |
| `{"type":"wilco_bridge_refused","reason":"not_shared"}` | 会话所在的文件夹没有共享给 Wilco，连接随即关闭。 |
| `{"type":"wilco_bridge_refused","reason":"unsupported_version"}` | Host 不支持这个 `bridgeProtocolVersion`。 |
| `{"type":"wilco_bridge_refused","reason":"another_writer"}` | 已经有另一个终端在写这个会话。 |

之后 Host 可能发送 `{"type":"wilco_bridge_role","role":"writer"}`，把会话交给处于跟随状态的终端，这表示 Wilco Host 的 Pi 已经结束这次运行并停止。扩展会先从会话文件重新加载，然后才接受输入。

## 每个会话只有一个写入者

一个会话最多只有一个写入者：要么是 Wilco Host 自己的 Pi 进程，要么是某一个终端。终端打开一个正被 Wilco Host 的 Pi 持有的会话时：

- 如果那个 Pi 空闲，Host 停止它，终端成为写入者；
- 如果它正在运行，终端先跟随，等这次运行结束后再成为写入者。

终端关闭时，设备会收到这个会话的「已停止」记录。之后设备再打开这个会话，Wilco Host 会从会话文件启动自己的 Pi。

## 握手之后

扩展 → Host：原样转发 Pi 的记录。
- 事件：`agent_*`、`turn_*`、`message_*`、`tool_execution_*`、`queue_update`、`compaction_*`、`auto_retry_*`。
- `response` 记录，带有对应命令的 `id`。
- `extension_ui_request` 记录，用于 wilco-guard 的询问。

扩展还会发送下面这些自己的记录：

| 记录 | 含义 |
|---|---|
| `{"type":"wilco_terminal_prompt","kind":"select","title":"…"}` | 另一个扩展正在终端里提问，只能在终端里回答。 |
| `{"type":"wilco_terminal_prompt_end"}` | 这个提问已经回答。 |
| `{"type":"wilco_dialog_closed","id":"…"}` | wilco-guard 的询问已经先在终端里得到回答。 |

Host → 扩展：带 `id` 的 RPC 命令，以及 `extension_ui_response` 记录。

扩展通过 Pi 的扩展 API 执行这些命令：`prompt`、`steer`、`follow_up`、`abort`、`get_state`、`get_messages`、`get_available_models`、`set_model`、`set_thinking_level`、`get_available_thinking_levels`、`get_session_stats`、`get_commands`、`set_session_name`、`compact`。

Pi 忙碌时收到的 `prompt`，按它的 `streamingBehavior` 投递；没有指定时按 `followUp` 处理。其他命令一律回复 `success: false`，错误信息为 `"Not available while the session is open in the terminal."`。
