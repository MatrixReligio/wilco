import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { startMockLLM } from "@matrixreligio/wilco-mock-llm/src/server.ts";
import { isolate } from "../../Tools/fixture-recorder/src/isolate.ts";
import { resolvePiExecutable } from "../../Tools/fixture-recorder/src/pi-executable.ts";

type Rec = Record<string, any>;
const guard = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "guard.ts");

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

/** Runs a real, isolated Pi with wilco-guard and the scripted model; never touches the user's Pi. */
async function withPi(turns: object[], run: (pi: Driver) => Promise<void>) {
  const llm = await startMockLLM({ port: 0, script: { turns } as never });
  const iso = await isolate(llm.url);
  const policyFile = path.join(iso.root, "guard-policy.json");
  const child = spawn(await resolvePiExecutable(piPath!), iso.args({ extensions: [guard] } as never), {
    cwd: iso.cwd,
    env: { ...iso.env, WILCO_GUARD_POLICY: policyFile },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const driver = new Driver(child, iso.cwd, policyFile);
  try {
    await run(driver);
  } catch (error) {
    throw new Error(`${(error as Error).message}\n--- pi stderr ---\n${driver.stderr.slice(-3000)}`);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([new Promise((r) => child.once("exit", r)), sleep(3000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await llm.close();
    await iso.cleanup();
  }
}

class Driver {
  received: Rec[] = [];
  stderr = "";
  private notify = () => {};
  private exited = false;

  private child: ReturnType<typeof spawn>;
  readonly cwd: string;
  readonly policyFile: string;

  constructor(child: ReturnType<typeof spawn>, cwd: string, policyFile: string) {
    this.child = child;
    this.cwd = cwd;
    this.policyFile = policyFile;
    let pending = "";
    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      pending += chunk;
      let nl: number;
      while ((nl = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, nl);
        pending = pending.slice(nl + 1);
        if (line.trim()) this.received.push(JSON.parse(line));
      }
      this.notify();
    });
    child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (chunk: string) => (this.stderr += chunk));
    child.once("exit", () => {
      this.exited = true;
      this.notify();
    });
  }

  send(record: Rec) {
    this.child.stdin!.write(JSON.stringify(record) + "\n");
  }

  async waitFor(match: (r: Rec) => boolean, what: string, from = 0): Promise<{ record: Rec; index: number }> {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const index = this.received.findIndex((r, i) => i >= from && match(r));
      if (index >= 0) return { record: this.received[index], index };
      if (this.exited) throw new Error(`pi exited while waiting for ${what}`);
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}; got ${this.received.map((r) => r.type).join(",")}`);
      await Promise.race([new Promise<void>((r) => (this.notify = r)), sleep(100)]);
    }
  }

  async prompt(message: string, id: string) {
    const from = this.received.length;
    this.send({ type: "prompt", id, message });
    await this.waitFor((r) => r.type === "response" && r.id === id, `response ${id}`, from);
    return from;
  }

  confirms(from = 0) {
    return this.received.slice(from).filter((r) => r.type === "extension_ui_request" && r.method === "confirm");
  }
}

const exists = (file: string) => access(file).then(() => true, () => false);

describe.skipIf(!piPath)("wilco-guard in a real Pi", () => {
  test("a declined dangerous command is blocked", async () => {
    await withPi([bashTurn("rm -rf build", "call_1"), done], async (pi) => {
      await mkdir(path.join(pi.cwd, "build"));
      const from = await pi.prompt("clean up", "p1");
      const { record } = await pi.waitFor((r) => r.type === "extension_ui_request" && r.method === "confirm", "confirm", from);
      expect(record.title).toBe("wilco-guard: run: rm -rf build");
      expect(record.message).toContain("rm -r");
      expect(record.timeout).toBeUndefined();
      pi.send({ type: "extension_ui_response", id: record.id, confirmed: false });
      const end = await pi.waitFor((r) => r.type === "tool_execution_end", "tool end", from);
      expect(JSON.stringify(end.record)).toContain("Blocked in Wilco: the owner declined (rm -r)");
      await pi.waitFor((r) => r.type === "agent_end", "agent end", from);
      expect(await exists(path.join(pi.cwd, "build"))).toBe(true);
    });
  });

  test("an approved dangerous command runs", async () => {
    await withPi([bashTurn("rm -rf build", "call_1"), done], async (pi) => {
      await mkdir(path.join(pi.cwd, "build"));
      const from = await pi.prompt("clean up", "p1");
      const { record } = await pi.waitFor((r) => r.type === "extension_ui_request" && r.method === "confirm", "confirm", from);
      pi.send({ type: "extension_ui_response", id: record.id, confirmed: true });
      await pi.waitFor((r) => r.type === "agent_end", "agent end", from);
      expect(await exists(path.join(pi.cwd, "build"))).toBe(false);
    });
  });

  test("a policy change applies to the running session", async () => {
    const turns = [bashTurn("rm -rf one", "call_1"), done, bashTurn("rm -rf two", "call_2"), done];
    await withPi(turns, async (pi) => {
      await mkdir(path.join(pi.cwd, "one"));
      await mkdir(path.join(pi.cwd, "two"));
      const first = await pi.prompt("first", "p1");
      const { record } = await pi.waitFor((r) => r.type === "extension_ui_request" && r.method === "confirm", "confirm", first);
      pi.send({ type: "extension_ui_response", id: record.id, confirmed: true });
      await pi.waitFor((r) => r.type === "agent_end", "agent end", first);

      await writeFile(pi.policyFile, JSON.stringify({ dangerousCommands: false }));
      const second = await pi.prompt("second", "p2");
      await pi.waitFor((r) => r.type === "agent_end", "agent end", second);
      expect(pi.confirms(second)).toEqual([]);
      expect(await exists(path.join(pi.cwd, "two"))).toBe(false);
    });
  });

  test("ordinary commands are not asked about", async () => {
    await withPi([bashTurn("ls", "call_1"), done], async (pi) => {
      const from = await pi.prompt("look", "p1");
      await pi.waitFor((r) => r.type === "agent_end", "agent end", from);
      expect(pi.confirms(from)).toEqual([]);
    });
  });
});
