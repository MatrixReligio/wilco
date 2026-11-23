import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, readdir as readdirFs, rm, stat, writeFile } from "node:fs/promises";
import { piVersion, recordAll, recordScenario } from "../src/record.ts";
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
    // Decoy "user" environment: if any of it reaches Pi, the recording fails or leaks a sentinel.
    const decoy = await mkdtemp(path.join(os.tmpdir(), "wilco-decoy-"));
    const decoyAgent = path.join(decoy, "agent");
    await mkdir(path.join(decoyAgent, "skills", "wilco-decoy-skill"), { recursive: true });
    await writeFile(path.join(decoyAgent, "skills", "wilco-decoy-skill", "SKILL.md"), "---\nname: wilco-decoy-skill\ndescription: decoy\n---\nDECOY\n");
    await writeFile(path.join(decoyAgent, "settings.json"), JSON.stringify({ defaultProvider: "wilco-decoy-provider" }));
    await writeFile(path.join(decoyAgent, "auth.json"), JSON.stringify({ openai: { type: "api_key", key: "sk-wilco-decoy-auth" } }));
    const snapshot = async () =>
      Promise.all(
        (await readdirFs(decoy, { recursive: true })).sort().map(async (f) => `${f}:${(await stat(path.join(decoy, f))).mtimeMs}`),
      );
    const before = await snapshot();
    const saved = { ...process.env };
    Object.assign(process.env, {
      HOME: decoy,
      PI_CODING_AGENT_DIR: decoyAgent,
      PI_MANAGED_INSTALL_ROOT: path.join(decoy, "install"),
      OPENAI_API_KEY: "sk-wilco-decoy-env",
    });
    try {
      const [scenario] = await loadScenarios(["state-models-commands"]);
      const text = JSON.stringify(await recordScenario(scenario, { piPath: piPath! }));
      for (const sentinel of ["wilco-decoy", "sk-wilco-decoy", "<HOME>", decoy, saved.HOME!]) {
        expect(text, sentinel).not.toContain(sentinel);
      }
      expect(await snapshot()).toEqual(before);
    } finally {
      for (const key of ["HOME", "PI_CODING_AGENT_DIR", "PI_MANAGED_INSTALL_ROOT", "OPENAI_API_KEY"]) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
      await rm(decoy, { recursive: true, force: true });
    }
  });

  test("every scenario completes", async () => {
    const out = await mkdtemp(path.join(os.tmpdir(), "wilco-fixtures-"));
    try {
      const { piVersion: recordedVersion, scenarios } = await recordAll({ piPath: piPath!, outDir: out, names: "all" });
      const version = await piVersion(piPath!); // isolated: never runs pi with the real environment
      expect(recordedVersion).toBe(version);
      expect(scenarios).toHaveLength(9);
      const manifest = JSON.parse(await readFile(path.join(out, version, "manifest.json"), "utf8"));
      expect(manifest).toEqual({ piVersion: version, scenarios });
      const files = (await readdir(path.join(out, version))).filter((f) => f.endsWith(".jsonl")).sort();
      expect(files).toEqual(scenarios.map((s: string) => `${s}.jsonl`).sort());
      const sessionFile = await readFile(path.join(out, version, "sessions", "session-tree", "1.jsonl"), "utf8");
      const header = JSON.parse(sessionFile.split("\n")[0]);
      expect(header).toMatchObject({ type: "session", cwd: "<TMP>/work" });
      expect(sessionFile).not.toContain(os.homedir());
      for (const f of files) {
        const text = await readFile(path.join(out, version, f), "utf8");
        expect(text, f).not.toContain(os.homedir());
        expect(text, f).not.toContain("<HOME>");
      }
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
