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

/** A Pi event bus like pi.events. */
function bus() {
  const listeners = new Map<string, ((data: any) => void)[]>();
  return {
    on: (topic: string, handler: (data: any) => void) => listeners.set(topic, [...(listeners.get(topic) ?? []), handler]),
    emit: (topic: string, data: unknown) => (listeners.get(topic) ?? []).forEach((h) => h(data)),
  };
}

const risky = { toolName: "bash", toolCallId: "1", input: { command: "rm -rf build" } };

test("from a terminal session, the phone can answer first", async () => {
  const events = bus();
  let terminalSignal: AbortSignal | undefined;
  events.on("wilco:ask", (ask) => {
    expect(ask.title).toBe("wilco-guard: run: rm -rf build");
    setTimeout(() => ask.answer(true), 10);
  });
  let handler: any;
  wilcoGuard({ on: (_event, h) => (handler = h), events });
  const ctx = {
    cwd: "/work", hasUI: true,
    ui: { confirm: (_t: string, _m: string, options?: { signal?: AbortSignal }) => new Promise<boolean>((resolve) => {
      terminalSignal = options?.signal;
      options?.signal?.addEventListener("abort", () => resolve(false));
    }) },
  };
  expect(await handler(risky, ctx)).toBeUndefined();
  expect(terminalSignal?.aborted).toBe(true);
});

test("an answer in the terminal closes the question on the phone", async () => {
  const events = bus();
  let phone: any;
  events.on("wilco:ask", (ask) => { phone = ask; });
  let handler: any;
  wilcoGuard({ on: (_event, h) => (handler = h), events });
  const ctx = { cwd: "/work", hasUI: true, ui: { confirm: async () => false } };
  expect(await handler(risky, ctx)).toMatchObject({ block: true });
  expect(phone.signal.aborted).toBe(true);
  phone.answer(true); // too late: ignored
});

test("with no bridge listening, only the terminal is asked", async () => {
  let handler: any;
  wilcoGuard({ on: (_event, h) => (handler = h), events: bus() });
  const ctx = { cwd: "/work", hasUI: true, ui: { confirm: async () => true } };
  expect(await handler(risky, ctx)).toBeUndefined();
});

test("loaded twice (Wilco Host's copy and the npm package), wilco-guard asks once", () => {
  process.env.WILCO_GUARD_POLICY = "/state/extensions/wilco-guard/policy.json";
  const events = bus();
  const handlers: unknown[] = [];
  wilcoGuard({ on: (_event, handler) => handlers.push(handler), events });
  wilcoGuard({ on: (_event, handler) => handlers.push(handler), events });
  expect(handlers).toHaveLength(1);
});
