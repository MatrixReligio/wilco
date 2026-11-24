import { describe, expect, it } from 'vitest';
import { authMessage, channelFor, decodeFrame, encodeFrame, fromBase64url, parseToken, tokenMessage, verify } from '../src/wire';
import { vectors } from './helpers';

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (b) => parseInt(b, 16));

describe('wire formats (Protocol/test-vectors/relay)', () => {
  const publicKey = fromBase64url(vectors.publicKey)!;

  it('derives the channel from the Host key', async () => {
    expect(await channelFor(publicKey)).toBe(vectors.channel);
  });

  it('builds and verifies the Host authentication', async () => {
    const message = authMessage(vectors.auth.relay, vectors.channel, fromBase64url(vectors.auth.nonce)!);
    expect(hex(message)).toBe(vectors.auth.message);
    expect(await verify(publicKey, fromBase64url(vectors.auth.signature)!, message)).toBe(true);
    expect(await verify(publicKey, fromBase64url(vectors.auth.signature)!, message.slice(1))).toBe(false);
  });

  for (const name of ['deviceToken', 'pairingToken'] as const) {
    it('parses and verifies the ' + name, async () => {
      const vector = vectors[name];
      const token = parseToken(vector.token)!;
      expect(token.kind).toBe(vector.kind);
      expect(token.expiry).toBe(vector.expiry);
      expect(token.id).toEqual(fromBase64url(vector.id));
      expect(hex(tokenMessage(vectors.channel, token.body))).toBe(vector.signedMessage);
      expect(await verify(publicKey, token.signature, tokenMessage(vectors.channel, token.body))).toBe(true);
      expect(await verify(publicKey, token.signature, tokenMessage('AAAAAAAAAAAAAAAAAAAAAA', token.body))).toBe(false);
    });
  }

  it('refuses malformed tokens', () => {
    expect(parseToken('')).toBeNull();
    expect(parseToken('not base64!')).toBeNull();
    expect(parseToken(vectors.deviceToken.token.slice(0, -4))).toBeNull();
    const wrongKind = fromBase64url(vectors.deviceToken.token)!;
    wrongKind[1] = 9;
    expect(parseToken(Buffer.from(wrongKind).toString('base64url'))).toBeNull();
  });

  it('encodes and decodes frames', () => {
    const types = { open: 1, data: 2, close: 3 } as const;
    for (const frame of vectors.frames) {
      const bytes = encodeFrame(types[frame.type as keyof typeof types], frame.connection, fromHex(frame.payload));
      expect(hex(bytes)).toBe(frame.bytes);
      expect(decodeFrame(bytes)).toEqual({ type: types[frame.type as keyof typeof types], connection: frame.connection, payload: fromHex(frame.payload) });
    }
    expect(decodeFrame(new Uint8Array([2, 0, 0]))).toBeNull();
    expect(decodeFrame(new Uint8Array([9, 0, 0, 0, 1]))).toBeNull();
  });
});
