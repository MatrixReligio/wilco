import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { handle } from '../src/index';
import { alert, fakeEnv, FakeLimiter, token } from './helpers';

type Call = { url: string; init: RequestInit };

function apns(status: number, body: unknown = undefined) {
  const calls: Call[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  };
  return { calls, fetcher };
}

const post = (body: unknown, ip = '203.0.113.9') =>
  new Request('https://push.test/v1/push', { method: 'POST', body: JSON.stringify(body), headers: { 'CF-Connecting-IP': ip } });

describe('worker', () => {
  it('delivers to production or the sandbox, signed', async () => {
    const env = await fakeEnv();
    for (const environment of ['production', 'sandbox']) {
      const { calls, fetcher } = apns(200);
      const response = await handle(post(alert({ environment })), env, { fetch: fetcher, now: () => 1_800_000_000 });
      expect(response.status).toBe(202);
      const host = environment === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
      expect(calls[0].url).toBe(`https://${host}/3/device/${token}`);
      const headers = calls[0].init.headers as Record<string, string>;
      expect(headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
      expect(headers['apns-topic']).toBe('com.example.wilco');
    }
  });

  it.each([
    [410, { reason: 'Unregistered' }],
    [400, { reason: 'BadDeviceToken' }],
    [400, { reason: 'DeviceTokenNotForTopic' }],
  ])('tells the Host to forget a dead token (%i %o)', async (status, body) => {
    const { fetcher } = apns(status, body);
    const response = await handle(post(alert()), await fakeEnv(), { fetch: fetcher, now: () => 1 });
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual(body);
  });

  it('reports other APNs failures as 502 and renews a refused provider token', async () => {
    const env = await fakeEnv();
    const first = apns(403, { reason: 'ExpiredProviderToken' });
    expect((await handle(post(alert()), env, { fetch: first.fetcher, now: () => 100 })).status).toBe(502);
    const second = apns(200);
    expect((await handle(post(alert()), env, { fetch: second.fetcher, now: () => 101 })).status).toBe(202);
    const auth = (call: Call) => (call.init.headers as Record<string, string>).authorization;
    expect(auth(second.calls[0])).not.toBe(auth(first.calls[0]));
    const down = async () => { throw new Error('network'); };
    expect((await handle(post(alert()), env, { fetch: down, now: () => 102 })).status).toBe(502);
  });

  it('is rate limited per token and per address', async () => {
    const pushLimit = new FakeLimiter(false);
    const limited = await handle(post(alert()), await fakeEnv({ push: pushLimit }), { fetch: apns(200).fetcher, now: () => 1 });
    expect(limited.status).toBe(429);
    // The token itself is not used as the key.
    expect(pushLimit.keys[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(pushLimit.keys[0]).not.toBe(token);
    const ipLimit = new FakeLimiter(false);
    const busy = await handle(post(alert()), await fakeEnv({ ip: ipLimit }), { fetch: apns(200).fetcher, now: () => 1 });
    expect(busy.status).toBe(429);
    expect(ipLimit.keys).toEqual(['203.0.113.9']);
  });

  it('refuses bad requests before anything is sent', async () => {
    const { calls, fetcher } = apns(200);
    const env = await fakeEnv();
    expect((await handle(post({ kind: 'alert' }), env, { fetch: fetcher, now: () => 1 })).status).toBe(400);
    const garbage = new Request('https://push.test/v1/push', { method: 'POST', body: '{' });
    expect((await handle(garbage, env, { fetch: fetcher, now: () => 1 })).status).toBe(400);
    const huge = new Request('https://push.test/v1/push', { method: 'POST', body: 'x'.repeat(20_000) });
    expect((await handle(huge, env, { fetch: fetcher, now: () => 1 })).status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it('serves only POST /v1/push and a health check', async () => {
    expect((await SELF.fetch('https://push.test/v1/push')).status).toBe(404);
    expect((await SELF.fetch('https://push.test/elsewhere', { method: 'POST' })).status).toBe(404);
    expect((await SELF.fetch('https://push.test/health')).status).toBe(200);
    const bad = await SELF.fetch('https://push.test/v1/push', { method: 'POST', body: '{}' });
    expect(bad.status).toBe(400);
  });

  it('is not configured without its secrets', async () => {
    const env = { ...(await fakeEnv()), APNS_PRIVATE_KEY: '' };
    expect((await handle(post(alert()), env, { fetch: apns(200).fetcher, now: () => 1 })).status).toBe(503);
  });
});
