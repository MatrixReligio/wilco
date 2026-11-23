#!/usr/bin/env node
import { resolveOptions } from "./options.ts";
import { recordAll } from "./record.ts";

let options;
try {
  options = resolveOptions(process.argv.slice(2), process.env);
} catch (error) {
  process.stderr.write(`${(error as Error).message}\nusage: npm run record -- [--pi <path>] [--out <dir>] [--scenarios all|a,b]\n`);
  process.exit(2);
}
const result = await recordAll({
  piPath: options.pi,
  outDir: options.out,
  names: options.names,
  log: (m) => process.stderr.write(`${m}\n`),
});
process.stdout.write(`recorded ${result.scenarios.length} scenarios for pi ${result.piVersion}\n`);
