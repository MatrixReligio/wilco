// Wilco push (Protocol/push.md): delivers notifications a Host sealed to a device, and Live
// Activity updates, through APNs. It cannot read the notifications and keeps nothing.
import { apnsRequest } from './apns';
import { checkDevice, credentialFor, isCredential } from './credential';
import { forgetProviderToken, providerToken } from './jwt';
import { parseCredentialRequest, parsePush } from './validate';

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  APNS_PRIVATE_KEY: string;
  APNS_KEY_ID: string;
  APNS_TEAM_ID: string;
  APNS_TOPIC: string;
  PUSH_LIMIT: RateLimiter;
  IP_LIMIT: RateLimiter;
  /** Push credentials (optional): the DeviceCheck .p8 key, its id, and the HMAC secret. */
  DEVICECHECK_PRIVATE_KEY?: string;
  DEVICECHECK_KEY_ID?: string;
  CREDENTIAL_SECRET?: string;
  /** "true": a push without a credential is refused. */
  REQUIRE_CREDENTIAL?: string;
}

export interface Dependencies {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Seconds since 1970. */
  now: () => number;
  /** Where the one log line per push goes (Workers Logs by default). */
  log?: (entry: PushLog) => void;
}

/** What is logged about a request: its outcome, never its token, sender, credential or content. */
export interface PushLog {
  event: 'push' | 'credential';
  status: number;
  kind?: string;
  environment?: string;
  reason?: string;
  credential?: 'valid' | 'invalid' | 'none';
}

const MAX_BODY_BYTES = 8192;
/** APNs reasons that mean the token will never work again: the Host forgets it. */
const DEAD_TOKEN = new Set(['Unregistered', 'BadDeviceToken', 'DeviceTokenNotForTopic']);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The body as text, or undefined once it is larger than `limit` bytes (reading stops there). */
async function readCapped(request: Request, limit: number): Promise<string | undefined> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declared) || declared > limit) return undefined;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function handle(request: Request, env: Env, deps: Dependencies): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/health' && request.method === 'GET') return new Response('ok');
  const route = url.pathname === '/v1/push' ? push : url.pathname === '/v1/credential' ? credential : undefined;
  if (!route || request.method !== 'POST') return new Response('not found', { status: 404 });
  const entry: PushLog = { event: route === push ? 'push' : 'credential', status: 0 };
  const response = await route(request, env, deps, entry);
  entry.status = response.status;
  (deps.log ?? ((line) => console.log(JSON.stringify(line))))(entry);
  return response;
}

/** Reads a JSON body of at most 8 KB after the address limit: the body, or the reply refusing it. */
async function readJSON(request: Request, env: Env): Promise<{ body: unknown } | Response> {
  const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await env.IP_LIMIT.limit({ key: address })).success) return json(429, { error: 'too many requests' });
  const text = await readCapped(request, MAX_BODY_BYTES);
  if (text === undefined) return json(413, { error: 'too large' });
  try {
    return { body: JSON.parse(text) };
  } catch {
    return json(400, { error: 'not JSON' });
  }
}

async function credential(request: Request, env: Env, deps: Dependencies, entry: PushLog): Promise<Response> {
  const read = await readJSON(request, env);
  if (read instanceof Response) return read;
  const parsed = parseCredentialRequest(read.body);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const { token, environment, deviceCheck } = parsed.request;
  entry.environment = environment;
  if (!env.DEVICECHECK_PRIVATE_KEY || !env.DEVICECHECK_KEY_ID || !env.APNS_TEAM_ID || !env.CREDENTIAL_SECRET) {
    return json(503, { error: 'credentials are not offered' });
  }
  // Apart from the token's pushes, so asking for credentials cannot use them up; and per
  // DeviceCheck token, so one cannot be used for many credentials.
  for (const key of [`credential:${await sha256Hex(token.toLowerCase())}`, `devicecheck:${await sha256Hex(deviceCheck)}`]) {
    if (!(await env.PUSH_LIMIT.limit({ key })).success) return json(429, { error: 'too many requests for this device' });
  }
  const checked = await checkDevice(env, environment, deviceCheck, deps.now(), deps.fetch);
  if (checked === 'invalid') return json(403, { error: 'DeviceCheck did not confirm the device' });
  if (checked === 'unavailable') return json(502, { error: 'DeviceCheck could not confirm the device' });
  return json(200, { credential: await credentialFor(env.CREDENTIAL_SECRET, token, environment) });
}

async function push(request: Request, env: Env, deps: Dependencies, entry: PushLog): Promise<Response> {

  const read = await readJSON(request, env);
  if (read instanceof Response) return read;
  const parsed = parsePush(read.body);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const push = parsed.push;
  entry.kind = push.kind;
  entry.environment = push.environment;
  entry.credential = push.credential === undefined ? 'none' : 'invalid';
  if (push.credential !== undefined) {
    if (!env.CREDENTIAL_SECRET || !(await isCredential(env.CREDENTIAL_SECRET, push.token, push.environment, push.credential))) {
      return json(403, { error: 'credential is not valid' });
    }
    entry.credential = 'valid';
  } else if (env.REQUIRE_CREDENTIAL === 'true') {
    return json(403, { error: 'credential required' });
  }

  if (!(await env.PUSH_LIMIT.limit({ key: await sha256Hex(push.token.toLowerCase()) })).success) {
    return json(429, { error: 'too many pushes for this device' });
  }
  if (!env.APNS_PRIVATE_KEY || !env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_TOPIC) {
    return json(503, { error: 'not configured' });
  }

  const now = deps.now();
  const apns = apnsRequest(push, env.APNS_TOPIC, now);
  let response: Response;
  try {
    const jwt = await providerToken(env, now);
    response = await deps.fetch(apns.url, {
      method: 'POST', body: apns.body, headers: { ...apns.headers, authorization: `bearer ${jwt}` },
    });
  } catch {
    return json(502, { error: 'APNs could not be reached' });
  }
  if (response.ok) return new Response(null, { status: 202 });
  const reason = await response.json().then((b) => (b as { reason?: unknown }).reason, () => undefined);
  if (typeof reason === 'string') entry.reason = reason;
  if (typeof reason === 'string' && DEAD_TOKEN.has(reason)) return json(410, { reason });
  if (reason === 'ExpiredProviderToken' || reason === 'InvalidProviderToken') forgetProviderToken();
  return json(502, { error: 'APNs refused the push', status: response.status, reason: typeof reason === 'string' ? reason : undefined });
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env, { fetch: (url, init) => fetch(url, init), now: () => Math.floor(Date.now() / 1000) });
  },
} satisfies ExportedHandler<Env>;
