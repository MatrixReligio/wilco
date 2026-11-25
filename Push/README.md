<p align="right"><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>

# Wilco push

A Cloudflare Worker that delivers Wilco Host's notifications and Live Activity updates to devices through Apple Push Notification service. Notifications are sealed by the Host to each device and cannot be read here. The protocol is specified in [Protocol/push.md](../Protocol/push.md).

It keeps nothing: each request is checked, rate-limited and passed to APNs, and APNs's answer is passed back (a token that will never work again comes back as `410`, so the Host forgets it).

## Develop

Needs Node.js 22.12 or later.

```sh
npm ci
npm test            # runs in the Workers runtime (workerd); APNs is replaced by a stand-in
npm run typecheck
```

## Deploy your own

Notifications reach an app only through its own APNs topic and key, so a push service of your own works with a Wilco build you sign yourself, not with the App Store app.

1. In your Apple Developer account, make an APNs key (a `.p8` file) and note its Key ID and your Team ID.
2. Set the secrets (values are read from standard input, never written to a file):

   ```sh
   npx wrangler secret put APNS_PRIVATE_KEY < AuthKey_XXXXXXXXXX.p8
   printf %s "$KEY_ID"  | npx wrangler secret put APNS_KEY_ID
   printf %s "$TEAM_ID" | npx wrangler secret put APNS_TEAM_ID
   printf %s "$BUNDLE"  | npx wrangler secret put APNS_TOPIC   # your app's bundle identifier
   ```

3. `npm run deploy`, then point Wilco Host at the Worker's URL.

## Limits

30 pushes a minute per device token and 300 per minute per sender address (Workers rate-limiting bindings `PUSH_LIMIT` and `IP_LIMIT` in `wrangler.toml`).
