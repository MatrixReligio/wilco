import { spawn, execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { startMockLLM } from "@matrixreligio/wilco-mock-llm/src/server.ts";
import { isolate } from "./isolate.ts";
import { normalize, type FixtureLine } from "./normalize.ts";
import { loadScenarios, resolveRefs, type Scenario } from "./scenario.ts";

const STEP_TIMEOUT_MS = 15_000;
const EXIT_TIMEOUT_MS = 10_000;

type Rec = Record<string, any>;

/** Runs one scenario against a real Pi in an isolated environment and returns its normalized transcript. */
export async function recordScenario(s: Scenario, opts: { piPath: string }): Promise<FixtureLine[]> {
  const llm = await startMockLLM({ port: 0, script: s.mock });
  const iso = await isolate(llm.url);
  const child = spawn(opts.piPath, iso.args(s), { cwd: iso.cwd, env: iso.env, stdio: ["pipe", "pipe", "pipe"] });

  const lines: FixtureLine[] = [];
  const received: Rec[] = [];
  let stderr = "";
  let exited = false;
  const exit = new Promise<void>((resolve) => child.once("exit", () => ((exited = true), resolve())));
  let notify = () => {};

  // LF-only framing: U+2028/U+2029 inside JSON strings must not split records.
  let pending = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    pending += chunk;
    let nl: number;
    while ((nl = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, nl).replace(/\r$/, "");
      pending = pending.slice(nl + 1);
      if (!line) continue;
      try {
        const record = JSON.parse(line) as Rec;
        received.push(record);
        lines.push({ dir: "recv", record });
      } catch {
        stderr += `[non-JSON stdout] ${line}\n`;
      }
    }
    notify();
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => (stderr += chunk));

  const write = (text: string) => child.stdin.write(`${text}\n`);

  /** Waits for the first received record at index >= from that matches. */
  async function waitFor(from: number, match: (r: Rec) => boolean, what: string): Promise<number> {
    const deadline = Date.now() + STEP_TIMEOUT_MS;
    for (;;) {
      for (let i = from; i < received.length; i++) if (match(received[i])) return i;
      if (exited) throw new Error(`pi exited while waiting for ${what}`);
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out waiting for ${what}`);
      await Promise.race([new Promise<void>((r) => (notify = r)), sleep(Math.min(left, 100))]);
    }
  }

  let nextId = 1;
  let cursor = 0;
  let lastCommand: { id: string | undefined; at: number } | undefined;
  const lastResponse = new Map<string, unknown>();

  try {
    for (const [index, step] of s.steps.entries()) {
      const where = `${s.name} step ${index + 1} ${JSON.stringify(step)}`;
      try {
        if ("send" in step) {
          const record = resolveRefs(step.send, lastResponse) as Rec;
          if (record.id === undefined) record.id = `c${nextId++}`;
          lastCommand = { id: String(record.id), at: received.length };
          lines.push({ dir: "send", record });
          write(JSON.stringify(record));
        } else if ("sendRaw" in step) {
          lastCommand = { id: undefined, at: received.length };
          lines.push({ dir: "send", raw: step.sendRaw });
          write(step.sendRaw);
        } else if ("respondUI" in step) {
          const { method, ...answer } = step.respondUI;
          const i = await waitFor(cursor, (r) => r.type === "extension_ui_request" && r.method === method, `ui ${method}`);
          cursor = i + 1;
          const record = { type: "extension_ui_response", id: received[i].id, ...answer };
          lines.push({ dir: "send", record });
          write(JSON.stringify(record));
        } else if ("sleepMs" in step) {
          await sleep(step.sleepMs);
        } else if (step.await === "response") {
          if (!lastCommand) throw new Error("no command sent yet");
          const { id, at } = lastCommand;
          const i = await waitFor(at, (r) => r.type === "response" && r.id === id, `response to ${id ?? "raw input"}`);
          lastResponse.set(String(received[i].command), received[i]);
        } else {
          const from = Math.max(cursor, lastCommand?.at ?? 0);
          const sub = step.assistantEvent;
          const i = await waitFor(
            from,
            (r) => r.type === step.type && (sub === undefined || r.assistantMessageEvent?.type === sub),
            `event ${step.type}${sub ? `/${sub}` : ""}`,
          );
          cursor = i + 1;
        }
      } catch (error) {
        throw new Error(`${where}: ${(error as Error).message}\n--- pi stderr ---\n${stderr.slice(-4000)}`);
      }
    }
    child.stdin.end();
    const timer = setTimeout(() => child.kill("SIGTERM"), EXIT_TIMEOUT_MS);
    await exit;
    clearTimeout(timer);
    return normalize(lines, { tmpRoot: iso.root, mockURL: llm.url, homeDir: os.homedir() });
  } finally {
    if (!exited) {
      child.kill("SIGTERM");
      await Promise.race([exit, sleep(2_000)]);
      if (!exited) child.kill("SIGKILL");
    }
    await llm.close();
    await iso.cleanup();
  }
}

export async function piVersion(piPath: string): Promise<string> {
  const iso = await isolate("http://127.0.0.1:9/v1");
  try {
    const { stdout } = await promisify(execFile)(piPath, ["--version"], { env: iso.env, cwd: iso.cwd });
    return stdout.trim();
  } finally {
    await iso.cleanup();
  }
}

export function serialize(lines: FixtureLine[]): string {
  return lines.map((l) => JSON.stringify(l.raw !== undefined ? { dir: l.dir, raw: l.raw } : { dir: l.dir, record: l.record })).join("\n") + "\n";
}

/** Records scenarios into <outDir>/<piVersion>/ and writes manifest.json. */
export async function recordAll(opts: {
  piPath: string;
  outDir: string;
  names: string[] | "all";
  log?: (message: string) => void;
}): Promise<{ piVersion: string; scenarios: string[] }> {
  const version = await piVersion(opts.piPath);
  const dir = path.join(opts.outDir, version);
  await mkdir(dir, { recursive: true });
  const scenarios = await loadScenarios(opts.names);
  for (const s of scenarios) {
    opts.log?.(`recording ${s.name}`);
    await writeFile(path.join(dir, `${s.name}.jsonl`), serialize(await recordScenario(s, { piPath: opts.piPath })));
  }
  const names = scenarios.map((s) => s.name).sort();
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify({ piVersion: version, scenarios: names }, null, 2) + "\n");
  return { piVersion: version, scenarios: names };
}
