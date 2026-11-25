import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import wilcoBridge, { timing } from "../src/bridge.ts";
import { runCommand, type BridgeEnv } from "../src/bridge-commands.ts";
import { toRPC } from "../src/bridge-records.ts";

type Rec = Record<string, any>;

/** A stand-in for Wilco Host's socket: records every line, answers the hello as told. */
class FakeHost {
  lines: Rec[] = [];
  sockets: net.Socket[] = [];
  /** The answer to a hello; null hangs up without one. */
  reply: Rec | null = { type: "wilco_bridge_welcome", bridgeProtocolVersion: 1, role: "writer" };
  private server: net.Server;
  private waiters: (() => void)[] = [];
  readonly socketPath: string;
  constructor(socketPath: string) {
    this.socketPath = socketPath;
    this.server = net.createServer((socket) => {
      this.sockets.push(socket);
      let pending = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        pending += chunk;
        let nl: number;
        while ((nl = pending.indexOf("\n")) >= 0) {
          const line = JSON.parse(pending.slice(0, nl));
          pending = pending.slice(nl + 1);
          this.lines.push(line);
          if (line.type === "wilco_bridge_hello") {
            if (this.reply) socket.write(JSON.stringify(this.reply) + "\n");
            else socket.destroy();
          }
        }
        this.waiters.splice(0).forEach((w) => w());
      });
      socket.on("error", () => {});
    });
  }
  listen() { return new Promise<void>((r) => this.server.listen(this.socketPath, r)); }
  close() { this.sockets.forEach((s) => s.destroy()); return new Promise<void>((r) => this.server.close(() => r())); }
  send(record: Rec) { this.sockets.at(-1)!.write(JSON.stringify(record) + "\n"); }
  async until(check: () => boolean, ms = 3000) {
    const end = Date.now() + ms;
    while (!check()) {
      if (Date.now() > end) throw new Error("timed out; lines: " + JSON.stringify(this.lines).slice(0, 800));
      await new Promise<void>((r) => { this.waiters.push(r); setTimeout(r, 25); });
    }
  }
  of(type: string) { return this.lines.filter((l) => l.type === type); }
}

/** A Pi double: handlers by event, and what the bridge asked it to do. */
function fakePi(events?: Rec) {
  const handlers = new Map<string, ((event: Rec, ctx: Rec) => unknown)[]>();
  const did: Rec[] = [];
  let idle = true;
  let pending = false;
  const ctx: Rec = {
    mode: "tui", hasUI: true, cwd: "/work",
    sessionManager: {
      getSessionId: () => "s-1", getSessionFile: () => "/work/.pi/s-1.jsonl", getSessionName: () => "Fix it",
      getBranch: () => [{ type: "message", message: { role: "user", content: [{ type: "text", text: "hi" }] } }, { type: "label" }],
      getEntries: () => [],
    },
    model: { provider: "mock", id: "mock-1", contextWindow: 1000 },
    thinkingLevel: "off",
    modelRegistry: { getAvailable: () => [{ provider: "mock", id: "mock-1" }, { provider: "mock", id: "mock-2" }], find: (p: string, id: string) => ({ provider: p, id }) },
    isIdle: () => idle,
    hasPendingMessages: () => pending,
    abort: () => did.push({ abort: true }),
    compact: (options: Rec) => did.push({ compact: options?.customInstructions ?? null }),
    getContextUsage: () => ({ tokens: 100, contextWindow: 1000, percent: 10 }),
    ui: { notify: (text: string, level: string) => did.push({ notify: text, level }), confirm: async () => false },
  };
  const commands = new Map<string, Rec>();
  const pi: Rec = {
    on: (name: string, handler: (event: Rec, ctx: Rec) => unknown) => handlers.set(name, [...(handlers.get(name) ?? []), handler]),
    events: events ?? (() => {
      const listeners = new Map<string, ((data: any) => void)[]>();
      return {
        on: (topic: string, h: (data: any) => void) => listeners.set(topic, [...(listeners.get(topic) ?? []), h]),
        emit: (topic: string, data: unknown) => (listeners.get(topic) ?? []).forEach((h) => h(data)),
      };
    })(),
    sendUserMessage: (content: unknown, options?: Rec) => did.push({ send: content, ...(options ?? {}) }),
    setModel: async (model: Rec) => (did.push({ setModel: model }), true),
    setThinkingLevel: (level: string) => did.push({ thinking: level }),
    getThinkingLevel: () => "off",
    getCommands: () => [{ name: "review", source: "prompt", sourceInfo: { path: "/p", source: "local", scope: "user", origin: "top-level" } }],
    setSessionName: (name: string) => did.push({ name }),
    registerCommand: (name: string, options: Rec) => commands.set(name, options),
  };
  return {
    pi, ctx, did, commands,
    setIdle: (value: boolean) => { idle = value; },
    setPending: (value: boolean) => { pending = value; },
    async fire(name: string, event: Rec = {}, over: Rec = {}) {
      let result: unknown;
      for (const h of handlers.get(name) ?? []) result = await h({ type: name, ...event }, { ...ctx, ...over });
      return result;
    },
  };
}

