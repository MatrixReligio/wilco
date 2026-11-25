import { describe, expect, it } from 'vitest';
import { parsePush } from '../src/validate';
import { activity, alert, sealedOf } from './helpers';

const error = (body: unknown) => {
  const result = parsePush(body);
  return result.ok ? undefined : result.error;
};

describe('validate', () => {
  it('accepts an alert and an activity update', () => {
    expect(parsePush(alert())).toMatchObject({ ok: true, push: { kind: 'alert', category: 'approval', environment: 'production' } });
    expect(parsePush(alert({ collapse: 'session-1', category: 'failed' }))).toMatchObject({ ok: true });
    expect(parsePush(activity())).toMatchObject({ ok: true, push: { kind: 'activity', event: 'update' } });
    expect(parsePush(activity({ event: 'end', staleAfter: 900 }, { dialog: undefined, needsApproval: false, status: 'idle' }))).toMatchObject({ ok: true });
    expect(parsePush(activity({ event: 'end', dismissAfter: 0 }))).toMatchObject({ ok: true, push: { dismissAfter: 0 } });
  });

  it.each([
    ['not an object', 'x'],
    ['null', null],
    ['short token', alert({ token: 'ab'.repeat(10) })],
    ['token not hex', alert({ token: 'zz'.repeat(32) })],
    ['long token', alert({ token: 'a'.repeat(202) })],
    ['environment', alert({ environment: 'staging' })],
    ['category', alert({ category: 'other' })],
    ['sealed not base64', alert({ sealed: 'not base64!' })],
    ['empty sealed', alert({ sealed: '' })],
    ['thread too long', alert({ thread: 'a'.repeat(65) })],
    ['thread not base64url', alert({ thread: 'a b' })],
    ['collapse too long', alert({ collapse: 'c'.repeat(65) })],
    ['event', activity({ event: 'start' })],
    ['status', activity({}, { status: 'busy' })],
    ['negative steps', activity({}, { steps: -1 })],
    ['fractional steps', activity({}, { steps: 1.5 })],
    ['huge steps', activity({}, { steps: 100001 })],
    ['startedAt', activity({}, { startedAt: 'now' })],
    ['needsApproval', activity({}, { needsApproval: 'yes' })],
    ['dialog too long', activity({}, { dialog: 'd'.repeat(65) })],
    ['state missing', activity({ state: undefined })],
    ['staleAfter', activity({ staleAfter: -5 })],
    ['dismissAfter', activity({ event: 'end', dismissAfter: 14401 })],
    ['dismissAfter on an update', activity({ dismissAfter: 60 })],
  ])('refuses a bad %s', (_name, body) => {
    expect(error(body)).toBeTypeOf('string');
  });

  it('oversizedSealedIsRefused', () => {
    expect(parsePush(alert({ sealed: sealedOf(2800) }))).toMatchObject({ ok: true });
    expect(error(alert({ sealed: sealedOf(2801) }))).toMatch(/sealed/);
  });

  it('unknownKindIsRefused', () => {
    expect(error(alert({ kind: 'background' }))).toMatch(/kind/);
  });

  it('keeps only known fields', () => {
    const result = parsePush(alert({ extra: 'ignored' }));
    expect(result.ok && 'extra' in result.push).toBe(false);
  });
});
