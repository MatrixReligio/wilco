<p align="right"><a href="README.md">English</a> · <strong>简体中文</strong></p>

# Wilco 中继

一个 Cloudflare Worker，让 Wilco 设备在任何网络下都能连到自己的 Host。它转发端到端加密的[安全通道](../Protocol/secure-channel.zh-CN.md)消息，无法读取内容。协议见 [Protocol/relay.zh-CN.md](../Protocol/relay.zh-CN.md)。

每个 Host 频道对应一个 Durable Object。Host 与它保持一条 WebSocket 连接，设备连接在这条连接上多路复用。该对象使用 WebSocket Hibernation API，频道空闲时连接保持打开，但不产生费用。

## 开发

```sh
npm ci
npm test            # 在 Workers 运行时（workerd）中运行，使用较小的限制
npm run typecheck
npm run dev         # 本地中继，地址 http://localhost:8787
```

## 自行部署

见[自建中继](../docs/zh-CN/self-hosting-relay.md)。

## 配置

在 `wrangler.toml` 的 `[vars]` 中设置：

| 变量 | 默认值 | 含义 |
|---|---|---|
| `MAX_FRAME_BYTES` | `1048576` | 单条 WebSocket 消息的最大字节数 |
| `MAX_DEVICES` | `32` | 每个频道的设备连接数 |
| `CHANNEL_BYTES_PER_MINUTE` | `67108864` | 每个频道每分钟转发的字节数 |
| `IDLE_SECONDS` | `600` | 设备连接安静超过这个时长即被关闭 |
