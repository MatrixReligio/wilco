<p align="right"><a href="control.md">English</a> · <strong>简体中文</strong></p>

# 控制通道（协议版本 1）

`"ch":"control"` 的信封承载 Wilco 控制消息，用来处理 Pi 本身不提供的功能。每条消息是一个 JSON 对象，包含：用点分隔的 `type`；可选的 `id`，用于把请求和结果对应起来；以及该类型特有的字段（camelCase 命名）。

## 兼容规则

- 接收方忽略未知字段。
- 未知 `type` 的消息，或已知类型但字段类型不对的消息，都作为不透明值保留，不报错。无法处理某个请求时，对方回复 `error`，code 为 `unsupported_by_host`。
- 列表结果中无法解析的元素会被跳过，其余元素照常使用。
- 未知的 `replay` 取值按 `resync` 处理。
- 时间戳为 ISO 8601，接收方接受带或不带小数秒的形式。
- 序号（`seq`、`ack`、`lastSeq`）是 0 到 2^53 − 1 之间的整数。
- 能力（capability）是开放的字符串集合，不认识的能力也会保留。

## 消息

| `type` | 方向 | 字段 |
|---|---|---|
| `hello` | 设备 → Host | `protocolVersion`、`capabilities[]`、`clientVersion?`、`deviceName?` |
| `hello.ok` | Host → 设备 | `protocolVersion`、`capabilities[]`、`hostVersion?`、`piVersion?` |
| `workspace.list` | 设备 → Host | 无 |
| `workspace.list.result` | Host → 设备 | `workspaces[]`：`{id, name, path}`（path 仅用于显示，主目录显示为 `~`） |
| `session.list` | 设备 → Host | `workspaceID?` |
| `session.list.result` | Host → 设备 | `sessions[]`：`{id, workspaceID, name?, firstMessage?, updatedAt, isRunning, writer?}`；`writer` 为 `"host"` 或 `"tui"`；`updatedAt` 为带小数秒的 ISO 8601 时间 |
| `session.open` | 设备 → Host | `workspaceID`、`sessionID?`（不填表示新建会话）、`lastSeq?`、`epoch?` |
| `session.opened` | Host → 设备 | `sessionID`、`epoch`、`replay`：`"upToDate"`、`"replaying"` 或 `"resync"` |
| `session.release` | 设备 → Host | `sessionID` |
| `host.status` | 设备 → Host | 无 |
| `host.status.result` | Host → 设备 | `hostVersion`、`piVersion?`、`runningSessions`、`connectedDevices` |
| `error` | 双向 | `code`、`message`、`requestType?` |

目前定义的能力：`sessions`、`files`、`bash`、`push`、`bridge.tui`、`relay`。

## 断线续传

客户端在 `session.open` 中带上它最后看到的 `epoch` 和 `lastSeq`。如果缺失的会话记录还在缓冲里，Host 会补发（`replaying`）。如果 epoch 变了，或者缺口已经不在缓冲中，Host 回复 `resync`，客户端改用 Pi 的 `get_entries` 游标和 `get_state` 追上进度。
