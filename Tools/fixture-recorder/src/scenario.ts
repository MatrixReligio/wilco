import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MockScript } from "@matrixreligio/wilco-mock-llm/src/script.ts";

export type Step =
  | { send: Record<string, unknown> }
  | { sendRaw: string }
  | { await: "response" }
  | { await: "event"; type: string; assistantEvent?: string } // assistantEvent narrows message_update by its sub-event type
  | { respondUI: { method: string; value?: string; confirmed?: boolean; cancelled?: boolean } }
  | { sleepMs: number };

export type Scenario = {
  name: string;
  mock: MockScript;
  steps: Step[];
  useSessionDir?: boolean;
  /** Absolute paths after loading (relative to the package root in scenario files). */
  extensions?: string[];
};

export const packageRoot = fileURLToPath(new URL("..", import.meta.url));
export const scenariosDir = path.join(packageRoot, "scenarios");

export async function scenarioNames(): Promise<string[]> {
  return (await readdir(scenariosDir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

/** Loads scenarios by name ("all" for every file in scenarios/); the file name is the scenario name. */
export async function loadScenarios(names: string[] | "all"): Promise<Scenario[]> {
  const list = names === "all" ? await scenarioNames() : names;
  return Promise.all(
    list.map(async (name) => {
      const raw = JSON.parse(await readFile(path.join(scenariosDir, `${name}.json`), "utf8")) as Omit<Scenario, "name">;
      return {
        ...raw,
        name,
        extensions: raw.extensions?.map((e) => path.resolve(packageRoot, e)),
      };
    }),
  );
}

/** Resolves "$last:<command>:<path>" references against the latest response per command. */
export function resolveRefs(value: unknown, last: Map<string, unknown>): unknown {
  if (typeof value === "string" && value.startsWith("$last:")) {
    const [, command, ...rest] = value.split(":");
    const response = last.get(command);
    if (response === undefined) throw new Error(`no response yet for ${command} (in ${value})`);
    const resolved = getPath(response, rest.join(":"));
    if (resolved === undefined) throw new Error(`${value} resolved to undefined`);
    return resolved;
  }
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, last));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveRefs(v, last)]));
  }
  return value;
}

/** Reads a path like data.messages[0].entryId. */
export function getPath(value: unknown, p: string): unknown {
  let current: any = value;
  for (const part of p.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}
