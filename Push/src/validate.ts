// What a Host may ask wilco-push to deliver (Protocol/push.md). Everything is checked and only
// known fields are kept; the notification's content is sealed to the device and never read here.

export type Environment = 'sandbox' | 'production';
export type Category = 'approval' | 'finished' | 'failed';
export type ActivityStatus = 'working' | 'needsYou' | 'idle' | 'failed';

export interface AlertPush {
  kind: 'alert';
  token: string;
  environment: Environment;
  category: Category;
  /** Base64, at most MAX_SEALED_BYTES once decoded: what only the device can open. */
  sealed: string;
  thread: string;
  collapse?: string;
}

export interface ActivityState {
  status: ActivityStatus;
  steps: number;
  /** Seconds since 2001-01-01 (how ActivityKit reads a date). */
  startedAt: number;
  needsApproval: boolean;
  dialog?: string;
}

export interface ActivityPush {
  kind: 'activity';
  token: string;
  environment: Environment;
  event: 'update' | 'end';
  state: ActivityState;
  staleAfter?: number;
}

export type Push = AlertPush | ActivityPush;
export type Parsed = { ok: true; push: Push } | { ok: false; error: string };

export const MAX_SEALED_BYTES = 2800;
const MAX_STEPS = 100_000;
const MAX_STALE_AFTER = 8 * 3600;

class Invalid extends Error {}

function fail(message: string): never {
  throw new Invalid(message);
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function oneOf<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) fail(`${name} must be one of ${allowed.join(', ')}`);
  return value as T;
}

function text(value: unknown, name: string, pattern: RegExp, max: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || !pattern.test(value)) fail(`${name} is not valid`);
  return value;
}

function integer(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail(`${name} is not valid`);
  return value;
}

function decodedLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

export function parsePush(body: unknown): Parsed {
  try {
    return { ok: true, push: parse(body) };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}

function parse(body: unknown): Push {
  const o = object(body, 'the request');
  const token = text(o.token, 'token', /^[0-9a-fA-F]+$/, 200);
  if (token.length < 64) fail('token is not valid');
  const environment = oneOf(o.environment, 'environment', ['sandbox', 'production'] as const);
  const kind = oneOf(o.kind, 'kind', ['alert', 'activity'] as const);
  if (kind === 'alert') {
    const category = oneOf(o.category, 'category', ['approval', 'finished', 'failed'] as const);
    const sealed = text(o.sealed, 'sealed', /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, 4 * Math.ceil(MAX_SEALED_BYTES / 3));
    if (sealed.length % 4 !== 0 || decodedLength(sealed) > MAX_SEALED_BYTES) fail('sealed is too large or not base64');
    const thread = text(o.thread, 'thread', /^[A-Za-z0-9_-]+$/, 64);
    const push: AlertPush = { kind, token, environment, category, sealed, thread };
    if (o.collapse !== undefined) push.collapse = text(o.collapse, 'collapse', /^[\x21-\x7e]+$/, 64);
    return push;
  }
  const event = oneOf(o.event, 'event', ['update', 'end'] as const);
  const s = object(o.state, 'state');
  const state: ActivityState = {
    status: oneOf(s.status, 'state.status', ['working', 'needsYou', 'idle', 'failed'] as const),
    steps: integer(s.steps, 'state.steps', 0, MAX_STEPS),
    startedAt: integer(s.startedAt, 'state.startedAt', 0, 2 ** 32),
    needsApproval: typeof s.needsApproval === 'boolean' ? s.needsApproval : fail('state.needsApproval must be a boolean'),
  };
  if (s.dialog !== undefined) {
    if (typeof s.dialog !== 'string' || s.dialog.length > 64) fail('state.dialog is not valid');
    state.dialog = s.dialog;
  }
  const push: ActivityPush = { kind, token, environment, event, state };
  if (o.staleAfter !== undefined) push.staleAfter = integer(o.staleAfter, 'staleAfter', 1, MAX_STALE_AFTER);
  return push;
}
