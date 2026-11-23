import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Scenario } from "./scenario.ts";

export type Isolation = {
  root: string;
  /** Where Pi writes session files for scenarios with useSessionDir. */
  sessionsDir: string;
  env: NodeJS.ProcessEnv;
  cwd: string;
  args(s: Scenario): string[];
  cleanup(): Promise<void>;
};

/** Environment variables passed through to Pi. Everything else (API keys, tokens, PI_* settings) is dropped. */
const PASSTHROUGH = ["PATH", "LANG", "LC_ALL", "TERM", "TZ"];

const ISOLATION_FLAGS = [
  "--no-skills",
  "--no-prompt-templates",
  "--no-context-files",
  "--no-mcp",
  "--no-extensions",
  "--no-themes",
];

/**
 * Creates a throw-away HOME and agent dir so a recording never reads or writes
 * the user's Pi configuration, sessions, skills, extensions or credentials.
 */
export async function isolate(mockURL: string): Promise<Isolation> {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "wilco-rec-")));
  const home = path.join(root, "home");
  const agent = path.join(root, "agent");
  const cwd = path.join(root, "work");
  const sessions = path.join(root, "sessions");
  await Promise.all([home, agent, cwd, sessions].map((dir) => mkdir(dir, { recursive: true })));
  await writeFile(
    path.join(agent, "models.json"),
    JSON.stringify(
      {
        providers: {
          mock: { baseUrl: mockURL, api: "openai-completions", apiKey: "mock", models: [{ id: "mock-1" }] },
        },
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(cwd, "README.md"), "# Fixture workspace\n\nA scratch project used while recording Pi fixtures.\n");

  const env: NodeJS.ProcessEnv = {};
  for (const key of PASSTHROUGH) if (process.env[key] !== undefined) env[key] = process.env[key];
  Object.assign(env, {
    HOME: home,
    TMPDIR: path.join(root, "tmp"),
    PI_CODING_AGENT_DIR: agent,
    PI_OFFLINE: "1",
    PI_TELEMETRY: "0",
  });
  await mkdir(env.TMPDIR!, { recursive: true });

  return {
    root,
    sessionsDir: sessions,
    env,
    cwd,
    args(s: Scenario): string[] {
      const args = ["--mode", "rpc", "--provider", "mock", "--model", "mock-1", ...ISOLATION_FLAGS];
      for (const ext of s.extensions ?? []) args.push("-e", ext);
      if (s.useSessionDir) args.push("--session-dir", sessions);
      else args.push("--no-session");
      return args;
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
