import { access, constants, open, readFile, realpath } from "node:fs/promises";
import path from "node:path";

const LAUNCHER_MARKER = "PI_MANAGED_INSTALL_ROOT";
const VERSION = /^[0-9A-Za-z._+-]+$/;

async function head(file: string, bytes = 4096): Promise<string> {
  const handle = await open(file, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(bytes), 0, bytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

/**
 * Pi's managed installer puts a shell launcher on PATH (~/.pi/agent/bin/pi) that exports
 * PI_MANAGED_INSTALL_ROOT, which makes Pi tidy up the user's real ~/.pi/agent/install on
 * start-up. Tests must not touch that, so a managed launcher is resolved to the release
 * binary it would exec; any other executable is returned unchanged.
 */
export async function resolvePiExecutable(piPath: string): Promise<string> {
  const real = await realpath(piPath);
  const text = await head(real);
  if (!text.startsWith("#!") || !text.includes(LAUNCHER_MARKER)) return piPath;

  const agentDir = path.dirname(path.dirname(real));
  const version = (await readFile(path.join(agentDir, "install", "current-version"), "utf8")).trim();
  if (!VERSION.test(version)) throw new Error(`managed Pi release version is invalid: ${JSON.stringify(version)}`);
  const release = path.join(agentDir, "install", "releases", version, "node_modules", ".bin", "pi");
  try {
    await access(release, constants.X_OK);
  } catch {
    throw new Error(`managed Pi release binary is missing: ${release}`);
  }
  return release;
}
