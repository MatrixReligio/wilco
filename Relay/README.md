<p align="right"><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>

# Wilco relay

A Cloudflare Worker that lets Wilco devices reach their Host from anywhere. It forwards end-to-end encrypted [secure-channel](../Protocol/secure-channel.md) messages and cannot read them. The protocol is specified in [Protocol/relay.md](../Protocol/relay.md).

Each Host channel is one Durable Object. The Host keeps one WebSocket open to it, and device connections are multiplexed over that socket. The object uses the WebSocket Hibernation API, so an idle channel costs nothing while its sockets stay open.

## Develop

```sh
npm ci
npm test            # runs in the Workers runtime (workerd), with small limits
npm run typecheck
npm run dev         # local relay on http://localhost:8787
```

## Deploy your own

See [Self-hosting the relay](../docs/en/self-hosting-relay.md).

## Configuration

Set in `wrangler.toml` under `[vars]`:

| Variable | Default | Meaning |
|---|---|---|
| `MAX_FRAME_BYTES` | `1048576` | largest WebSocket message |
| `MAX_DEVICES` | `32` | device connections per channel |
| `CHANNEL_BYTES_PER_MINUTE` | `67108864` | bytes a channel forwards per minute |
| `IDLE_SECONDS` | `600` | a quiet device connection is closed after this long |