let dir: string;
let host: FakeHost;
const open: ReturnType<typeof fakePi>[] = [];
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "wilco-bridge-"));
  host = new FakeHost(path.join(dir, "bridge.sock"));
  await host.listen();
  process.env.WILCO_BRIDGE_SOCKET = host.socketPath;
});
afterEach(async () => {
  for (const pi of open.splice(0)) await pi.fire("session_shutdown", { reason: "quit" });
  delete process.env.WILCO_BRIDGE_SOCKET;
  await host.close();
  await rm(dir, { recursive: true, force: true });
});

async function started(over: Rec = {}, events?: Rec) {
  const pi = fakePi(events);
  wilcoBridge(pi.pi as never);
  await pi.fire("session_start", { reason: "startup" }, over);
  open.push(pi);
  return pi;
}

/** Started, and the Host's answer to its hello has arrived. */
async function welcomed(count = 1) {
  const pi = await started();
  await host.until(() => host.of("wilco_bridge_hello").length === count);
  await new Promise((r) => setTimeout(r, 50));
  return pi;
}

test("a terminal session says hello; Pi's other modes stay quiet", async () => {
  for (const mode of ["rpc", "json", "print"]) await started({ mode });
  await new Promise((r) => setTimeout(r, 150));
  expect(host.of("wilco_bridge_hello")).toHaveLength(0);
  await started();
  await host.until(() => host.of("wilco_bridge_hello").length === 1);
  expect(host.of("wilco_bridge_hello")[0]).toMatchObject({
    bridgeProtocolVersion: 1, sessionId: "s-1", sessionFile: "/work/.pi/s-1.jsonl", cwd: "/work",
    commands: expect.arrayContaining(["prompt", "steer", "follow_up", "abort", "get_state", "get_messages"]),
  });
});

