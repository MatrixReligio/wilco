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
| `session.list.result` | Host → 设备 | `sessions[]`：`{id, workspaceID, name?, firstMessage?, updatedAt, isRunning, writer?, activity?}`；`writer` 为 `"host"` 或 `"tui"`；`updatedAt` 为带小数秒的 ISO 8601 时间；在 Host 上运行的会话带有 `activity`（见下文） |
| `session.open` | 设备 → Host | `workspaceID`、`sessionID?`（不填表示新建会话）、`lastSeq?`、`epoch?` |
| `session.opened` | Host → 设备 | `sessionID`、`epoch`、`replay`：`"upToDate"`、`"replaying"` 或 `"resync"` |
| `session.release` | 设备 → Host | `sessionID` |
| `host.status` | 设备 → Host | 无 |
| `host.status.result` | Host → 设备 | `hostVersion`、`piVersion?`、`runningSessions`、`connectedDevices` |
| `relay` | Host → 设备 | `url`、`channel`、`token`：如何通过[中继](relay.zh-CN.md)连接这台 Host；Host 使用中继时在 `hello.ok` 之后发送，变化时再次发送。设备保留最新的一份。 |
| `guard.policy.get` | 设备 → Host | 无 |
| `guard.policy.set` | 设备 → Host | `policy`：`{dangerousCommands, outsideWorkspace, allBash}`（布尔值；缺少的规则保持默认值：`true`、`true`、`false`） |
| `guard.policy.result` | Host → 设备 | `policy`：当前生效的规则。两个请求都以它回复。 |
| `session.activity` | Host → 设备 | `sessionID`、`workspaceID`、`activity`：不带 `id`；`hello.ok` 之后立即为每个运行中的会话发送一次，之后活动每次变化都会发送。会话停止时最后发送一次，状态为 `idle`。 |
| `dialog.answer` | 设备 → Host | `sessionID`、`response`：一个 Pi `extension_ui_response` 对象。无论本连接是否打开了该会话，都可以回答正在等待的询问。 |
| `dialog.answered` | Host → 设备 | `sessionID`、`dialogID`：对 `dialog.answer` 的回复。 |
| `push.register` | 设备 → Host | `token`（APNs 令牌，64–200 位十六进制数字）、`environment`（`sandbox` 或 `production`）、`key`（设备用于接收加密通知的 32 字节 Curve25519 公钥，base64）、`events`（`approval`、`finished`、`failed` 的任意组合）。替换设备之前的登记；设备每次连接都会发送。回复：`ok`。 |
| `push.unregister` | 设备 → Host | 设备不再接收通知。回复：`ok`。 |
| `activity.register` | 设备 → Host | `sessionID`、`token`（实时活动的推送令牌）：会话运行期间 Host 让这个实时活动保持最新，并在一次运行结束时结束它。需要先 `push.register`。回复：`ok`。 |
| `activity.end` | 设备 → Host | `sessionID`：设备已结束它的实时活动。回复：`ok`。 |
| `ok` | Host → 设备 | 请求已完成。 |
| `error` | 双向 | `code`、`message`、`requestType?` |

`activity` 为 `{state, steps, startedAt?, tool?, pendingDialogs}`。有询问等待回答时 `state` 为 `needsYou`，否则 Pi 运行时为 `working`，其余为 `idle`；设备把不认识的状态当作 `working`。`steps` 是当前（或上一次）运行中 Pi 启动的工具数，该次运行开始于 `startedAt`；`tool` 是正在运行的工具。

目前定义的能力：`sessions`、`files`、`bash`、`push`、`bridge.tui`、`relay`、`guard`（Host 让每个会话都在 [wilco-guard](../Bridge/README.zh-CN.md) 之下运行，并提供 `guard.policy.*`）、`dialogs`（`session.activity`、`dialog.answer`，以及下文关于等待中询问的规则）。Host 发送通知时会提供 `push`。

通知（[push.zh-CN.md](push.zh-CN.md)）遵循以下规则。设备只会收到它登记的 `events`，并且不会收到它正在某个在线连接上打开的会话的通知。询问开始等待时发送 `approval`；用时至少 10 秒、或中途等待过回答的运行结束时发送 `finished`；运行以错误结束时发送 `failed`。被中止的运行不发送通知。推送服务报告失效的令牌会被删除，被撤销设备的登记也会被删除。

wilco-guard 的询问是普通的 `confirm` 扩展 UI 请求，`title` 以 `wilco-guard: ` 开头，且没有 `timeout`：Pi 会一直等到某台设备作答。

## 错误码

