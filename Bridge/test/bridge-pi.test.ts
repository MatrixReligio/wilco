// wilco-bridge in a real Pi TUI (isolated: temporary HOME and agent folder, scripted model),
// run on a pseudo-terminal and connected to a stand-in for Wilco Host's socket.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { access, cp, mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { startMockLLM } from "@matrixreligio/wilco-mock-llm/src/server.ts";
import { isolate } from "../../Tools/fixture-recorder/src/isolate.ts";
import { resolvePiExecutable } from "../../Tools/fixture-recorder/src/pi-executable.ts";

type Rec = Record<string, any>;
const here = path.dirname(fileURLToPath(import.meta.url));
const bridge = path.join(here, "..", "src", "bridge.ts");
const guard = path.join(here, "..", "src", "guard.ts");
const ptyRun = path.join(here, "pty-run.py");

function findPi(): string | undefined {
  if (process.env.PI_PATH) return process.env.PI_PATH;
  try {
    return execFileSync("sh", ["-c", "command -v pi"], { encoding: "utf8" }).trim() || undefined;
  } catch {
    return undefined;
  }
}
const piPath = findPi();

const bashTurn = (command: string, id: string) => ({ toolCalls: [{ id, name: "bash", arguments: { command } }] });
const done = { text: ["Done."] };

/** Stands in for Wilco Host: accepts the terminal's connection and records what it says. */
class FakeHost {
  received: Rec[] = [];
  private socket: net.Socket | undefined;
  private notify = () => {};
  readonly server: net.Server;

