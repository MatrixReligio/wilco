import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import {
  authMessage, base64url, channelFor, decodeFrame, encodeFrame, FrameType, fromBase64url, isChannelID, parseToken,
  tokenMessage, verify,
} from './wire';

/** What a WebSocket is to this channel, kept across hibernation. */
type Attachment =
  | { role: 'host'; channel: string; nonce: string; authed: boolean; nextConnection: number; epoch: string; since: number }
  | { role: 'device'; connection: number; token: string; epoch: string };

const Close = {
  normal: 1000,
  unsupported: 1003,
  tooBig: 1009,
  hostGone: 1012,
  unauthorized: 4401,
  revoked: 4403,
  idle: 4408,
  replaced: 4409,
  rateLimited: 4429,
} as const;

/** One Host channel: its Host connection, the device connections multiplexed over it. */
export class ChannelObject extends DurableObject<Env> {
  /** Last traffic per device connection (in memory; a woken object starts the clock again). */
  private activity = new Map<string, number>();
  private window = { start: 0, bytes: 0 };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private get maxFrame() { return Number(this.env.MAX_FRAME_BYTES) || 1 << 20; }
  private get maxDevices() { return Number(this.env.MAX_DEVICES) || 32; }
  private get bytesPerMinute() { return Number(this.env.CHANNEL_BYTES_PER_MINUTE) || 64 << 20; }
  private get idleMs() { return (Number(this.env.IDLE_SECONDS) || 600) * 1000; }
  /** How long a Host connection has to answer the challenge. */
  private static authMs = 10_000;
  /** Unauthenticated Host connections a channel holds at once. */
  private static maxPending = 4;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const [, , kind, channel] = url.pathname.split('/');
    if (!isChannelID(channel)) return new Response('not found', { status: 404 });
    return kind === 'host' ? this.acceptHost(channel) : this.acceptDevice(channel, url.searchParams.get('token'));
  }

  // MARK: Host

  private async acceptHost(channel: string): Promise<Response> {
    // A full set of unauthenticated connections makes room by closing the oldest, so nobody can
    // lock the Host out by holding them: the Host answers its challenge long before it is evicted.
    const pending = this.ctx.getWebSockets('host')
      .map((ws) => ({ ws, state: ws.deserializeAttachment() as Extract<Attachment, { role: 'host' }> }))
      .filter(({ state }) => !state.authed)
      .sort((a, b) => a.state.since - b.state.since);
    for (const { ws } of pending.slice(0, Math.max(0, pending.length - ChannelObject.maxPending + 1))) {
      close(ws, Close.unauthorized, 'too many unauthenticated connections');
    }
    const { 0: client, 1: server } = new WebSocketPair();
    const nonce = base64url(crypto.getRandomValues(new Uint8Array(32)));
    this.ctx.acceptWebSocket(server, ['host']);
    // The epoch tells this Host connection's device connections from an earlier one's.
    const epoch = base64url(crypto.getRandomValues(new Uint8Array(9)));
    const since = Date.now();
    server.serializeAttachment({ role: 'host', channel, nonce, authed: false, nextConnection: 1, epoch, since } satisfies Attachment);
    server.send(JSON.stringify({ type: 'challenge', nonce }));
    await this.wakeBy(since + ChannelObject.authMs);
    return new Response(null, { status: 101, webSocket: client });
  }

  private host(): WebSocket | undefined {
    return this.ctx.getWebSockets('host').find((ws) => (ws.deserializeAttachment() as Attachment | null)?.role === 'host'
      && (ws.deserializeAttachment() as Extract<Attachment, { role: 'host' }>).authed);
  }

  private async hostMessage(ws: WebSocket, state: Extract<Attachment, { role: 'host' }>, message: string | ArrayBuffer) {
    if (!state.authed) {
      if (typeof message !== 'string' || !(await this.authenticate(state, message))) {
        return close(ws, Close.unauthorized, 'authentication failed');
      }
      for (const other of this.ctx.getWebSockets('host')) if (other !== ws) close(other, Close.replaced, 'replaced');
      for (const device of this.ctx.getWebSockets('device')) close(device, Close.hostGone, 'host reconnected');
      this.activity.clear();
      ws.serializeAttachment({ ...state, authed: true, nonce: '' } satisfies Attachment);
      ws.send(JSON.stringify({ type: 'ready' }));
      return;
    }
    if (typeof message === 'string') {
      let parsed: { type?: unknown; id?: unknown };
      try { parsed = JSON.parse(message); } catch { return; }
      if (parsed.type === 'revoke' && typeof parsed.id === 'string' && fromBase64url(parsed.id)?.length === 16) {
        await this.ctx.storage.put('revoked:' + parsed.id, true);
        for (const device of this.ctx.getWebSockets('token:' + parsed.id)) close(device, Close.revoked, 'revoked');
      }
      return;
    }
    if (message.byteLength > this.maxFrame + 5) return close(ws, Close.tooBig, 'frame too large');
    const frame = decodeFrame(new Uint8Array(message));
    if (!frame || frame.type === FrameType.open) return;
    const device = this.ctx.getWebSockets(connectionTag(state.epoch, frame.connection))[0];
    if (!device) return;
    if (frame.type === FrameType.close) return close(device, Close.normal, 'closed by host');
    if (!this.count(frame.payload.byteLength)) return close(device, Close.rateLimited, 'rate limited');
    this.activity.set(connectionTag(state.epoch, frame.connection), Date.now());
    device.send(frame.payload);
  }

  private async authenticate(state: Extract<Attachment, { role: 'host' }>, message: string): Promise<boolean> {
    let auth: { type?: unknown; key?: unknown; sig?: unknown };
    try { auth = JSON.parse(message); } catch { return false; }
    if (auth.type !== 'auth' || typeof auth.key !== 'string' || typeof auth.sig !== 'string') return false;
    const key = fromBase64url(auth.key), signature = fromBase64url(auth.sig), nonce = fromBase64url(state.nonce);
    if (!key || !signature || !nonce || nonce.length !== 32) return false;
    if ((await channelFor(key)) !== state.channel) return false;
    if (!(await verify(key, signature, authMessage(state.channel, nonce)))) return false;
    await this.ctx.storage.put('hostKey', auth.key);
    return true;
  }

  // MARK: Devices

  private async acceptDevice(channel: string, tokenText: string | null): Promise<Response> {
    const token = tokenText === null ? null : parseToken(tokenText);
    if (!token) return new Response('missing or malformed token', { status: 401 });
    const hostKey = fromBase64url((await this.ctx.storage.get<string>('hostKey')) ?? '');
    if (!hostKey || hostKey.length !== 32) return new Response('host not connected', { status: 503 });
    if (!(await verify(hostKey, token.signature, tokenMessage(channel, token.body)))) {
      return new Response('token not issued by this host', { status: 401 });
    }
    const id = base64url(token.id);
    if (token.expiry !== 0 && token.expiry <= Date.now() / 1000) return new Response('token expired', { status: 403 });
    if (await this.ctx.storage.get('revoked:' + id)) return new Response('token revoked', { status: 403 });
    const host = this.host();
    if (!host) return new Response('host not connected', { status: 503 });
    if (this.ctx.getWebSockets('device').length >= this.maxDevices) return new Response('too many connections', { status: 429 });

    const hostState = host.deserializeAttachment() as Extract<Attachment, { role: 'host' }>;
    const connection = hostState.nextConnection;
    host.serializeAttachment({ ...hostState, nextConnection: connection + 1 } satisfies Attachment);
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, ['device', connectionTag(hostState.epoch, connection), 'token:' + id]);
    server.serializeAttachment({ role: 'device', connection, token: id, epoch: hostState.epoch } satisfies Attachment);
    this.activity.set(connectionTag(hostState.epoch, connection), Date.now());
    host.send(encodeFrame(FrameType.open, connection, token.id));
    await this.wakeBy(Date.now() + this.idleMs / 2);
    return new Response(null, { status: 101, webSocket: client });
  }

  private deviceMessage(ws: WebSocket, state: Extract<Attachment, { role: 'device' }>, message: string | ArrayBuffer) {
    if (typeof message === 'string') return close(ws, Close.unsupported, 'binary messages only');
    if (message.byteLength > this.maxFrame) return close(ws, Close.tooBig, 'message too large');
    if (!this.count(message.byteLength)) return close(ws, Close.rateLimited, 'rate limited');
    const host = this.host();
    if (!host || (host.deserializeAttachment() as Extract<Attachment, { role: 'host' }>).epoch !== state.epoch) {
      return close(ws, Close.hostGone, 'host not connected');
    }
    this.activity.set(connectionTag(state.epoch, state.connection), Date.now());
    host.send(encodeFrame(FrameType.data, state.connection, new Uint8Array(message)));
  }

  /** Counts bytes against the channel's rate; false once it is used up. */
  private count(bytes: number): boolean {
    const now = Date.now();
    if (now - this.window.start >= 60_000) this.window = { start: now, bytes: 0 };
    this.window.bytes += bytes;
    return this.window.bytes <= this.bytesPerMinute;
  }

  // MARK: WebSocket events

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const state = ws.deserializeAttachment() as Attachment | null;
    if (state?.role === 'host') await this.hostMessage(ws, state, message);
    else if (state?.role === 'device') this.deviceMessage(ws, state, message);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    this.ended(ws);
    close(ws, code === 1005 || code === 1006 ? Close.normal : code, reason);
  }

  async webSocketError(ws: WebSocket) {
    this.ended(ws);
  }

  private ended(ws: WebSocket) {
    const state = ws.deserializeAttachment() as Attachment | null;
    if (state?.role === 'device') {
      this.activity.delete(connectionTag(state.epoch, state.connection));
      const host = this.host();
      // Only the Host connection that opened it hears that it ended.
      if (host && (host.deserializeAttachment() as Extract<Attachment, { role: 'host' }>).epoch === state.epoch) {
        host.send(encodeFrame(FrameType.close, state.connection));
      }
    } else if (state?.role === 'host' && state.authed) {
      for (const device of this.ctx.getWebSockets('device')) close(device, Close.hostGone, 'host disconnected');
      this.activity.clear();
    }
  }

  /** Makes sure the alarm fires no later than `time`. */
  private async wakeBy(time: number) {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > time) await this.ctx.storage.setAlarm(time);
  }

  /** Closes Host connections that never authenticated and device connections quiet for too long. */
  async alarm() {
    const now = Date.now();
    let next = Infinity;
    for (const ws of this.ctx.getWebSockets('host')) {
      const state = ws.deserializeAttachment() as Extract<Attachment, { role: 'host' }>;
      if (state.authed) continue;
      if (now - state.since >= ChannelObject.authMs) close(ws, Close.unauthorized, 'authentication timed out');
      else next = Math.min(next, state.since + ChannelObject.authMs);
    }
    const devices = this.ctx.getWebSockets('device');
    for (const device of devices) {
      const state = device.deserializeAttachment() as Extract<Attachment, { role: 'device' }>;
      const tag = connectionTag(state.epoch, state.connection);
      const last = this.activity.get(tag);
      if (last === undefined) this.activity.set(tag, now);
      else if (now - last >= this.idleMs) close(device, Close.idle, 'idle');
    }
    if (this.ctx.getWebSockets('device').length > 0) next = Math.min(next, now + this.idleMs / 2);
    if (next !== Infinity) await this.ctx.storage.setAlarm(next);
  }

  /** Tests: makes every unauthenticated Host connection look overdue. */
  ageUnauthenticated() {
    for (const ws of this.ctx.getWebSockets('host')) {
      const state = ws.deserializeAttachment() as Extract<Attachment, { role: 'host' }>;
      if (!state.authed) ws.serializeAttachment({ ...state, since: 0 } satisfies Attachment);
    }
  }

  /** Tests: makes every device connection look idle. */
  forgetActivity() {
    for (const key of this.activity.keys()) this.activity.set(key, 0);
  }
}

function connectionTag(epoch: string, connection: number): string {
  return 'connection:' + epoch + ':' + connection;
}

function close(ws: WebSocket, code: number, reason: string) {
  try { ws.close(code, reason); } catch { /* already closed */ }
}
