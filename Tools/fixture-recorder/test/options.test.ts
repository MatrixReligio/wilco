import path from "node:path";
import { expect, test } from "vitest";
import { defaultFixturesDir, resolveOptions } from "../src/options.ts";

test("defaults: pi from PI_PATH, fixtures next to the tool, all scenarios", () => {
  const o = resolveOptions([], { PI_PATH: "/opt/pi/bin/pi" }, () => null);
  expect(o).toEqual({ pi: "/opt/pi/bin/pi", out: defaultFixturesDir, names: "all" });
  expect(defaultFixturesDir.endsWith(path.join("Protocol", "fixtures", "pi"))).toBe(true);
});

test("falls back to pi on PATH", () => {
  expect(resolveOptions([], {}, () => "/usr/local/bin/pi").pi).toBe("/usr/local/bin/pi");
});

test("explicit flags win and scenario lists are split", () => {
  const o = resolveOptions(["--pi", "/x/pi", "--out", "/tmp/fx", "--scenarios", "abort, errors"], { PI_PATH: "/y" }, () => "/z");
  expect(o).toEqual({ pi: "/x/pi", out: "/tmp/fx", names: ["abort", "errors"] });
});

test("no pi anywhere is an error", () => {
  expect(() => resolveOptions([], {}, () => null)).toThrow(/pi not found/);
});
