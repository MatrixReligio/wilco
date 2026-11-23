<p align="right"><a href="../en/protocol.md">English</a> · <strong>简体中文</strong></p>

# 协议概览

> 状态：草案。正式规范将连同样本数据和测试向量一起放在 [`Protocol/`](../../Protocol/) 目录。

## 分层

```text
Wilco 信封  { v, seq, ack, ch, sid, body }
      │        ch = "control" → Wilco 控制消息
      │        ch = "session" → body 是未经修改的 Pi RPC 记录
Noise 传输层（ChaCha20-Poly1305，有序记录）
      │
直连 TCP  或  经 Wilco 中继的 WebSocket
```

## 会话通道

`body` 与 Pi RPC 模式读写的内容完全一致：命令、响应、事件和扩展 UI 记录。Host 原样转发这些记录，只有两处例外：把授权工作区以外的绝对路径替换为不透明 ID；可能把高频的流式增量合并成一帧发送。

## 控制通道

承载 Pi 本身不提供的消息：`hello`（版本与能力）、`workspace.list`、`session.list`、`session.open`、`session.release`、`files.*`、`host.status`、`push.register` 和 `device.*`。

## 兼容规则

- 大版本 1 内只做增量变更。新增的字段和消息都是可选的，并由双方在 `hello` 中声明的能力位控制。
- 接收方忽略未知字段，未知的记录类型保留为原始 JSON。
- 对于不认识的 Pi 命令，Host 返回 `unsupported_by_host` 拒绝执行。

## 断线续传

每个信封都带有序号。重连后，客户端发送自己收到的最后一个 `seq`。Host 从有界缓冲区中补发缺失的记录；如果缺口超出缓冲范围，则返回 `resync`，由客户端通过 Pi 的 `get_entries since=<entryId>` 游标补齐。

## 样本（Fixtures）

Wilco 的协议代码用真实的 Pi RPC 模式交互记录来测试，存放在 [`Protocol/fixtures/pi/<版本>/`](../../Protocol/README.md#pi-fixtures)。每个文件都是 JSON Lines，每行为 `{"dir":"send"|"recv","record":{…}}`（刻意构造的非法输入记为 `{"dir":"send","raw":"…"}`）。这些样本由 [`Tools/fixture-recorder`](../../Tools/fixture-recorder/README.zh-CN.md) 生成：它在一次性的临时 HOME 中让 Pi 对接一个按脚本回复的 mock 模型，并把 id、时间戳和路径归一化，确保重复录制结果一致。Pi 发布新版本后，录制新样本并运行契约测试，就能准确看到线上格式的变化。
