import { afterEach, expect, test } from "vitest";
import wilcoGuard from "../src/guard.ts";

afterEach(() => {
  delete process.env.WILCO_GUARD_POLICY;
});

test("the policy path is kept from the commands Pi runs", () => {
  process.env.WILCO_GUARD_POLICY = "/state/extensions/wilco-guard/policy.json";
  const handlers: unknown[] = [];
  wilcoGuard({ on: (_event, handler) => handlers.push(handler) });
  expect(handlers).toHaveLength(1);
  expect(process.env.WILCO_GUARD_POLICY).toBeUndefined();
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