test("events reach the Host in Pi's RPC shapes", async () => {
  const pi = await started();
  await host.until(() => host.of("wilco_bridge_hello").length === 1);
  await new Promise((r) => setTimeout(r, 50));
  const assistant = { role: "assistant", content: [], usage: { input: 1, output: 2 } };
  await pi.fire("agent_start");
  await pi.fire("turn_start", { turnIndex: 0, timestamp: 1 });
  await pi.fire("message_update", { message: assistant, assistantMessageEvent: { type: "text_delta", delta: "Hi" } });
  await pi.fire("turn_end", { turnIndex: 0, message: assistant, toolResults: [], context: { big: true }, entries: [] });
  await pi.fire("input", { text: "typed", source: "interactive" });
  await pi.fire("agent_settled", { aborted: false });
  await host.until(() => host.of("agent_settled").length === 1);
  const types = host.lines.slice(1).map((l) => l.type);
  expect(types).toEqual(["agent_start", "turn_start", "message_update", "turn_end", "agent_settled"]);
  expect(host.of("turn_start")[0]).toEqual({ type: "turn_start" });
  expect(host.of("message_update")[0]).toEqual({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hi" }, usage: { input: 1, output: 2 } });
  expect(host.of("turn_end")[0]).toEqual({ type: "turn_end", message: assistant, toolResults: [] });
});

test("compaction and the session's name are reported as RPC events", () => {
  expect(toRPC("session_before_compact", { reason: "manual", preparation: {}, branchEntries: [] })).toEqual({ type: "compaction_start", reason: "manual" });
  expect(toRPC("session_compact", { reason: "threshold", compactionEntry: { id: "c" }, willRetry: false })).toEqual(
    { type: "compaction_end", reason: "threshold", result: { id: "c" }, aborted: false, willRetry: false });
  expect(toRPC("session_compact_failed", { reason: "overflow", aborted: true, willRetry: true, errorMessage: "x" })).toEqual(
    { type: "compaction_end", reason: "overflow", result: null, aborted: true, willRetry: true, errorMessage: "x" });
  expect(toRPC("session_info_changed", { name: "N" })).toEqual({ type: "session_info_changed", name: "N" });
  expect(toRPC("thinking_level_select", { level: "high", previousLevel: "off" })).toEqual({ type: "thinking_level_changed", level: "high" });
  expect(toRPC("input", { text: "x" })).toBeUndefined();
  expect(toRPC("agent_end", { messages: [] })).toEqual({ type: "agent_end", messages: [], willRetry: false });
});

function env(over: Partial<BridgeEnv> = {}): { env: BridgeEnv; did: Rec[] } {
  const did: Rec[] = [];
  const e: BridgeEnv = {
    isIdle: () => true,
    send: (content, deliverAs) => { did.push({ send: content, deliverAs }); },
    isCompacting: () => false,
    hasModel: () => true,
    abort: () => { did.push({ abort: true }); },
    state: () => ({ sessionId: "s-1", isStreaming: false }),
    messages: () => [{ role: "user" }],
    models: () => [{ id: "m" }],
    setModel: async (provider, id) => (did.push({ provider, id }), { provider, id }),
    setThinkingLevel: (level) => { did.push({ level }); },
    thinkingLevels: () => ["off", "low"],
    commands: () => [{ name: "review" }],
    setSessionName: (name) => { did.push({ name }); },
    compact: (instructions) => { did.push({ compact: instructions ?? null }); },
    stats: () => ({ sessionId: "s-1" }),
    ...over,
  };
  return { env: e, did };
}

test("commands from the phone run through Pi's extension API", async () => {
  const idle = env();
  expect(await runCommand({ type: "prompt", id: "1", message: "go" }, idle.env)).toEqual({ type: "response", id: "1", command: "prompt", success: true });
  const busy = env({ isIdle: () => false });
  await runCommand({ type: "prompt", id: "2", message: "then this", streamingBehavior: "steer" }, busy.env);
  await runCommand({ type: "prompt", id: "3", message: "and that" }, busy.env);
  await runCommand({ type: "steer", id: "4", message: "now" }, busy.env);
  await runCommand({ type: "follow_up", id: "5", message: "later" }, busy.env);
  // Always said how to deliver it: Pi uses it only if it turns out to be busy, so a prompt
  // never meets a run that started a moment earlier unannounced.
  expect(idle.did).toEqual([{ send: "go", deliverAs: "followUp" }]);
  expect(busy.did).toEqual([
    { send: "then this", deliverAs: "steer" }, { send: "and that", deliverAs: "followUp" },
    { send: "now", deliverAs: "steer" }, { send: "later", deliverAs: "followUp" },
  ]);
  const images = await runCommand({ type: "prompt", id: "6", message: "look", images: [{ type: "image", data: "AA==", mimeType: "image/png" }] }, idle.env);
  expect(images.success).toBe(true);
  expect(idle.did.at(-1)).toEqual({ send: [{ type: "text", text: "look" }, { type: "image", data: "AA==", mimeType: "image/png" }], deliverAs: "followUp" });
  expect(await runCommand({ type: "get_state", id: "7" }, idle.env)).toEqual({ type: "response", id: "7", command: "get_state", success: true, data: { sessionId: "s-1", isStreaming: false } });
  expect((await runCommand({ type: "get_messages", id: "8" }, idle.env)).data).toEqual({ messages: [{ role: "user" }] });
  expect((await runCommand({ type: "get_available_models", id: "9" }, idle.env)).data).toEqual({ models: [{ id: "m" }] });
  expect((await runCommand({ type: "set_model", id: "10", provider: "p", modelId: "x" }, idle.env)).data).toEqual({ provider: "p", id: "x" });
  expect((await runCommand({ type: "get_available_thinking_levels", id: "11" }, idle.env)).data).toEqual({ levels: ["off", "low"] });
  expect((await runCommand({ type: "get_commands", id: "12" }, idle.env)).data).toEqual({ commands: [{ name: "review" }] });
  expect((await runCommand({ type: "set_thinking_level", id: "13", level: "low" }, idle.env)).success).toBe(true);
  expect((await runCommand({ type: "set_session_name", id: "14", name: "N" }, idle.env)).success).toBe(true);
  expect((await runCommand({ type: "compact", id: "15" }, idle.env)).success).toBe(true);
  expect((await runCommand({ type: "abort", id: "16" }, idle.env)).success).toBe(true);
  expect((await runCommand({ type: "get_session_stats", id: "17" }, idle.env)).data).toEqual({ sessionId: "s-1" });
  const failing = env({ setModel: async () => undefined });
  expect(await runCommand({ type: "set_model", id: "18", provider: "p", modelId: "nope" }, failing.env)).toMatchObject({ success: false, id: "18" });
});

test("a command the terminal cannot run is refused with its id", async () => {
  for (const type of ["bash", "fork", "new_session", "export_html", "made_up"]) {
    expect(await runCommand({ type, id: "x" }, env().env)).toEqual({
      type: "response", id: "x", command: type, success: false, error: "Not available while the session is open in the terminal.",
    });
  }
});

test("the Host's commands are answered over the socket", async () => {
  const pi = await welcomed();
  host.send({ type: "get_state", id: "a" });
  host.send({ type: "prompt", id: "b", message: "from the phone" });
  await host.until(() => host.of("response").length === 2);
  expect(host.of("response")[0]).toMatchObject({ id: "a", command: "get_state", success: true, data: { sessionId: "s-1", sessionFile: "/work/.pi/s-1.jsonl", isStreaming: false, thinkingLevel: "off" } });
  expect(pi.did).toContainEqual({ send: "from the phone", deliverAs: "followUp" });
});

test("a follower takes no typed input until it is handed the session", async () => {
  host.reply = { type: "wilco_bridge_welcome", bridgeProtocolVersion: 1, role: "follower" };
  const pi = await started();
  await host.until(() => host.of("wilco_bridge_hello").length === 1);
  await new Promise((r) => setTimeout(r, 50));
  expect(await pi.fire("input", { text: "typed", source: "interactive" })).toEqual({ action: "handled" });
  expect(pi.did.some((d) => typeof d.notify === "string" && d.notify.includes("Wilco"))).toBe(true);
  // Handed over: the session is read again from its file (Wilco Host's Pi added to it).
  host.send({ type: "wilco_bridge_role", role: "writer" });
  await new Promise((r) => setTimeout(r, 100));
  expect(pi.did).toContainEqual({ send: "/wilco-reload", expandPromptTemplates: true });
  expect(pi.commands.has("wilco-reload")).toBe(true);
});

test("wilco-guard's question goes to the phone, and the phone's answer comes back", async () => {
  const pi = await welcomed();
  const answers: boolean[] = [];
  const first = new AbortController();
  pi.pi.events.emit("wilco:ask", { title: "wilco-guard: run: ls", message: "Pi wants to run a command:\n\nls", signal: first.signal, answer: (v: boolean) => answers.push(v) });
  await host.until(() => host.of("extension_ui_request").length === 1);
  const request = host.of("extension_ui_request")[0];
  expect(request).toMatchObject({ method: "confirm", title: "wilco-guard: run: ls", message: "Pi wants to run a command:\n\nls" });
  host.send({ type: "extension_ui_response", id: request.id, confirmed: true });
  await new Promise((r) => setTimeout(r, 100));
  expect(answers).toEqual([true]);
  // Answered in the terminal first: the phone is told the question is gone.
  const second = new AbortController();
  pi.pi.events.emit("wilco:ask", { title: "wilco-guard: run: pwd", message: "m", signal: second.signal, answer: (v: boolean) => answers.push(v) });
  await host.until(() => host.of("extension_ui_request").length === 2);
  second.abort();
  await host.until(() => host.of("wilco_dialog_closed").length === 1);
  expect(host.of("wilco_dialog_closed")[0]).toEqual({ type: "wilco_dialog_closed", id: host.of("extension_ui_request")[1].id });
  host.send({ type: "extension_ui_response", id: host.of("extension_ui_request")[1].id, cancelled: true });
  await new Promise((r) => setTimeout(r, 50));
  expect(answers).toEqual([true]);
});

test("a terminal question from another extension is shown on the phone", async () => {
  const pi = await welcomed();
  await pi.fire("ui_prompt_start", { reason: "ui_prompt", kind: "select", title: "Which branch?" });
  await pi.fire("ui_prompt_end", {});
  await host.until(() => host.of("wilco_terminal_prompt_end").length === 1);
  expect(host.of("wilco_terminal_prompt")[0]).toEqual({ type: "wilco_terminal_prompt", kind: "select", title: "Which branch?" });
});

test("the socket closes with the session, and a missing Host is tried again", async () => {
  const pi = await started();
  await host.until(() => host.of("wilco_bridge_hello").length === 1);
  await pi.fire("session_shutdown", { reason: "quit" });
  await new Promise((r) => setTimeout(r, 100));
  expect(host.sockets[0].destroyed || host.sockets[0].readableEnded).toBe(true);
  // The Host goes away and comes back: the bridge says hello again.
  const second = await started();
  await host.until(() => host.of("wilco_bridge_hello").length === 2);
  host.sockets.forEach((s) => s.destroy());
  await host.until(() => host.of("wilco_bridge_hello").length === 3, 4000);
  await second.fire("session_shutdown", { reason: "quit" });
});

test("a refused session stays quiet", async () => {
  host.reply = { type: "wilco_bridge_refused", reason: "not_shared" };
  const pi = await started();
  await host.until(() => host.of("wilco_bridge_hello").length === 1);
  await new Promise((r) => setTimeout(r, 50));
  await pi.fire("agent_start");
  await new Promise((r) => setTimeout(r, 1500));
  expect(host.of("agent_start")).toHaveLength(0);
  expect(host.of("wilco_bridge_hello")).toHaveLength(1);
});

test("a message Pi cannot take now is refused, not lost", async () => {
  for (const type of ["prompt", "steer", "follow_up"]) {
    const compacting = env({ isIdle: () => false, isCompacting: () => true });
    const refused = await runCommand({ type, id: "1", message: "go" }, compacting.env);
    expect(refused).toMatchObject({ type: "response", id: "1", command: type, success: false });
    expect(refused.error).toContain("compact");
    expect(compacting.did).toEqual([]);
    const noModel = env({ hasModel: () => false });
    expect(await runCommand({ type, id: "2", message: "go" }, noModel.env)).toMatchObject({ success: false, error: "No model is selected in the terminal." });
    expect(noModel.did).toEqual([]);
  }
});

test("only a message that waits is shown as queued, and the queue is settled with Pi's", async () => {
  const pi = await welcomed();
  host.send({ type: "prompt", id: "p1", message: "now" });
  await host.until(() => host.of("response").length === 1);
  expect(host.of("queue_update")).toEqual([]);
  expect(pi.did).toContainEqual({ send: "now", deliverAs: "followUp" });
  pi.setIdle(false);
  host.send({ type: "steer", id: "p2", message: "careful" });
  await host.until(() => host.of("queue_update").length === 1);
  expect(host.of("queue_update")[0]).toEqual({ type: "queue_update", steering: ["careful"], followUp: [] });
  // Pi let go of it without running it (cleared in the terminal): the phone stops showing it.
  pi.setIdle(true);
  await pi.fire("agent_settled", {});
  await host.until(() => host.of("queue_update").length === 2);
  expect(host.of("queue_update")[1]).toEqual({ type: "queue_update", steering: [], followUp: [] });
});

test("a terminal waiting for another terminal says so, keeps trying, and reloads when it gets the session", async () => {
  const saved = { ...timing };
  Object.assign(timing, { first: 100, max: 200 });
  try {
    host.reply = { type: "wilco_bridge_refused", reason: "another_writer" };
    const pi = await started();
    await host.until(() => host.of("wilco_bridge_hello").length === 1);
    await new Promise((r) => setTimeout(r, 50));
    expect(pi.did.some((d) => typeof d.notify === "string" && d.notify.includes("another terminal"))).toBe(true);
    expect(await pi.fire("input", { text: "typed", source: "interactive" })).toEqual({ action: "handled" });
    await host.until(() => host.of("wilco_bridge_hello").length >= 2, 2000);
    host.reply = { type: "wilco_bridge_welcome", bridgeProtocolVersion: 1, role: "writer" };
    await host.until(() => pi.did.some((d) => d.send === "/wilco-reload"), 2000);
    expect(await pi.fire("input", { text: "typed", source: "interactive" })).toBeUndefined();
  } finally {
    Object.assign(timing, saved);
  }
});

test("a follower of another terminal is told whose session it is", async () => {
  host.reply = { type: "wilco_bridge_welcome", bridgeProtocolVersion: 1, role: "follower", holder: "terminal" };
  const pi = await welcomed();
  expect(pi.did.some((d) => typeof d.notify === "string" && d.notify.includes("another terminal"))).toBe(true);
  expect(await pi.fire("input", { text: "typed", source: "interactive" })).toEqual({ action: "handled" });
});

test("a follower that loses the Host reads the session again and takes typing", async () => {
  host.reply = { type: "wilco_bridge_welcome", bridgeProtocolVersion: 1, role: "follower" };
  const pi = await welcomed();
  host.sockets.forEach((s) => s.destroy());
  await host.until(() => pi.did.some((d) => d.send === "/wilco-reload"));
  expect(await pi.fire("input", { text: "typed", source: "interactive" })).toBeUndefined();
});

test("a follower that comes back as the writer reads the session again first", async () => {
  const saved = { ...timing };
  Object.assign(timing, { first: 100, max: 200 });
  try {
    host.reply = { type: "wilco_bridge_welcome", bridgeProtocolVersion: 1, role: "follower" };
    const pi = await welcomed();
    // The Host restarts (its Pi, and the run, are gone) and welcomes the terminal as the writer.
    host.reply = { type: "wilco_bridge_welcome", bridgeProtocolVersion: 1, role: "writer" };
    host.sockets.forEach((s) => s.destroy());
    await host.until(() => host.of("wilco_bridge_hello").length === 2, 2000);
    expect(pi.did.filter((d) => d.send === "/wilco-reload")).toHaveLength(1);
  } finally {
    Object.assign(timing, saved);
  }
});

test("a Host that hangs up before answering is tried less and less often", async () => {
  const saved = { ...timing };
  Object.assign(timing, { first: 100, max: 400 });
  try {
    host.reply = null;
    await started();
    await new Promise((r) => setTimeout(r, 1300));
    // 0, 100, 300, 700, 1100 ms: never every 100 ms.
    expect(host.of("wilco_bridge_hello").length).toBeLessThanOrEqual(6);
    expect(host.of("wilco_bridge_hello").length).toBeGreaterThanOrEqual(3);
  } finally {
    Object.assign(timing, saved);
  }
});

test("a folder that is not shared is tried again quietly, so sharing it later works", async () => {
  const saved = { ...timing };
  Object.assign(timing, { notShared: 200 });
  try {
    host.reply = { type: "wilco_bridge_refused", reason: "not_shared" };
    const pi = await started();
    await host.until(() => host.of("wilco_bridge_hello").length === 2, 2000);
    expect(pi.did.filter((d) => d.notify)).toEqual([]);
    host.reply = { type: "wilco_bridge_welcome", bridgeProtocolVersion: 1, role: "writer" };
    await host.until(() => host.of("wilco_bridge_hello").length === 3, 2000);
    await new Promise((r) => setTimeout(r, 50));
    await pi.fire("agent_start");
    await host.until(() => host.of("agent_start").length === 1);
  } finally {
    Object.assign(timing, saved);
  }
});

test("a Host of another version is named once and not tried again", async () => {
  host.reply = { type: "wilco_bridge_refused", reason: "unsupported_version" };
  const pi = await started();
  await host.until(() => host.of("wilco_bridge_hello").length === 1);
  await new Promise((r) => setTimeout(r, 1500));
  expect(host.of("wilco_bridge_hello")).toHaveLength(1);
  expect(pi.did.filter((d) => typeof d.notify === "string" && d.notify.includes("version"))).toHaveLength(1);
});

test("loaded twice (from Wilco Host and from the npm package), the bridge runs once", async () => {
  const first = fakePi();
  wilcoBridge(first.pi as never);
  const second = fakePi(first.pi.events);
  wilcoBridge(second.pi as never);
  await first.fire("session_start", { reason: "startup" });
  await second.fire("session_start", { reason: "startup" });
  open.push(first, second);
  await host.until(() => host.of("wilco_bridge_hello").length === 1);
  await new Promise((r) => setTimeout(r, 200));
  expect(host.of("wilco_bridge_hello")).toHaveLength(1);
  expect(second.commands.size).toBe(0);
});

test("a question still waiting is asked again when the terminal reconnects", async () => {
  const saved = { ...timing };
  Object.assign(timing, { first: 100, max: 200 });
  try {
    const pi = await welcomed();
    const answers: boolean[] = [];
    pi.pi.events.emit("wilco:ask", { title: "wilco-guard: run: rm -rf x", message: "m", signal: new AbortController().signal, answer: (v: boolean) => answers.push(v) });
    await host.until(() => host.of("extension_ui_request").length === 1);
    host.sockets.forEach((s) => s.destroy());
    await host.until(() => host.of("extension_ui_request").length === 2, 2000);
    const again = host.of("extension_ui_request")[1];
    expect(again).toEqual(host.of("extension_ui_request")[0]);
    host.send({ type: "extension_ui_response", id: again.id, confirmed: false });
    await new Promise((r) => setTimeout(r, 100));
    expect(answers).toEqual([false]);
  } finally {
    Object.assign(timing, saved);
  }
});

test("wilco-guard's own question is not also shown as a terminal question", async () => {
  const pi = await welcomed();
  await pi.fire("ui_prompt_start", { reason: "ui_prompt", kind: "confirm", title: "wilco-guard: run: rm -rf x" });
  await pi.fire("ui_prompt_end", {});
  await pi.fire("agent_start");
  await host.until(() => host.of("agent_start").length === 1);
  expect(host.of("wilco_terminal_prompt")).toEqual([]);
  expect(host.of("wilco_terminal_prompt_end")).toEqual([]);
});

test("the terminal's notes speak the user's language", async () => {
  const saved = process.env.LANG;
  process.env.LANG = "zh_CN.UTF-8";
  try {
    host.reply = { type: "wilco_bridge_welcome", bridgeProtocolVersion: 1, role: "follower" };
    const pi = await welcomed();
    expect(pi.did.some((d) => typeof d.notify === "string" && d.notify.includes("Wilco") && /[\u4e00-\u9fff]/.test(d.notify))).toBe(true);
  } finally {
    if (saved === undefined) delete process.env.LANG;
    else process.env.LANG = saved;
  }
});
