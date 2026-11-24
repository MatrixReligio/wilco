// The relay's wire formats (Protocol/relay.md). Everything here is pure, so it is tested
// against Protocol/test-vectors/relay/vectors.json.

export const FrameType = { open: 1, data: 2, close: 3 } as const;
export type FrameType = (typeof FrameType)[keyof typeof FrameType];

export const TokenKind = { device: 1, pairing: 2 } as const;

const encoder = new TextEncoder();
const zero = new Uint8Array([0]);

export function base64url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** Decodes unpadded base64url; null when malformed. */
export function fromBase64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const padded = text.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const raw = atob(padded);
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function isChannelID(text: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(text);
}

/** A channel belongs to the Host whose Ed25519 public key hashes to it. */
export async function channelFor(publicKey: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', publicKey));
  return base64url(digest).slice(0, 22);
}

/** What a Host signs to prove it owns `channel`; `relay` (the relay's host, with a port other than the default) ties it to this relay. */
export function authMessage(relay: string, channel: string, nonce: Uint8Array): Uint8Array {
  return concat(encoder.encode('wilco-relay/1'), zero, encoder.encode('host'), zero, encoder.encode(relay), zero, encoder.encode(channel), zero, nonce);
}

export function tokenMessage(channel: string, body: Uint8Array): Uint8Array {
  return concat(encoder.encode('wilco-relay-token/1'), zero, encoder.encode(channel), zero, body);
}

export interface RelayToken {
  kind: number;
  id: Uint8Array;
  /** Unix seconds; 0 = none. */
  expiry: number;
  body: Uint8Array;
  signature: Uint8Array;
}

export const tokenLength = 26 + 64;

export function parseToken(text: string): RelayToken | null {
  const bytes = fromBase64url(text);
  if (!bytes || bytes.length !== tokenLength || bytes[0] !== 1) return null;
  const kind = bytes[1];
  if (kind !== TokenKind.device && kind !== TokenKind.pairing) return null;
  const expiry = new DataView(bytes.buffer, bytes.byteOffset + 18, 8).getBigUint64(0);
  if (expiry > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { kind, id: bytes.slice(2, 18), expiry: Number(expiry), body: bytes.slice(0, 26), signature: bytes.slice(26) };
}

export async function verify(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array): Promise<boolean> {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  try {
    const key = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, message);
  } catch {
    return false;
  }
}

export function encodeFrame(type: FrameType, connection: number, payload: Uint8Array = new Uint8Array()): Uint8Array {
  const out = new Uint8Array(5 + payload.length);
  out[0] = type;
  new DataView(out.buffer).setUint32(1, connection >>> 0);
  out.set(payload, 5);
  return out;
}

export interface Frame {
  type: FrameType;
  connection: number;
  payload: Uint8Array;
}

export function decodeFrame(bytes: Uint8Array): Frame | null {
  if (bytes.length < 5) return null;
  const type = bytes[0];
  if (type !== FrameType.open && type !== FrameType.data && type !== FrameType.close) return null;
  const connection = new DataView(bytes.buffer, bytes.byteOffset + 1, 4).getUint32(0);
  return { type, connection, payload: bytes.slice(5) };
}
