import { expect, test } from "vitest";
import { normalize, normalizeRecording, type FixtureLine } from "../src/normalize.ts";

const U1 = "0f35cfbb-9c9d-4cfa-b0c2-0de3c79dade5";
const U2 = "11111111-2222-4333-8444-555555555555";
const ctx = { tmpRoot: "/private/tmp/wilco-rec-abc123" };
const recv = (record: unknown): FixtureLine => ({ dir: "recv", record });

test("same uuid maps to same placeholder; different to different", () => {
  const out = normalize(
    [recv({ type: "extension_ui_request", id: U1 }), recv({ a: U2, b: `file_${U1}.jsonl` }), recv({ id: U1 })],
    ctx,
  );
  expect(out).toEqual([
    recv({ type: "extension_ui_request", id: "<uuid-1>" }),
    recv({ a: "<uuid-2>", b: "file_<uuid-1>.jsonl" }),
    recv({ id: "<uuid-1>" }),
  ]);
});

test("timestamps and durationMs are zeroed", () => {
  const out = normalize(
    [recv({ timestamp: 1733234401000, nested: { timestamp: "2026-11-23T07:03:28.333Z", durationMs: 42 } })],
    ctx,
  );
  expect(out).toEqual([recv({ timestamp: 0, nested: { timestamp: "1970-01-01T00:00:00.000Z", durationMs: 0 } })]);
});

test("timestamps embedded in file names are zeroed", () => {
  const out = normalize([recv({ sessionFile: "/x/2026-11-23T07-03-28-333Z_abc.jsonl" })], ctx);
  expect(out).toEqual([recv({ sessionFile: "/x/1970-01-01T00-00-00-000Z_abc.jsonl" })]);
});

test("entry ids become <entry-N> but command ids c1 and call_1 are kept", () => {
  const out = normalize(
    [
      { dir: "send", record: { id: "c1", type: "fork", entryId: "a1b2c3d4" } },
      recv({ id: "c1", type: "response", data: { entries: [{ id: "a1b2c3d4", parentId: null }, { id: "b2c3d4e5", parentId: "a1b2c3d4" }] } }),
      recv({ toolCallId: "call_1", message: { content: [{ type: "toolCall", id: "call_1" }] } }),
      recv({ models: [{ id: "mock-1", provider: "mock" }] }),
      recv({ leafId: "b2c3d4e5", firstKeptEntryId: "a1b2c3d4", fromId: "b2c3d4e5", since: "a1b2c3d4" }),
    ],
    ctx,
  );
  expect(out).toEqual([
    { dir: "send", record: { id: "c1", type: "fork", entryId: "<entry-1>" } },
    recv({ id: "c1", type: "response", data: { entries: [{ id: "<entry-1>", parentId: null }, { id: "<entry-2>", parentId: "<entry-1>" }] } }),
    recv({ toolCallId: "call_1", message: { content: [{ type: "toolCall", id: "call_1" }] } }),
    recv({ models: [{ id: "mock-1", provider: "mock" }] }),
    recv({ leafId: "<entry-2>", firstKeptEntryId: "<entry-1>", fromId: "<entry-2>", since: "<entry-1>" }),
  ]);
});

test("tmp root inside longer strings becomes <TMP>", () => {
  const out = normalize(
    [recv({ cwd: "/private/tmp/wilco-rec-abc123/work", msg: "see /tmp/wilco-rec-abc123/work/README.md now" })],
    ctx,
  );
  expect(out).toEqual([recv({ cwd: "<TMP>/work", msg: "see <TMP>/work/README.md now" })]);
});

test("mock url port is masked and raw lines are normalized too", () => {
  const out = normalize(
    [recv({ baseUrl: "http://127.0.0.1:54321/v1" }), { dir: "send", raw: "{not json" }],
    { ...ctx, mockURL: "http://127.0.0.1:54321/v1" },
  );
  expect(out).toEqual([recv({ baseUrl: "<MOCK_URL>" }), { dir: "send", raw: "{not json" }]);
});

test("pi package path and home directory are masked", () => {
  const out = normalize(
    [recv({ text: "docs: /opt/x/pi/install/releases/1.6.0/node_modules/@earendil-works/pi-coding-agent/docs\nmore /home/me/notes" })],
    { ...ctx, homeDir: "/home/me" },
  );
  expect(out).toEqual([recv({ text: "docs: <PI_PACKAGE>/docs\nmore <HOME>/notes" })]);
});

test("input is not mutated", () => {
  const input = [recv({ timestamp: 5 })];
  normalize(input, ctx);
  expect(input).toEqual([recv({ timestamp: 5 })]);
});

test("session files share placeholders with the transcript", () => {
  const out = normalizeRecording(
    [recv({ type: "response", data: { sessionId: U1, sessionFile: `/private/tmp/wilco-rec-abc123/sessions/x_${U1}.jsonl` } })],
    [[{ type: "session", id: U1, cwd: "/private/tmp/wilco-rec-abc123/work", timestamp: "2026-11-23T07:03:28.333Z" }, { type: "message", id: "a1b2c3d4", parentId: null }]],
    ctx,
  );
  expect(out.lines).toEqual([recv({ type: "response", data: { sessionId: "<uuid-1>", sessionFile: "<TMP>/sessions/x_<uuid-1>.jsonl" } })]);
  expect(out.sessions).toEqual([[
    { type: "session", id: "<uuid-1>", cwd: "<TMP>/work", timestamp: "1970-01-01T00:00:00.000Z" },
    { type: "message", id: "<entry-1>", parentId: null },
  ]]);
});
