#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { parseScript } from "./script.ts";
import { startMockLLM } from "./server.ts";

const { values } = parseArgs({
  options: { port: { type: "string", default: "0" }, script: { type: "string" } },
});

const script = values.script ? parseScript(JSON.parse(await readFile(values.script, "utf8"))) : undefined;
const llm = await startMockLLM({ port: Number(values.port), script });
process.stdout.write(`MOCK_LLM_URL=${llm.url}\n`);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    llm.close().finally(() => process.exit(0));
  });
}
