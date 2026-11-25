import { afterEach, expect, test } from "vitest";
import wilcoGuard from "../src/guard.ts";

afterEach(() => {
  delete process.env.WILCO_GUARD_POLICY;
  delete process.env.WILCO_GUARD_PROTECT;
});

test("the policy path is kept from the commands Pi runs", () => {
  process.env.WILCO_GUARD_POLICY = "/state/extensions/wilco-guard/policy.json";
  const handlers: unknown[] = [];
  wilcoGuard({ on: (_event, handler) => handlers.push(handler) });
  expect(handlers).toHaveLength(1);
  expect(process.env.WILCO_GUARD_POLICY).toBeUndefined();
});

test("the Host's whole state folder is protected, and where it is stays private", async () => {
  process.env.WILCO_GUARD_POLICY = "/state/extensions/wilco-guard/policy.json";
  process.env.WILCO_GUARD_PROTECT = "/state\n/other place";
  let handler: any;
  wilcoGuard({ on: (_event, h) => (handler = h) });
  expect(process.env.WILCO_GUARD_PROTECT).toBeUndefined();
  const asked: string[] = [];
  const ctx = { cwd: "/work", hasUI: true, ui: { confirm: async (title: string) => (asked.push(title), false) } };
  for (const command of ["cat /state/store/guard.json", "rm '/other place/x'"]) {
    expect(await handler({ toolName: "bash", toolCallId: "1", input: { command } }, ctx)).toMatchObject({ block: true });
  }
  expect(await handler({ toolName: "write", toolCallId: "2", input: { path: "/state/guard.json", content: "{}" } }, ctx)).toMatchObject({ block: true });
  expect(asked).toHaveLength(3);
  expect(await handler({ toolName: "bash", toolCallId: "3", input: { command: "ls /work" } }, ctx)).toBeUndefined();
});

test("Wilco's files are protected even with every rule off", async () => {
  process.env.WILCO_GUARD_POLICY = "/state/extensions/wilco-guard/policy.json";
  let handler: any;
  wilcoGuard({ on: (_event, h) => (handler = h) });
  const asked: string[] = [];
  const ctx = { cwd: "/work", hasUI: true, ui: { confirm: async (title: string) => (asked.push(title), false) } };
  const result = await handler({ toolName: "bash", toolCallId: "1", input: { command: "rm /state/extensions/wilco-guard/policy.json" } }, ctx);
  expect(asked).toHaveLength(1);
  expect(result).toMatchObject({ block: true });
});
