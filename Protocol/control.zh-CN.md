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

## 错误码

| `code` | 含义 |
|---|---|
| `unsupported_by_host` | Host 不认识该请求或命令，请更新 Wilco Host。 |
| `unsupported_protocol` | 不支持设备的 `protocolVersion`，Host 随后关闭连接。 |
| `unknown_workspace` | 该工作区未在 Host 上共享（或已取消共享）。 |
| `unknown_session` | 会话不存在、不在任何共享工作区内，或（对命令而言）未在当前连接上打开。 |
| `launch_failed` | 无法启动 Pi。 |
| `invalid_command` | 会话命令不是带 `type` 的 JSON 对象。 |
| `use_session_open` | 该命令会切换会话（`new_session`、`switch_session`、`fork`、`clone`），请改用 `session.open`。 |
| `not_granted` | 该命令需要所有者尚未授予此设备的权限（例如 `bash`）。 |
| `not_available` | 已知命令，但当前 Host 版本不提供。 |
| `pi_timeout`、`pi_error` | Pi 未能及时应答，或无法执行该命令。 |
| `too_many_requests` | 此连接上等待执行的命令过多。 |
| `internal_error` | Host 无法完成该请求。 |

## 会话通道

`"ch":"session"` 且带 `sid` 的信封，承载某个会话的 Pi RPC；该会话必须已由设备在同一连接上通过 `session.open` 打开。

- **设备 → Host：**每个信封一条 Pi RPC 命令（不使用 `seq`，可为 0）。同一会话的命令按发送顺序到达 Pi。设备命令中的 `id` 会原样出现在响应里。
- **Host → 设备，流记录：**Pi 的事件，在该会话的 `epoch` 内由 `seq` 从 1 开始编号。断线续传补发的就是这些记录。
- **Host → 设备，响应：**对本设备命令的响应，或采用 Pi 响应格式的错误（`{"type":"response","id","command","success":false,"error","code"}`，code 见上表），`seq` 为 0：响应不属于流，永不补发。
- 共享工作区以外的 Host 文件系统路径会被替换为 `"<outside-workspace>"`，会话文件路径替换为不透明的 `"session:…"` 标识。
- 有两种记录来自 Host 而不是 Pi：`{"type":"wilco_session_stopped","code"?}`，表示会话的 Pi 进程已结束，是流的最后一条记录；`{"type":"wilco_records_dropped","count"}`，代替无法读取或不是 JSON 对象的 Pi 输出（这类输出不会被转发）。

## 断线续传

客户端在 `session.open` 中带上它最后看到的 `epoch` 和 `lastSeq`。如果缺失的会话记录还在缓冲里，Host 会补发（`replaying`）。如果 epoch 变了，或者缺口已经不在缓冲中，Host 回复 `resync`，客户端改用 Pi 的 `get_entries` 游标和 `get_state` 追上进度。

设备在实时流上落后太多时，Host 从它最后发出的那条记录继续发送；如果这些记录已不在缓冲中，Host 会先主动发送一条不带 `id` 的 `session.opened`，其中 `replay: "resync"`。
