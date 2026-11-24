import { SELF } from 'cloudflare:test';
import vectors from '../../Protocol/test-vectors/relay/vectors.json';
import { base64url, channelFor, concat, fromBase64url, authMessage, tokenMessage } from '../src/wire';

export { vectors };

const hex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (b) => parseInt(b, 16));

export interface HostKey {
  privateKey: CryptoKey;
  publicKey: Uint8Array;
  channel: string;
}

export async function vectorKey(): Promise<HostKey> {
  const pkcs8 = concat(hex('302e020100300506032b657004220420'), hex(vectors.ed25519Seed));
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign']);
  const publicKey = fromBase64url(vectors.publicKey)!;
  return { privateKey, publicKey, channel: await channelFor(publicKey) };
}

export async function newKey(): Promise<HostKey> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const publicKey = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  return { privateKey: pair.privateKey, publicKey, channel: await channelFor(publicKey) };
}

export async function sign(key: HostKey, message: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key.privateKey, message));
}

export async function issue(key: HostKey, kind: number, id: Uint8Array, expiry = 0, channel = key.channel): Promise<string> {
  const body = new Uint8Array(26);
  body[0] = 1;
  body[1] = kind;
  body.set(id, 2);
  new DataView(body.buffer).setBigUint64(18, BigInt(expiry));
  return base64url(concat(body, await sign(key, tokenMessage(channel, body))));
}

export const randomID = () => crypto.getRandomValues(new Uint8Array(16));

/** A WebSocket with its messages and close queued for the test to await. */
export class Socket {
  private messages: (string | Uint8Array)[] = [];
  private waiters: (() => void)[] = [];
  closed: { code: number; reason: string } | null = null;

  constructor(readonly ws: WebSocket) {
    ws.accept();
    // Binary messages can arrive as Blobs; a chain keeps them, and the close, in order.
    let order = Promise.resolve();
    ws.addEventListener('message', (event) => {
      const data = event.data as string | ArrayBuffer | Blob;
      order = order.then(async () => {
        this.messages.push(typeof data === 'string' ? data : new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data));
        this.wake();
      });
    });
    ws.addEventListener('close', (event) => {
      order = order.then(() => {
        this.closed = { code: event.code, reason: event.reason };
        this.wake();
      });
    });
  }

  private wake() {
    for (const waiter of this.waiters.splice(0)) waiter();
  }

  private async until(check: () => boolean, what: string, ms = 2000) {
    const deadline = Date.now() + ms;
    while (!check()) {
      if (Date.now() > deadline) throw new Error('timed out waiting for ' + what);
      await Promise.race([new Promise<void>((resolve) => this.waiters.push(resolve)), new Promise((r) => setTimeout(r, 50))]);
    }
  }

  async next(): Promise<string | Uint8Array> {
    await this.until(() => this.messages.length > 0 || this.closed !== null, 'a message');
    if (this.messages.length === 0) throw new Error('closed: ' + JSON.stringify(this.closed));
    return this.messages.shift()!;
  }

  async nextBinary(): Promise<Uint8Array> {
    const message = await this.next();
    if (typeof message === 'string') throw new Error('expected binary, got ' + message);
    return message;
  }

  async closure(): Promise<{ code: number; reason: string }> {
    await this.until(() => this.closed !== null, 'the socket to close');
    return this.closed!;
  }

  send(data: string | Uint8Array) {
    this.ws.send(data);
  }
}

async function upgrade(path: string): Promise<Response> {
  return SELF.fetch('https://relay.test' + path, { headers: { Upgrade: 'websocket' } });
}

/** A Host connected and authenticated with `key`. */
export async function connectHost(key: HostKey, signWith: HostKey = key, relay = 'relay.test'): Promise<Socket> {
  const response = await upgrade('/v1/host/' + key.channel);
  if (response.status !== 101 || !response.webSocket) throw new Error('host upgrade failed: ' + response.status);
  const socket = new Socket(response.webSocket);
  const challenge = JSON.parse((await socket.next()) as string);
  if (challenge.type !== 'challenge') throw new Error('expected a challenge');
  const nonce = fromBase64url(challenge.nonce)!;
  const signature = await sign(signWith, authMessage(relay, key.channel, nonce));
  socket.send(JSON.stringify({ type: 'auth', key: base64url(signWith.publicKey), sig: base64url(signature) }));
  return socket;
}

export async function readyHost(key: HostKey): Promise<Socket> {
  const host = await connectHost(key);
  const ready = JSON.parse((await host.next()) as string);
  if (ready.type !== 'ready') throw new Error('expected ready');
  return host;
}

export async function connectDevice(channel: string, token?: string): Promise<{ response: Response; socket?: Socket }> {
  const response = await upgrade('/v1/connect/' + channel + (token === undefined ? '' : '?token=' + token));
  return { response, socket: response.webSocket ? new Socket(response.webSocket) : undefined };
}
