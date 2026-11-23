import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { resolvePiExecutable } from "../src/pi-executable.ts";

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function managedLayout(): Promise<{ launcher: string; release: string }> {
  dir = await realpath(await mkdtemp(path.join(os.tmpdir(), "wilco-pi-exe-")));
  const agent = path.join(dir, "agent");
  const launcher = path.join(agent, "bin", "pi");
  const release = path.join(agent, "install", "releases", "9.9.9", "node_modules", ".bin", "pi");
  await mkdir(path.dirname(launcher), { recursive: true });
  await mkdir(path.dirname(release), { recursive: true });
  await writeFile(launcher, "#!/bin/sh\nPI_MANAGED_INSTALL_ROOT=$pi_agent_dir/install\nexport PI_MANAGED_INSTALL_ROOT\n");
  await writeFile(release, "#!/usr/bin/env node\n");
  await chmod(launcher, 0o755);
  await chmod(release, 0o755);
  await writeFile(path.join(agent, "install", "current-version"), "9.9.9\n");
  return { launcher, release };
}

test("managed launcher resolves to the release binary so PI_MANAGED_INSTALL_ROOT is never exported", async () => {
  const { launcher, release } = await managedLayout();
  expect(await resolvePiExecutable(launcher)).toBe(release);
});

test("symlinks to the managed launcher are followed", async () => {
  const { launcher, release } = await managedLayout();
  const link = path.join(dir, "local-bin-pi");
  await symlink(launcher, link);
  expect(await resolvePiExecutable(link)).toBe(release);
});

test("a plain pi executable is used as is", async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "wilco-pi-exe-"));
  const plain = path.join(dir, "pi");
  await writeFile(plain, "#!/usr/bin/env node\nconsole.log('pi')\n");
  await chmod(plain, 0o755);
  expect(await resolvePiExecutable(plain)).toBe(plain);
});

test("a managed launcher with a missing release fails loudly", async () => {
  const { launcher, release } = await managedLayout();
  await rm(release);
  await expect(resolvePiExecutable(launcher)).rejects.toThrow(/managed Pi release/);
});
