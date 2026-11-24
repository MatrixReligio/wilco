<p align="right"><a href="../en/self-hosting-relay.md">English</a> · <strong>简体中文</strong></p>

# 自建中继

当 iPhone 或 iPad 与 Mac 不在同一网络时，Wilco 会通过中继连接。默认使用的是官方托管的 Wilco 中继 `wss://wilco-relay.matrixreligio.com`。设备与 Mac 之间的所有内容都经过端到端加密，中继只是转发它读不懂的字节。你也可以在自己的 Cloudflare 账号上部署中继。

## 中继能看到什么

- 你的 Host 的频道 ID（由 Mac 生成的密钥推导而来），以及设备所用中继令牌的 ID。
- 设备何时连接、发送了多少数据，以及连接来源的 IP 地址。

它看不到你的会话、提示词、文件、命令，也看不到 Pi 的回复。详见[中继协议](../../Protocol/relay.zh-CN.md)。

## 准备

- 一个 Cloudflare 账号。个人使用，免费计划就够了。
- Node.js 22.12 或更高版本。

## 部署

1. 克隆本仓库，进入 `Relay/` 目录：

   ```sh
   cd Relay
   npm ci
   npx wrangler login
   npx wrangler deploy
   ```

2. wrangler 会输出 Worker 的地址，例如 `https://wilco-relay.<你的子域名>.workers.dev`。把开头换成 `wss://` 就是你的中继地址：`wss://wilco-relay.<你的子域名>.workers.dev`。

3. 确认它能正常响应：

   ```sh
   curl https://wilco-relay.<你的子域名>.workers.dev/health
   ```

   输出 `ok` 即可。

请按上面的方式使用默认环境。`wrangler.toml` 里的 `production` 环境是官方托管中继自己的配置。

### 使用自己的域名（可选）

如果你的域名托管在 Cloudflare 上，在 `wrangler.toml` 的顶层（不要放在 `[env.production]` 下）加一条路由，然后重新部署：

```toml
routes = [{ pattern = "relay.example.com", custom_domain = true }]
```

这样你的中继地址就是 `wss://relay.example.com`。

## 启用

在 Mac 上打开 **Wilco Host → 连接**，在 **中继** 部分的 **中继地址** 里填入你的中继地址，然后点 **使用**。Mac 连上中继后，状态会显示 **已连接**。把地址清空即可改回官方中继。

如果你用命令行运行 Host，启动时加上 `wilcod --relay wss://你的中继地址`。

更换中继时正在连接的设备会立刻收到新地址；其他设备下次在局域网内连接时会收到。新生成的配对码也会带上新地址。

中继地址必须以 `wss://` 开头。唯一的例外是 `ws://localhost`（或 `127.0.0.1`），用于开发时在同一台电脑上运行的中继。

## 在本地试运行

```sh
cd Relay
npm run dev
```

这会在 `ws://localhost:8787` 运行中继，同一台 Mac 上的 Host 可以直接使用。`npm test` 会运行中继的测试。

## 限额

以下设置位于 `wrangler.toml` 的 `[vars]` 中：

| 设置 | 默认值 | 含义 |
| --- | --- | --- |
| `MAX_FRAME_BYTES` | 1048576 | 单条消息的最大字节数 |
| `MAX_DEVICES` | 32 | 同时连接到一个 Host 的设备数 |
| `CHANNEL_BYTES_PER_MINUTE` | 67108864 | 每分钟允许通过一个 Host 频道的流量 |
| `IDLE_SECONDS` | 600 | 连接静默多久后被关闭（秒） |

## 推送通知

推送通知计划在 M3 里程碑实现。推送将使用 Wilco 的 APNs 密钥发送，该密钥只保存在官方托管的推送服务中。因此即使你自建了中继，推送仍会经过官方推送服务。通知内容将是端到端加密的，推送服务只能看到密文和设备令牌。
