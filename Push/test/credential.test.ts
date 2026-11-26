import { describe, expect, it } from 'vitest';
import { handle, type PushLog } from '../src/index';
import { alert, activity, fakeEnv, token } from './helpers';

type Call = { url: string; init: RequestInit };

/** Apple's DeviceCheck answers with `deviceCheck`; APNs with 200. */
function apple(deviceCheck: number) {
  const calls: Call[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(null, { status: url.includes('devicecheck') ? deviceCheck : 200 });
  };
  return { calls, fetcher };
}

const deviceCheck = btoa('a device check token from DCDevice');
const otherToken = 'cd'.repeat(32);

const request = (path: string, body: unknown) =>
  new Request(`https://push.test${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'CF-Connecting-IP': '203.0.113.9' } });

async function credentialFor(env: Awaited<ReturnType<typeof fakeEnv>>, t = token, environment = 'production'): Promise<string> {
  const response = await handle(request('/v1/credential', { token: t, environment, deviceCheck }), env, { fetch: apple(200).fetcher, now: () => 1 });
  expect(response.status).toBe(200);
  return ((await response.json()) as { credential: string }).credential;
}

describe('credentials', () => {
  it('are issued for a token once Apple confirms the device', async () => {
    const env = await fakeEnv();
    for (const [environment, host] of [['production', 'api.devicecheck.apple.com'], ['sandbox', 'api.development.devicecheck.apple.com']]) {
      const { calls, fetcher } = apple(200);
      const response = await handle(request('/v1/credential', { token, environment, deviceCheck }), env, { fetch: fetcher, now: () => 1_800_000_000 });
      expect(response.status).toBe(200);
      expect(((await response.json()) as { credential: string }).credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`https://${host}/v1/validate_device_token`);
      expect((calls[0].init.headers as Record<string, string>).authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
      const sent = JSON.parse(calls[0].init.body as string);
      expect(sent.device_token).toBe(deviceCheck);
      expect(sent.timestamp).toBe(1_800_000_000_000);
      expect(sent.transaction_id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('are refused when Apple does not confirm the device', async () => {
    const env = await fakeEnv();
    const refused = await handle(request('/v1/credential', { token, environment: 'production', deviceCheck }), env, { fetch: apple(400).fetcher, now: () => 1 });
    expect(refused.status).toBe(403);
    const down = await handle(request('/v1/credential', { token, environment: 'production', deviceCheck }), env, { fetch: apple(500).fetcher, now: () => 1 });
    expect(down.status).toBe(502);
    const bad = await handle(request('/v1/credential', { token, environment: 'production', deviceCheck: '!' }), env, { fetch: apple(200).fetcher, now: () => 1 });
    expect(bad.status).toBe(400);
  });

  it('are not issued without the DeviceCheck key', async () => {
    const env = { ...(await fakeEnv()), DEVICECHECK_PRIVATE_KEY: '' };
    const { calls, fetcher } = apple(200);
    const response = await handle(request('/v1/credential', { token, environment: 'production', deviceCheck }), env, { fetch: fetcher, now: () => 1 });
    expect(response.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it('let a push through only for their own token and environment', async () => {
    const env = await fakeEnv();
    const credential = await credentialFor(env);
    const push = (body: unknown) => handle(request('/v1/push', body), env, { fetch: apple(200).fetcher, now: () => 1 });
    expect((await push(alert({ credential }))).status).toBe(202);
    expect((await push(activity({ credential, environment: 'production' }))).status).toBe(202);
    expect((await push(alert({ credential, token: otherToken }))).status).toBe(403);
    expect((await push(alert({ credential, environment: 'sandbox' }))).status).toBe(403);
    expect((await push(alert({ credential: credential.slice(1) + 'A' }))).status).toBe(403);
  });

  it('are required once the service asks for them', async () => {
    const env = { ...(await fakeEnv()), REQUIRE_CREDENTIAL: 'true' };
    const push = (body: unknown) => handle(request('/v1/push', body), env, { fetch: apple(200).fetcher, now: () => 1 });
    expect((await push(alert())).status).toBe(403);
    expect((await push(alert({ credential: await credentialFor(env) }))).status).toBe(202);
  });

  it('are optional until then, and the log says which pushes had one', async () => {
    const env = await fakeEnv();
    const lines: PushLog[] = [];
    const log = (entry: PushLog) => lines.push(entry);
    const credential = await credentialFor(env);
    await handle(request('/v1/push', alert()), env, { fetch: apple(200).fetcher, now: () => 1, log });
    await handle(request('/v1/push', alert({ credential })), env, { fetch: apple(200).fetcher, now: () => 1, log });
    expect(lines.map((l) => [l.status, l.credential])).toEqual([[202, 'none'], [202, 'valid']]);
    expect(JSON.stringify(lines)).not.toContain(credential);
  });
});
