<p align="right"><a href="../en/architecture.md">English</a> · <strong>简体中文</strong></p>

# 架构

Wilco 由四部分组成。Pi 始终是唯一的 agent：Wilco 负责启动、跟随和控制 Pi，但从不取代它。

| 组成部分 | 运行位置 | 职责 | 源码 |
| --- | --- | --- | --- |
| Wilco App | iPhone、iPad | 遥控器：会话、对话、工具时间线、审批、实时活动 | 闭源 |
| Wilco Host | 你的 Mac | 后台服务 `wilcod`，加上菜单栏 App 和仪表盘。负责 Pi 进程、配对、工作区和连接 | 闭源 |
| Wilco 中继 | Cloudflare | 你不在家时转发加密流量；发送加密推送 | 开源（`Relay/`） |
| Pi 扩展 | Pi 内部 | `wilco-bridge` 接入 Pi TUI 会话；`wilco-guard` 在有风险的工具调用前请求批准 | 开源（`Bridge/`） |

## 数据流

```text
Wilco App ─┬─ 局域网 / 直连 TCP ─────────────┐
           └─ WebSocket ─ Wilco 中继 ────────┤  相同的端到端加密记录
                                             ▼
                                   wilcod（Wilco Host）
                                   ├─ pi --mode rpc   ← 每个活跃会话一个进程
                                   └─ Unix socket ← Pi TUI + wilco-bridge
```

## 设计原则

1. **以 Pi 为准。** Pi 的 JSONL 会话文件是对话的唯一持久记录。App 在打开会话时从 Host 读取，不保存副本；Host 和中继都不保存对话内容。
2. **薄 Host，原生消息。** 在会话通道上，Wilco 把 Pi 官方 RPC 消息原样装进一个小信封（序号、会话 ID）中传输。Host 只补充 Pi 不提供的能力：配对、工作区、会话列表、文件、推送和能力协商。
3. **前向兼容。** App 解码已知的消息类型，未知类型保留为原始 JSON 并用通用视图显示。即使 Pi 升级新增了事件，App 也不会出错。
4. **每个会话只有一个写入者。** 一个会话要么由 Host 启动的 Pi RPC 进程驱动，要么由加载了 `wilco-bridge` 的 Pi TUI 驱动，二者不会同时进行。在安全的时机，Host 会负责移交控制权。
5. **最小暴露。** 只有你授权的工作区可见。授权范围外的绝对路径在离开 Mac 之前会被替换成不透明标识。

## 连接

App 会同时尝试所有线路，保留最先连通的那一条：局域网（通过 Bonjour 发现）、已保存的直连地址（例如 Tailscale 地址），以及 Wilco 中继。连接中断后，App 会自动重连，并从收到的最后一个序号继续。如果缺口太大，就用 Pi 的持久游标（`get_entries since`）补齐。

另见：[安全模型](security-model.md) · [协议概览](protocol.md)
