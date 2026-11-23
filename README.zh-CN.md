<p align="center"><a href="README.md">English</a> · <strong>简体中文</strong></p>

# Wilco

**Pi 在家里干活，你在哪儿都能指挥。**

Wilco 是 [Pi coding agent](https://github.com/earendil-works/pi) 的原生 iPhone / iPad 客户端。你可以在任何地方启动、跟进、引导和批准运行在自己 Mac 上的 Pi 会话，代码、凭据和对话记录都不会离开那台 Mac。

> *Wilco* 是无线电用语 "will comply" 的缩写，意思是"收到，照办"。你下指令，agent 去执行。

> [!IMPORTANT]
> Wilco 还处于早期开发阶段，本仓库中的内容暂时都不能安装使用。欢迎 Watch 本仓库，或查看下面的[路线图](#路线图)了解进展。

## 为什么选择 Wilco

- **本地优先。** Pi 始终运行在你的 Mac 上，代码仓库、API 密钥和会话历史都不会离开它。Wilco 没有账号体系，也不在云端保存你的对话。
- **全程端到端加密。** 在家里的网络中直接连接；出门在外时经由中继连接，中继只转发它无法解读的密文。推送通知同样是加密的。
- **为 agent 工作流设计，不只是一个聊天框。** 会话像航班信息屏上的航班一样一目了然：状态、当前步骤、上下文用量、花费。工具调用以时间线展示，附带 diff 和终端输出；需要你批准的操作会直接出现在锁屏上。
- **跟随 Pi 一起演进。** Wilco 原样透传 Pi 官方 RPC 消息，而不是另起一套协议。Pi 新增的事件和扩展对话框无需更新 App 就能显示，契约测试会尽早发现协议变化。
- **与终端互通。** 可选的 `wilco-bridge` Pi 扩展让手机可以跟随并驱动你在 Pi TUI 中开启的会话。

## 工作原理

```text
 iPhone / iPad                        你的 Mac
┌──────────────┐   局域网（直连）     ┌──────────────────────────────┐
│  Wilco App   │◄──────────────────►│  Wilco Host (wilcod)         │
│              │                    │   ├─ pi --mode rpc （会话）   │
│              │   互联网            │   ├─ pi --mode rpc （会话）   │
│              │◄──► Wilco 中继 ◄──►│   └─ Pi TUI + wilco-bridge    │
└──────────────┘   （只有密文）      └──────────────────────────────┘
```

1. **Wilco Host** 运行在你的 Mac 上，通过 Pi 官方的 RPC 模式启动 Pi，每个活跃会话一个进程。
2. 用 iPhone 扫一次二维码完成配对。之后双方每次连接都通过 Noise 握手互相认证。
3. App 会同时尝试局域网、可直达的地址（例如 Tailscale）和 Wilco 中继，哪条先连通就用哪条。

详见[架构](docs/zh-CN/architecture.md)和[安全模型](docs/zh-CN/security-model.md)。

## 本仓库包含什么

本仓库收录 Wilco 的开源部分，采用 MIT 许可证：

| 路径 | 内容 |
| --- | --- |
| [`Relay/`](Relay/) | Cloudflare Worker：转发加密流量、发送加密推送。可以自行部署。 |
| [`Bridge/`](Bridge/) | Pi 扩展：`wilco-bridge`（把 Pi TUI 会话接入 Wilco）和 `wilco-guard`（审批策略）。 |
| [`Protocol/`](Protocol/) | Wilco 通信协议规范、测试向量和样本数据。 |
| [`docs/`](docs/) | 中英文用户文档与开发者文档。 |

iOS App 和 Mac Host 在另一个仓库中开发，以签名后的二进制形式发布。

## 路线图

| 里程碑 | 内容 |
| --- | --- |
| M0 地基 | 协议核心、测试基础设施、录制 Pi 样本数据 |
| M1 局域网 MVP | 在家庭网络中完成配对、会话管理、实时对话与工具时间线 |
| M2 随时随地 | Wilco 中继，无缝重连与断点续传 |
| M3 主动触达 | 加密推送、实时活动、锁屏审批、小组件、Siri |
| M4 深度功能 | 会话树与分叉、文件与 diff、用量统计、Pi TUI 的 `wilco-bridge` |
| M5 正式发布 | iPad 打磨、本地化、无障碍、上架 App Store |

## 文档

- [架构](docs/zh-CN/architecture.md)
- [安全模型](docs/zh-CN/security-model.md)
- [协议概览](docs/zh-CN/protocol.md)
- [自建中继](docs/zh-CN/self-hosting-relay.md)
- [常见问题](docs/zh-CN/faq.md)

## 参与贡献

欢迎提交 Issue 和 Pull Request。请先阅读[贡献指南](CONTRIBUTING.zh-CN.md)和[行为准则](CODE_OF_CONDUCT.zh-CN.md)。安全问题请按照[安全政策](SECURITY.zh-CN.md)私下报告，不要公开提交 Issue。

## 许可证

[MIT](LICENSE) © MatrixReligio LLC

Wilco 是独立项目，与 Pi 项目及 Earendil 没有隶属或背书关系。文中提到 "Pi" 仅用于说明兼容性。
