#!/usr/bin/env node
import { parseArgs } from "node:util";
import { recordAll } from "./record.ts";

const { values } = parseArgs({
  options: {
    pi: { type: "string" },
    out: { type: "string" },
    scenarios: { type: "string", default: "all" },
  },
});

if (!values.pi || !values.out) {
  process.stderr.write("usage: node src/cli.ts --pi <path-to-pi> --out <fixtures-dir> [--scenarios all|a,b]\n");
  process.exit(2);
}

const names = values.scenarios === "all" ? "all" : values.scenarios!.split(",").map((s) => s.trim());
const result = await recordAll({ piPath: values.pi, outDir: values.out, names, log: (m) => process.stderr.write(`${m}\n`) });
process.stdout.write(`recorded ${result.scenarios.length} scenarios for pi ${result.piVersion}\n`);