  constructor() {
    this.server = net.createServer((socket) => {
      this.socket = socket;
      let pending = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        pending += chunk;
        let nl: number;
        while ((nl = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, nl);
          pending = pending.slice(nl + 1);
          if (line.trim()) this.received.push(JSON.parse(line));
        }
        this.notify();
      });
      socket.on("error", () => {});
    });
  }

  listen(file: string): Promise<void> {
    return new Promise((resolve) => this.server.listen(file, resolve));
  }

  send(record: Rec): void {
    this.socket!.write(JSON.stringify(record) + "\n");
  }

  async waitFor(match: (r: Rec) => boolean, what: string, from = 0, timeout = 30_000): Promise<{ record: Rec; index: number }> {
    const deadline = Date.now() + timeout;
    for (;;) {
      const index = this.received.findIndex((r, i) => i >= from && match(r));
      if (index >= 0) return { record: this.received[index], index };
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}; got ${this.received.map((r) => r.type).join(",")}`);
      await Promise.race([new Promise<void>((r) => (this.notify = r)), sleep(100)]);
    }
  }

  of(type: string): Rec[] {
    return this.received.filter((r) => r.type === type);
  }

  /** Sends a command and waits for its response. */
  async command(record: Rec): Promise<{ record: Rec; index: number }> {
    const from = this.received.length;
    this.send(record);
    return this.waitFor((r) => r.type === "response" && r.id === record.id, `response ${record.id}`, from);
  }

  close(): Promise<void> {
    this.socket?.destroy();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}

type Terminal = { host: FakeHost; cwd: string; type(text: string): void; screen(): string };

/** A real Pi TUI with wilco-bridge (and wilco-guard) in an isolated home, said hello and welcomed. */
async function withTerminal(turns: object[], run: (terminal: Terminal) => Promise<void>,
  options: { twice?: boolean; role?: "writer" | "follower" } = {}) {
  const llm = await startMockLLM({ port: 0, script: { turns } as never });
  const iso = await isolate(llm.url);
  const host = new FakeHost();
  const socket = path.join(iso.root, "b.sock");
  await host.listen(socket);
  const extensions = [bridge, guard];
  if (options.twice) {
    // A second copy, as when the npm package is installed besides Wilco Host's own.
    const copy = path.join(iso.root, "npm-copy");
    await cp(path.join(here, "..", "src"), copy, { recursive: true });
    extensions.push(path.join(copy, "bridge.ts"), path.join(copy, "guard.ts"));
  }
  const args = iso.args({ extensions, useSessionDir: true } as never)
    .filter((arg, i, all) => arg !== "--mode" && all[i - 1] !== "--mode");
  const child: ChildProcess = spawn("python3", ["-I", ptyRun, await resolvePiExecutable(piPath!), ...args], {
    cwd: iso.cwd,
    env: { ...iso.env, TERM: "xterm-256color", WILCO_BRIDGE_SOCKET: socket, WILCO_GUARD_POLICY: path.join(iso.root, "guard", "policy.json") },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let screen = "";
  child.stdout!.on("data", (chunk) => (screen += chunk));
  child.stderr!.on("data", (chunk) => (screen += chunk));
  const terminal: Terminal = { host, cwd: iso.cwd, type: (text) => child.stdin!.write(text), screen: () => screen };
  try {
    const { record: hello } = await host.waitFor((r) => r.type === "wilco_bridge_hello", "hello");
    expect(hello.cwd).toBe(iso.cwd);
    host.send({ type: "wilco_bridge_welcome", bridgeProtocolVersion: 1, role: options.role ?? "writer" });
    await sleep(1500); // the TUI finishes drawing before it takes typing
    await run(terminal);
  } catch (error) {
    throw new Error(`${(error as Error).message}\n--- screen ---\n${screen.slice(-3000)}`);
  } finally {
    // pty-run.py closes the terminal and returns once Pi has exited (at most ~5 s).
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((r) => child.once("exit", r));
      child.kill("SIGTERM");
      await Promise.race([exited, sleep(10_000)]);
    }
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await host.close();
    await llm.close();
    await iso.cleanup();
  }
}

const exists = (file: string) => access(file).then(() => true, () => false);

describe.skipIf(!piPath)("wilco-bridge in a real Pi TUI", () => {
  test("the Host hears hello and follows a run typed in the terminal", { timeout: 90_000 }, async () => {
    await withTerminal([bashTurn("echo hi", "call_1"), done], async ({ host, type }) => {
      const hello = host.received.find((r) => r.type === "wilco_bridge_hello")!;
      expect(hello.bridgeProtocolVersion).toBe(1);
      expect(typeof hello.sessionId).toBe("string");
      expect(hello.commands).toContain("prompt");
      const from = host.received.length;
      type("run it");
      await sleep(300);
      type("\r");
      await host.waitFor((r) => r.type === "agent_start", "agent_start", from);
      const update = await host.waitFor((r) => r.type === "message_update", "message_update", from);
      expect(update.record.assistantMessageEvent?.type).toBeTypeOf("string");
      const tool = await host.waitFor((r) => r.type === "tool_execution_end", "tool end", from);
      expect(tool.record.toolName).toBe("bash");
      const turn = await host.waitFor((r) => r.type === "turn_end", "turn_end", from);
      expect(turn.record.message).toBeDefined();
      expect(Array.isArray(turn.record.toolResults)).toBe(true);
      await host.waitFor((r) => r.type === "agent_end", "agent_end", from);
    });
  });

  test("a prompt from the Host runs, and abort stops a long tool", { timeout: 90_000 }, async () => {
    await withTerminal([bashTurn("sleep 30", "call_1"), done], async ({ host }) => {
      const from = host.received.length;
      const { record } = await host.command({ type: "prompt", id: "h1", message: "wait a while" });
      expect(record.success).toBe(true);
      await host.waitFor((r) => r.type === "tool_execution_start", "tool start", from);
      const started = Date.now();
      expect((await host.command({ type: "abort", id: "h2" })).record.success).toBe(true);
      await host.waitFor((r) => r.type === "agent_end", "agent_end after abort", from, 15_000);
      expect(Date.now() - started).toBeLessThan(15_000);
      // The terminal's state says it is idle again.
      const state = await host.command({ type: "get_state", id: "h3" });
      expect(state.record.data.isStreaming).toBe(false);
    });
  });

  test("wilco-guard's question is answered from the Host", { timeout: 90_000 }, async () => {
    await withTerminal([bashTurn("rm -rf build", "call_1"), done], async ({ host, cwd }) => {
      await mkdir(path.join(cwd, "build"));
      const from = host.received.length;
      await host.command({ type: "prompt", id: "h1", message: "clean up" });
      const { record } = await host.waitFor((r) => r.type === "extension_ui_request" && r.method === "confirm", "the question", from);
      expect(record.title).toBe("wilco-guard: run: rm -rf build");
      host.send({ type: "extension_ui_response", id: record.id, confirmed: true });
      await host.waitFor((r) => r.type === "agent_end", "agent_end", from);
      expect(await exists(path.join(cwd, "build"))).toBe(false);
    });
  });

  test("loaded twice, the bridge and wilco-guard each run once, and a waiting terminal reloads", { timeout: 90_000 }, async () => {
    await withTerminal([bashTurn("rm -rf build", "call_1"), done], async ({ host, cwd }) => {
      await sleep(1000);
      expect(host.of("wilco_bridge_hello")).toHaveLength(1);
      // Handed the session: /wilco-reload runs (it is not sent to the model as a prompt), and the
      // reloaded session says hello again.
      host.send({ type: "wilco_bridge_role", role: "writer" });
      const before = host.received.length;
      await host.waitFor((r) => r.type === "wilco_bridge_hello", "hello after the reload", before);
      await sleep(500);
      expect(host.of("wilco_bridge_hello")).toHaveLength(2);
    }, { twice: true, role: "follower" });
  });

  test("loaded twice, wilco-guard asks once", { timeout: 90_000 }, async () => {
    await withTerminal([bashTurn("rm -rf build", "call_1"), done], async ({ host, cwd }) => {
      await mkdir(path.join(cwd, "build"));
      const from = host.received.length;
      await host.command({ type: "prompt", id: "h1", message: "clean up" });
      const { record } = await host.waitFor((r) => r.type === "extension_ui_request" && r.method === "confirm", "the question", from);
      host.send({ type: "extension_ui_response", id: record.id, confirmed: true });
      await host.waitFor((r) => r.type === "agent_end", "agent_end", from);
      expect(host.received.slice(from).filter((r) => r.type === "extension_ui_request")).toHaveLength(1);
      expect(await exists(path.join(cwd, "build"))).toBe(false);
    }, { twice: true });
  });
});
