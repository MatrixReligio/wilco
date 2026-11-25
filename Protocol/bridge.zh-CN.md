<p align="right"><a href="bridge.md">English</a> · <strong>简体中文</strong></p>

# 终端桥接（bridgeProtocolVersion 1）

在 Mac 终端里打开的 Pi 会话，通过 Pi 扩展 wilco-bridge（[`Bridge/`](../Bridge/)）接入 Wilco。扩展通过 Unix socket 连接 Wilco Host，使用 Pi 自己的 RPC 记录格式。因此在设备上看终端会话，和看 Wilco Host 自己运行的会话没有区别。

## 传输

- Socket 路径：`~/Library/Application Support/Wilco/Host/bridge.sock`，权限 `0600`，只有这台 Mac 的当前用户能连接。可以用 `WILCO_BRIDGE_SOCKET` 指定其他路径。
- 分帧：每行一个 JSON 对象（以 LF 结尾），UTF-8，与 Pi 的 RPC 模式相同。
- 扩展在终端里的会话开始时连接（`ctx.mode === "tui"`），会话结束时断开；在 Pi 的其他模式下什么也不做。如果 Host 没有运行，扩展会重试，间隔从 1 秒开始翻倍，最长 5 秒；只有 Host 回复欢迎之后，间隔才回到 1 秒。
- 每行最长 32 MiB。超长的行会被 Host 丢在一边，连接保持不断：超长的 `response` 变成 `success: false`，错误信息为 `"The terminal's answer was too large to pass on."`；其他超长记录直接丢弃。

## 握手

扩展发送的第一行：

```json
{"type":"wilco_bridge_hello","bridgeProtocolVersion":1,"sessionId":"…","sessionFile":"/…/session.jsonl","cwd":"/…","piVersion":"1.6.0","commands":["prompt","steer","abort","…"]}
```

- 不保存到文件的会话没有 `sessionFile`；Pi 没有提供版本号时没有 `piVersion`。
- `commands` 列出扩展能执行的 RPC 命令类型。
- 未知字段一律忽略。

Host 回复一行：

| 回复 | 含义 |
|---|---|
| `{"type":"wilco_bridge_welcome","bridgeProtocolVersion":1,"role":"writer"}` | 由终端里的 Pi 执行这个会话，设备发来的命令交给它。 |
| `{"type":"wilco_bridge_welcome","bridgeProtocolVersion":1,"role":"follower","holder":"host"}` | 现在由别人写这个会话：`holder` 为 `"host"`（Wilco Host 自己的 Pi）或 `"terminal"`（另一个终端）。在会话交过来之前，终端不接受输入。 |
| `{"type":"wilco_bridge_refused","reason":"not_shared"}` | 会话所在的文件夹没有共享给 Wilco，连接随即关闭；扩展 30 秒后再问一次，以防那时文件夹已经共享。 |
| `{"type":"wilco_bridge_refused","reason":"unsupported_version"}` | Host 不支持这个 `bridgeProtocolVersion`。扩展会在终端里说明，并且不再重试。 |

`holder` 可以省略；省略时，跟随者等待的是 Wilco Host。本 Host 不会发送 `{"type":"wilco_bridge_refused","reason":"another_writer"}`；扩展收到它时，按跟随另一个终端处理。

之后 Host 可能发送 `{"type":"wilco_bridge_role","role":"writer"}`，把会话交给处于跟随状态的终端，这表示之前的写入者已经停止。扩展会先从会话文件重新加载，然后才接受输入。`{"type":"wilco_bridge_role","role":"follower","holder":"…"}` 告诉写入者：会话现在归别人了。

## 每个会话只有一个写入者

一个会话最多只有一个写入者：要么是 Wilco Host 自己的 Pi 进程，要么是某一个终端。终端打开一个正被 Wilco Host 的 Pi 持有的会话时：

- 如果那个 Pi 空闲，Host 停止它，终端成为写入者；
- 如果它正在运行、正在压缩上下文，或者还有排队的消息，终端先跟随，等 Pi 完全停下后再成为写入者。

第二个终端打开另一个终端正在写的会话时，会先跟随，等那个终端关闭后再成为写入者。两个终端同时到达时，一个写入，另一个跟随。终端跟随期间，Pi 内置的斜杠命令和 `!` shell 命令仍然会在那里执行：Pi 没有给扩展拦住它们的办法。

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

即使 wilco-bridge 和 wilco-guard 装了两份（比如 Wilco Host 装了一份，npm 又装了一份），Wilco 也只加载各自的一份。

扩展通过 Pi 的扩展 API 执行这些命令：`prompt`、`steer`、`follow_up`、`abort`、`get_state`、`get_messages`、`get_available_models`、`set_model`、`set_thinking_level`、`get_available_thinking_levels`、`get_session_stats`、`get_commands`、`set_session_name`、`compact`。

Pi 忙碌时收到的 `prompt`，按它的 `streamingBehavior` 投递；没有指定时按 `followUp` 处理。`steer` 和 `follow_up` 也按各自的方式投递。Pi 正在压缩上下文或没有选择模型时，这三个命令回复 `success: false`，并说明原因。其他命令一律回复 `success: false`，错误信息为 `"Not available while the session is open in the terminal."`。
