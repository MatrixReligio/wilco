import type { Env } from '../src/index';

export const token = 'ab'.repeat(32);
/** 2800 bytes, base64. */
export const sealedOf = (length: number) => btoa(String.fromCharCode(...new Uint8Array(length).fill(7)));

export function alert(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { token, environment: 'production', kind: 'alert', category: 'approval', sealed: sealedOf(200), thread: 'aG9zdC1zZXNzaW9u', ...overrides };
}

export function activity(overrides: Record<string, unknown> = {}, state: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    token, environment: 'sandbox', kind: 'activity', event: 'update',
    state: { status: 'needsYou', steps: 3, startedAt: 785000000, needsApproval: true, dialog: 'run: rm -rf build', ...state },
    ...overrides,
  };
}

export async function testKey(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
  const body = btoa(String.fromCharCode(...pkcs8)).replace(/.{64}/g, '$&\n');
  return { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey };
}

export class FakeLimiter {
  keys: string[] = [];
  constructor(private allow = true) {}
  async limit({ key }: { key: string }): Promise<{ success: boolean }> {
    this.keys.push(key);
    return { success: this.allow };
  }
}

export async function fakeEnv(options: { push?: FakeLimiter; ip?: FakeLimiter } = {}): Promise<Env & { publicKey: CryptoKey }> {
  const key = await testKey();
  return {
    APNS_PRIVATE_KEY: key.pem, APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: 'TEAM123456', APNS_TOPIC: 'com.example.wilco',
    PUSH_LIMIT: options.push ?? new FakeLimiter(), IP_LIMIT: options.ip ?? new FakeLimiter(), publicKey: key.publicKey,
  };
}
