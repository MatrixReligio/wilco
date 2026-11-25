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
| `dialog` | 对象？ | 用于 `approval`：正在等待的 `extension_ui_request` 的 `{id, method, title, message?}` |
| `detail` | 字符串？ | 运行失败的原因，或 Pi 最后回答的开头；最多 300 个字符 |
| `steps` | 整数？ | 本次运行中 Pi 使用的工具数 |
| `duration` | 数字？ | 本次运行用时（秒） |

消息放不下时，Host 先缩短 `detail`，再缩短 `dialog.message`，并以"…"结尾。

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

APNs 收到 `{"aps":{"alert":{"loc-key":"PUSH_FALLBACK_<CATEGORY>"},"mutable-content":1,"sound":"default","category":"WILCO_<CATEGORY>","thread-id":…},"w":<sealed>}`，推送类型 `alert`。设备上的通知服务扩展打开 `w` 并写出通知内容；只有打不开时才显示本地化的备用文字。`finished` 通知没有声音，优先级为 5；其他为 10。

实时活动更新：

| 字段 | 含义 |
|---|---|
| `token`、`environment` | 同上；令牌是该实时活动的推送令牌 |
| `kind` | `"activity"` |
| `event` | `"update"` 或 `"end"` |
| `state` | `{status, steps, startedAt, needsApproval, dialog?}`：`status` 为 `"working"`、`"needsYou"`、`"idle"` 或 `"failed"`；`steps` 为 0–100000；`startedAt` 为自 2001-01-01 UTC 起的整秒数（ActivityKit 读取日期的方式）；`dialog` 最多 64 个字符 |
| `staleAfter` | 可选，秒数（1–28800），超过后系统把该活动显示为已过时 |

APNs 收到 `{"aps":{"timestamp":…,"event":…,"content-state":<state>,"stale-date"?:…}}`，推送类型 `liveactivity`；`needsApproval` 为真时优先级 10，否则为 5。实时活动的内容不是秘密：它就是锁屏上显示的内容。

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

服务不保存任何内容。限流使用令牌的 SHA-256，而不是令牌本身。
