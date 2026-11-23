<p align="right"><a href="../en/self-hosting-relay.md">English</a> · <strong>简体中文</strong></p>

# 自建中继

> 状态：计划于 M2 里程碑实现。本页描述的是预期的部署方式，中继发布后会补上准确的命令。

Wilco 默认使用官方托管的中继。中继只转发密文，所以使用它并不会暴露你的数据。不过你也可以选择自行部署。

## 准备

- 一个 Cloudflare 账号（个人使用免费计划即可）
- Node.js 和 `wrangler`

## 步骤（计划）

1. 克隆本仓库，进入 `Relay/` 目录。
2. 执行 `npm install`，然后执行 `npx wrangler login`。
3. 执行 `npx wrangler deploy`，wrangler 会输出你的中继地址。
4. 在 Mac 上打开 **Wilco Host → 连接 → 中继**，选择 **自定义中继**，粘贴该地址。
5. 重新配对设备，或者让 Host 把新的中继地址推送给已配对的设备。

## 推送通知

推送通知使用 Wilco 的 APNs 密钥发送，该密钥只保存在官方托管的推送服务中。因此即使你自建了中继，推送仍会经过官方推送服务。通知内容始终是端到端加密的，推送服务只能看到密文和设备令牌。
