<p align="right"><strong>English</strong> · <a href="../zh-CN/self-hosting-relay.md">简体中文</a></p>

# Self-hosting the relay

When your iPhone or iPad is not on the same network as your Mac, Wilco connects through a relay. By default that is the hosted Wilco relay at `wss://wilco-relay.matrixreligio.com`. Everything between your devices and your Mac is end-to-end encrypted, so the relay only passes on bytes it cannot read. You can still run your own relay, on your own Cloudflare account.

## What the relay sees

- Your Host's channel ID (derived from a key your Mac creates) and the IDs of the relay tokens your devices use.
- When devices connect, how much they send, and the IP addresses they connect from.

It never sees your sessions, prompts, files, commands or Pi's replies. The [relay protocol](../../Protocol/relay.md) has the details.

## Requirements

- A Cloudflare account. The free plan is enough for personal use.
- Node.js 22.12 or later.

## Deploy

1. Clone this repository and open the `Relay/` folder:

   ```sh
   cd Relay
   npm ci
   npx wrangler login
   npx wrangler deploy
   ```

2. Wrangler prints the Worker's address, such as `https://wilco-relay.<your-subdomain>.workers.dev`. Your relay address is the same with `wss://`: `wss://wilco-relay.<your-subdomain>.workers.dev`.

3. Check that it answers:

   ```sh
   curl https://wilco-relay.<your-subdomain>.workers.dev/health
   ```

   It prints `ok`.

Use the default environment, as above. The `production` environment in `wrangler.toml` is the hosted relay's own configuration.

### Your own domain (optional)

If your domain is on Cloudflare, add a route to `wrangler.toml` (top level, not under `[env.production]`) and deploy again:

```toml
routes = [{ pattern = "relay.example.com", custom_domain = true }]
```

Your relay address is then `wss://relay.example.com`.

## Use it

On your Mac, open **Wilco Host → Connection**. Under **Relay**, enter your relay address in **Relay address** and click **Use**. The status shows **Connected** once your Mac has reached it. Leave the address empty to go back to the hosted relay.

If you run the Host from the command line, start it with `wilcod --relay wss://your-relay-address`.

Devices that are connected when you change the relay are told the new address at once. Others learn it the next time they connect on your local network. New pairing codes include it.

Relay addresses must start with `wss://`. The only exception is `ws://localhost` (or `127.0.0.1`), for a relay running on the same computer while you develop.

## Try it locally

```sh
cd Relay
npm run dev
```

This runs the relay at `ws://localhost:8787`, which a Host on the same Mac can use. `npm test` runs the relay's tests.

## Limits

These settings are in `[vars]` in `wrangler.toml`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `MAX_FRAME_BYTES` | 1048576 | Largest message, in bytes |
| `MAX_DEVICES` | 32 | Devices connected to one Host at the same time |
| `CHANNEL_BYTES_PER_MINUTE` | 67108864 | Traffic allowed through one Host's channel per minute |
| `IDLE_SECONDS` | 600 | Time before a silent connection is closed |

## Push notifications

Push notifications are planned for milestone M3. They will be sent with Wilco's APNs key, which only the hosted push service holds. So even if you run your own relay, push will still go through the hosted push service. Notification content will be end-to-end encrypted, so that service will only see ciphertext and device tokens.
