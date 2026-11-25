<p align="right"><a href="README.md">English</a> · <strong>简体中文</strong></p>

# Wilco 推送

一个 Cloudflare Worker，通过 Apple 推送通知服务把 Wilco Host 的通知和实时活动更新送到设备上。通知由 Host 为每台设备单独封装加密，这里无法读取。协议见 [Protocol/push.zh-CN.md](../Protocol/push.zh-CN.md)。

它不保存任何内容：每个请求经过校验和限流后转交给 APNs，再把 APNs 的答复原样返回（永久失效的令牌返回 `410`，Host 随即删除它）。

## 开发

需要 Node.js 22.12 或更高版本。

```sh
npm ci
npm test            # 在 Workers 运行时（workerd）中运行；APNs 由替身代替
npm run typecheck
```

## 自行部署

通知只能通过 App 自己的 APNs 主题和密钥送达，所以自建的推送服务适用于你自己签名的 Wilco 构建，不适用于 App Store 版本。

1. 在 Apple 开发者账号中创建一个 APNs 密钥（`.p8` 文件），记下它的 Key ID 和你的 Team ID。
2. 设置密钥（值从标准输入读取，不写入任何文件）：

   ```sh
   npx wrangler secret put APNS_PRIVATE_KEY < AuthKey_XXXXXXXXXX.p8
   printf %s "$KEY_ID"  | npx wrangler secret put APNS_KEY_ID
   printf %s "$TEAM_ID" | npx wrangler secret put APNS_TEAM_ID
   printf %s "$BUNDLE"  | npx wrangler secret put APNS_TOPIC   # 你的 App 的 bundle identifier
   ```

3. 运行 `npm run deploy`，然后让 Wilco Host 使用该 Worker 的地址。

## 为什么 App Store 版本使用 Wilco 的推送服务

Apple 只会投递用与 App 同一开发者团队的密钥、发往该 App bundle identifier 的通知。App Store 版本由 Wilco 的团队签名，因此只有 Wilco 的推送服务能送达它；你自建的服务只能送达你自己签名的构建。这样做几乎没有损失：通知在你的 Mac 上就已加密，只有你的设备能解开，推送服务只能看到设备 token、时间和每条消息的大小，看不到内容。

## 限制

每个设备令牌每分钟 30 条，每个发送地址每分钟 300 条（`wrangler.toml` 中的 Workers 限流绑定 `PUSH_LIMIT` 与 `IP_LIMIT`）。
