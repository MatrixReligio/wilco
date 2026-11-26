<p align="right"><a href="push.md">English</a> · <strong>简体中文</strong></p>

# 推送（协议版本 1）

Wilco Host 通过通知告诉设备有询问在等待回答，或者某次运行已经完成或失败；并让会话的实时活动（Live Activity）保持最新。Host 把每条通知加密封装给目标设备；推送服务（[`Push/`](../Push/)）把它转交给 Apple 推送通知服务（APNs），自己无法读取内容。

## 封装的消息

设备为通知生成一对 Curve25519 密钥，并把公钥和推送令牌交给 Host。Host 用 HPKE（[RFC 9180](https://www.rfc-editor.org/rfc/rfc9180)，base 模式）封装每条消息：DHKEM(X25519, HKDF-SHA256)、HKDF-SHA256、ChaCha20-Poly1305，`info` = `"wilco-push-v1"`，关联数据为空。

封装格式：`[1 字节：版本 1][32 字节：封装密钥][密文]`，最多 2800 字节。设备拒绝其他版本。

明文是一个 JSON 对象：

| 字段 | 类型 | 含义 |
|---|---|---|
| `kind` | `"approval"`、`"finished"` 或 `"failed"` | 发生了什么 |
| `hostID`、`hostName` | 字符串 | Host |
| `workspaceID`、`workspaceName` | 字符串 | 文件夹 |
| `sessionID` | 字符串 | 会话 |
| `sessionName` | 字符串？ | 会话名称 |
| `dialog` | 对象？ | 用于 `approval`：正在等待的 `extension_ui_request` 的 `{id, method, title, message?, shortened?}` |
| `detail` | 字符串？ | 运行失败的原因，或 Pi 最后回答的开头；最多 300 个字符 |
| `steps` | 整数？ | 本次运行中 Pi 使用的工具数 |
| `duration` | 数字？ | 本次运行用时（秒） |

名称（`hostName`、`workspaceName`、`sessionName`）最多 100 个字符。消息放不下时，Host 依次缩短 `detail`、`dialog.message`、`dialog.title`，并以"…"结尾；被缩短的询问带有 `dialog.shortened: true`，设备不会在通知中为它提供回答按钮。

## 推送服务

`POST /v1/push`，正文为 JSON（最多 8 KB）。未知字段会被忽略。

提醒（alert）：

| 字段 | 含义 |
|---|---|
| `token` | 设备的 APNs 令牌，64–200 位十六进制数字 |
| `environment` | `"production"` 或 `"sandbox"`（开发构建） |
| `kind` | `"alert"` |
| `category` | `"approval"`、`"finished"` 或 `"failed"` |
| `sealed` | 封装后的消息，base64 |
| `thread` | base64url，最多 64 个字符：把同一会话的通知归为一组 |
| `collapse` | 可选，最多 64 个字符：取值相同的新通知会替换旧通知 |

APNs 收到 `{"aps":{"alert":{"loc-key":"PUSH_FALLBACK_<CATEGORY>"},"mutable-content":1,"sound":"default","category":"WILCO_UNOPENED","thread-id":…},"w":<sealed>}`，推送类型 `alert`。设备上的通知服务扩展打开 `w`，写出通知内容并设置真正的类别（及其按钮）；只有打不开时才显示本地化的备用文字，且没有按钮。`finished` 通知没有声音，优先级为 5；其他为 10。

实时活动更新：

| 字段 | 含义 |
|---|---|
| `token`、`environment` | 同上；令牌是该实时活动的推送令牌 |
| `kind` | `"activity"` |
| `event` | `"update"` 或 `"end"` |
| `state` | `{status, steps, startedAt, needsApproval, dialog?}`：`status` 为 `"working"`、`"needsYou"`、`"idle"` 或 `"failed"`；`steps` 为 0–100000；`startedAt` 为自 2001-01-01 UTC 起的整秒数（ActivityKit 读取日期的方式）；`dialog` 是正在等待的询问的 `id`（最多 64 个字符），而不是它的文字 |
| `staleAfter` | 可选，秒数（1–28800），超过后系统把该活动显示为已过时 |
| `dismissAfter` | 可选，仅用于 `end`：秒数（0–14400），之后系统移除已结束的活动；0 表示立即移除 |

APNs 收到 `{"aps":{"timestamp":…,"event":…,"content-state":<state>,"stale-date"?:…,"dismissal-date"?:…}}`，推送类型 `liveactivity`；`needsApproval` 为真时优先级 10，否则为 5。实时活动的内容没有加密，因此不包含会话中的任何文字：只有计数、时间和询问的 id。

只有当正在等待的询问是“是或否”类型（`method` 为 `"confirm"`）时，`needsApproval` 才为真，此时 `dialog` 是它的 `id`。其他询问两者都不带：实时活动只能打开 App。

## 设备端

Wilco App 遵循以下规则，其他客户端也应如此。

- **在通知上批准。** `approval` 通知只有在完整显示询问内容时才提供“批准”和“拒绝”：最多 200 个字符的 `confirm`，且只包含字母、数字、标点、符号和普通空格。不允许换行、其他不可见字符和组合用字符，因此被批准的内容里藏不了东西。对 wilco-guard 的询问，以 `dialog.message` 中的完整命令为准，而不是缩短后的标题。其他询问会打开 App。两个按钮都需要先解锁设备。
- **无法打开的消息。** 如果设备无法打开加密消息（没有密钥，或版本不同），它会显示推送附带的备用文字，没有按钮，点按也不会执行任何操作。
- **实时活动。** 实时活动显示进度、步数和运行开始以来的时间，以及文件夹和 Host 的名称。`needsApproval` 为真时，它提供“拒绝”（以 `dialog` 为 id 回答该询问）和一个打开该询问的按钮。它从不提供“批准”：它不显示命令。

回复：

| 状态码 | 含义 |
|---|---|
| `202` | APNs 已接受 |
| `400` | 请求无效：`{error}` |
| `410` | 令牌永久失效（`Unregistered`、`BadDeviceToken`、`DeviceTokenNotForTopic`）：`{reason}`。Host 随即删除该令牌。 |
| `413` | 正文超过 8 KB |
| `429` | 推送过多：每个令牌每分钟 30 条，每个发送地址每分钟 300 条 |
| `502` | APNs 拒绝或无法连接：稍后重试 |
| `503` | 服务尚未配置 |

服务不保存任何内容。限流使用令牌的 SHA-256，而不是令牌本身。每次推送的实时日志只有 HTTP 状态、`kind`、`environment` 和 APNs 的 `reason`。
