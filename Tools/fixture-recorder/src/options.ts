import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";

/** Protocol/fixtures/pi of the Open tree this tool lives in. */
export const defaultFixturesDir = path.resolve(import.meta.dirname, "..", "..", "..", "Protocol", "fixtures", "pi");

export interface RecorderOptions {
  pi: string;
  out: string;
  names: "all" | string[];
}

export function whichPi(): string | null {
  try {
    return execFileSync("/bin/sh", ["-c", "command -v pi"], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

export function resolveOptions(
  argv: string[],
  env: NodeJS.ProcessEnv,
  findPi: () => string | null = whichPi,
): RecorderOptions {
  const { values } = parseArgs({
    args: argv,
    options: { pi: { type: "string" }, out: { type: "string" }, scenarios: { type: "string", default: "all" } },
  });
  const pi = values.pi ?? env.PI_PATH ?? findPi();
  if (!pi) throw new Error("pi not found: install Pi, pass --pi <path> or set PI_PATH");
  const names = values.scenarios === "all" ? "all" : values.scenarios!.split(",").map((s) => s.trim()).filter(Boolean);
  return { pi, out: values.out ?? defaultFixturesDir, names };
}
