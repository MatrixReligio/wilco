<p align="right"><strong>English</strong> · <a href="../zh-CN/self-hosting-relay.md">简体中文</a></p>

# Self-hosting the relay

> Status: planned for milestone M2. This page describes the intended setup and will be updated with exact commands when the relay ships.

By default, Wilco uses the hosted relay. Because the relay only forwards ciphertext, using it does not expose your data. You may still prefer to run your own.

## Requirements

- A Cloudflare account (the free plan is enough for personal use)
- Node.js and `wrangler`

## Steps (planned)

1. Clone this repository and open `Relay/`.
2. `npm install`, then `npx wrangler login`.
3. `npx wrangler deploy`. Wrangler prints your relay URL.
4. On your Mac, open **Wilco Host → Connectivity → Relay**, choose **Custom relay** and paste the URL.
5. Pair your devices again, or let the host send the new relay address to devices that are already paired.

## Push notifications

Push notifications are sent with Wilco's APNs key, which only the hosted push service holds. If you self-host the relay, push still goes through the hosted push service. Notification content stays end-to-end encrypted, so that service only sees ciphertext and device tokens.
