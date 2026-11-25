import { describe, expect, it } from 'vitest';
import { apnsRequest } from '../src/apns';
import { providerToken, signJWT } from '../src/jwt';
import { parsePush } from '../src/validate';
import { activity, alert, fakeEnv, sealedOf, testKey, token } from './helpers';

const push = (body: Record<string, unknown>) => {
  const result = parsePush(body);
  if (!result.ok) throw new Error(result.error);
  return result.push;
};

const fromBase64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

describe('apns payloads', () => {
  it('an alert carries only the sealed message and a fallback', () => {
    const sealed = sealedOf(100);
    const request = apnsRequest(push(alert({ sealed, collapse: 's1' })), 'com.example.wilco', 1_800_000_000);
    expect(request.url).toBe(`https://api.push.apple.com/3/device/${token}`);
    expect(request.headers).toEqual({
      'apns-push-type': 'alert', 'apns-topic': 'com.example.wilco', 'apns-priority': '10', 'apns-collapse-id': 's1',
    });
    expect(JSON.parse(request.body)).toEqual({
      aps: { alert: { 'loc-key': 'PUSH_FALLBACK_APPROVAL' }, 'mutable-content': 1, sound: 'default', category: 'WILCO_UNOPENED',
             'thread-id': 'aG9zdC1zZXNzaW9u' },
      w: sealed,
    });
  });

  it('a finished run is not urgent and makes no sound', () => {
    const request = apnsRequest(push(alert({ category: 'finished' })), 'com.example.wilco', 1_800_000_000);
    expect(request.headers['apns-priority']).toBe('5');
    expect(JSON.parse(request.body).aps).toMatchObject({ category: 'WILCO_UNOPENED', alert: { 'loc-key': 'PUSH_FALLBACK_FINISHED' } });
    expect(JSON.parse(request.body).aps.sound).toBeUndefined();
    expect(JSON.parse(apnsRequest(push(alert({ category: 'failed' })), 't', 0).body).aps.sound).toBe('default');
  });

  it('a Live Activity update goes to the activity topic', () => {
    const request = apnsRequest(push(activity({ staleAfter: 600 })), 'com.example.wilco', 1_800_000_000);
    expect(request.url).toBe(`https://api.sandbox.push.apple.com/3/device/${token}`);
    expect(request.headers).toEqual({
      'apns-push-type': 'liveactivity', 'apns-topic': 'com.example.wilco.push-type.liveactivity', 'apns-priority': '10',
    });
    expect(JSON.parse(request.body)).toEqual({
      aps: { timestamp: 1_800_000_000, event: 'update', 'stale-date': 1_800_000_600,
             'content-state': { status: 'needsYou', steps: 3, startedAt: 785000000, needsApproval: true, dialog: 'run: rm -rf build' } },
    });
    const ended = apnsRequest(push(activity({ event: 'end', dismissAfter: 900 }, { needsApproval: false, dialog: undefined })), 't', 100);
    expect(JSON.parse(ended.body).aps).toMatchObject({ event: 'end', 'dismissal-date': 1000 });
    const quiet = apnsRequest(push(activity({}, { needsApproval: false, status: 'working', dialog: undefined })), 't', 5);
    expect(quiet.headers['apns-priority']).toBe('5');
    expect(JSON.parse(quiet.body).aps['content-state']).toEqual({ status: 'working', steps: 3, startedAt: 785000000, needsApproval: false });
  });
});

describe('provider token', () => {
  it('is an ES256 JWT that verifies with the key', async () => {
    const key = await testKey();
    const jwt = await signJWT(key.pem, 'ABC123DEFG', 'TEAM123456', 1_800_000_000);
    const [header, claims, signature] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromBase64url(header)))).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' });
    expect(JSON.parse(new TextDecoder().decode(fromBase64url(claims)))).toEqual({ iss: 'TEAM123456', iat: 1_800_000_000 });
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key.publicKey, fromBase64url(signature),
                                            new TextEncoder().encode(`${header}.${claims}`));
    expect(valid).toBe(true);
  });

  it('is reused for 50 minutes, then made anew', async () => {
    const env = await fakeEnv();
    const first = await providerToken(env, 1_000_000);
    expect(await providerToken(env, 1_000_000 + 49 * 60)).toBe(first);
    const later = await providerToken(env, 1_000_000 + 51 * 60);
    expect(later).not.toBe(first);
    // A refused token is dropped at once.
    expect(await providerToken(env, 1_000_000 + 52 * 60, { renew: true })).not.toBe(later);
  });
});
