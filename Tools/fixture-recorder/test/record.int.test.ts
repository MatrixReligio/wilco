import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { recordAll, recordScenario } from "../src/record.ts";
import { loadScenarios } from "../src/scenario.ts";

function findPi(): string | undefined {
  if (process.env.PI_PATH) return process.env.PI_PATH;
  try {
    return execFileSync("sh", ["-c", "command -v pi"], { encoding: "utf8" }).trim() || undefined;
  } catch {
    return undefined;
  }
}

const piPath = findPi();

describe.skipIf(!piPath)("recording against real Pi", () => {
  test("records state-models-commands deterministically", async () => {
    const [scenario] = await loadScenarios(["state-models-commands"]);
    const a = await recordScenario(scenario, { piPath: piPath! });
    const b = await recordScenario(scenario, { piPath: piPath! });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a[0]).toEqual({ dir: "send", record: { type: "get_state", id: "c1" } });
  });

  test("recordingIsIsolatedFromUserEnvironment", async () => {
    const [scenario] = await loadScenarios(["state-models-commands"]);
    const lines = await recordScenario(scenario, { piPath: piPath! });
    expect(JSON.stringify(lines)).not.toContain(os.homedir());
    const commands = lines.find(
      (l) => l.dir === "recv" && (l.record as any)?.type === "response" && (l.record as any)?.command === "get_commands",
    );
    expect(commands).toBeDefined();
    const list = ((commands!.record as any).data?.commands ?? []) as { source?: string }[];
    expect(list.filter((c) => c.source === "skill")).toEqual([]);
  });

  test("every scenario completes", async () => {
    const out = await mkdtemp(path.join(os.tmpdir(), "wilco-fixtures-"));
    try {
      const { piVersion, scenarios } = await recordAll({ piPath: piPath!, outDir: out, names: "all" });
      const version = execFileSync(piPath!, ["--version"], { encoding: "utf8" }).trim();
      expect(piVersion).toBe(version);
      expect(scenarios).toHaveLength(9);
      const manifest = JSON.parse(await readFile(path.join(out, version, "manifest.json"), "utf8"));
      expect(manifest).toEqual({ piVersion: version, scenarios });
      const files = (await readdir(path.join(out, version))).filter((f) => f.endsWith(".jsonl")).sort();
      expect(files).toEqual(scenarios.map((s: string) => `${s}.jsonl`).sort());
      for (const f of files) {
        const text = await readFile(path.join(out, version, f), "utf8");
        expect(text, f).not.toContain(os.homedir());
      }
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