| `code` | 含义 |
|---|---|
| `unsupported_by_host` | Host 不认识该请求或命令，请更新 Wilco Host。 |
| `unsupported_protocol` | 不支持设备的 `protocolVersion`，Host 随后关闭连接。 |
| `pairing_rejected` | 对配对设备 `hello` 的回复：所有者拒绝了该设备。Host 随后关闭连接。 |
| `pairing_expired` | 对配对设备 `hello` 的回复：所有者批准前邀请已结束（过期、取消、被替换或已使用）。Host 随后关闭连接。 |
| `unknown_workspace` | 该工作区未在 Host 上共享（或已取消共享）。 |
| `unknown_session` | 会话不存在、不在任何共享工作区内，或（对命令而言）未在当前连接上打开。 |
| `launch_failed` | 无法启动 Pi。 |
| `invalid_command` | 会话命令不是带 `type` 的 JSON 对象，或 `dialog.answer` 携带的不是 `extension_ui_response`。 |
| `unknown_dialog` | 该询问已被（任意设备）回答、已过期，或从未提出。这个回答不会转给 Pi。 |
| `push_not_registered` | 在 `push.register` 之前发送了 `activity.register`。 |
| `use_session_open` | 该命令会切换会话（`new_session`、`switch_session`、`fork`、`clone`），请改用 `session.open`。 |
| `not_granted` | 该命令需要所有者尚未授予此设备的权限（例如 `bash`）。 |
| `not_available` | 已知命令，但当前 Host 版本不提供。 |
| `pi_timeout`、`pi_error` | Pi 未能及时应答，或无法执行该命令。 |
| `too_many_requests` | 此连接上等待执行的命令过多。 |
| `internal_error` | Host 无法完成该请求。 |

## 会话通道

`"ch":"session"` 且带 `sid` 的信封，承载某个会话的 Pi RPC；该会话必须已由设备在同一连接上通过 `session.open` 打开。

- **设备 → Host：**每个信封一条 Pi RPC 命令（不使用 `seq`，可为 0）。同一会话的命令按发送顺序到达 Pi；一条命令不必等前一条的响应（所以 `abort_bash` 能中断正在运行的 `bash`）。设备命令中的 `id` 会原样出现在响应里。Pi 在 60 秒内没有回应的命令以 `pi_timeout` 失败，Host 随后停止这个已不再响应的 Pi 进程（流以 `wilco_session_stopped` 结束；再次打开会话时重新启动 Pi）。`bash` 和 `compact` 要等工作完成 Pi 才回应，因此不设时限。
- **Host → 设备，流记录：**Pi 的事件，在该会话的 `epoch` 内由 `seq` 从 1 开始编号。断线续传补发的就是这些记录。
- **Host → 设备，响应：**对本设备命令的响应，或采用 Pi 响应格式的错误（`{"type":"response","id","command","success":false,"error","code"}`，code 见上表），`seq` 为 0：响应不属于流，永不补发。来自 Pi 的响应带有 `ack`：Pi 在它之前写出的最后一条流记录的 `seq`（本 epoch 内没有则为 0）。响应和流记录分开传输，到达顺序不定；`ack` 说明 `get_messages` 这类响应已经包含了哪些记录。另有一条 Host 记录也使用 `seq` 0：`{"type":"wilco_session_stopped"}`，在 Host 为落后的设备恢复流、却发现会话已经停止时发送。
- 共享工作区以外的 Host 文件系统路径会被替换为 `"<outside-workspace>"`，会话文件路径替换为不透明的 `"session:…"` 标识。
- 有三种记录来自 Host 而不是 Pi：`{"type":"wilco_session_stopped","code"?}`，表示会话的 Pi 进程已结束，是流的最后一条记录；`{"type":"wilco_records_dropped","count"}`，代替无法读取或不是 JSON 对象的 Pi 输出（这类输出不会被转发）；`{"type":"wilco_dialog_closed","id"}`，表示某个询问（`extension_ui_request` 对话框：`select`、`confirm`、`input`、`editor`）因某台设备作答或超过 `timeout` 而不再等待。
- **等待中的询问。**Host 会保留 Pi 提出的每个对话框，直到它被回答、过期或会话停止。每个询问只接受一个回答，可以来自会话通道或 `dialog.answer`；之后的回答得到 `unknown_dialog`。当 `session.opened` 为 `resync` 时，仍在等待的询问会以 `seq` 0 再次发送，让错过它们（或重新连接）的设备仍能作答；设备对同一 `id` 只保留一个询问。有询问在等待的会话不会因空闲而被关闭。

## 断线续传

客户端在 `session.open` 中带上它最后看到的 `epoch` 和 `lastSeq`。如果缺失的会话记录还在缓冲里，Host 会补发（`replaying`）。如果 epoch 变了，或者缺口已经不在缓冲中，Host 回复 `resync`，客户端改用 Pi 的 `get_entries` 游标和 `get_state` 追上进度。

设备在实时流上落后太多时，Host 从它最后发出的那条记录继续发送；如果这些记录已不在缓冲中，Host 会先主动发送一条不带 `id` 的 `session.opened`，其中 `replay: "resync"`。
