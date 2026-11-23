/** One line of a fixture file: a record we sent to Pi, or one Pi wrote to stdout. */
export type FixtureLine =
  | { dir: "send" | "recv"; record: unknown; raw?: undefined }
  | { dir: "send"; raw: string; record?: undefined };

export type NormalizeContext = { tmpRoot: string; mockURL?: string; homeDir?: string };

/** Pi's install location appears in its system prompt (links to its own docs). */
const PI_PACKAGE = /\/[^\s"'`]*?\/node_modules\/@earendil-works\/pi-coding-agent/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}([:-])\d{2}\1\d{2}(?:([.-])\d{3})?Z/g;
const ENTRY_KEYS = new Set(["id", "parentId", "entryId", "firstKeptEntryId", "leafId", "fromId", "since", "targetId"]);
const PI_ENTRY_ID = /^[0-9a-f]{8}$/i;

/** Path spellings of the temp root: macOS reports /tmp and /var as /private/... and vice versa. */
function rootVariants(root: string): string[] {
  const variants = new Set([root]);
  if (root.startsWith("/private/")) variants.add(root.slice("/private".length));
  else if (/^\/(tmp|var)\//.test(root)) variants.add(`/private${root}`);
  return [...variants].sort((a, b) => b.length - a.length);
}

/**
 * Makes a recorded transcript deterministic: UUIDs, entry ids, timestamps, durations,
 * temp paths and the mock server port are replaced with stable placeholders.
 * Every distinct original value maps to the same placeholder throughout one call.
 */
export function normalize(lines: FixtureLine[], ctx: NormalizeContext): FixtureLine[] {
  const uuids = new Map<string, string>();
  const entries = new Map<string, string>();
  const roots = rootVariants(ctx.tmpRoot);

  const placeholder = (map: Map<string, string>, prefix: string, value: string): string => {
    let p = map.get(value);
    if (!p) {
      p = `<${prefix}-${map.size + 1}>`;
      map.set(value, p);
    }
    return p;
  };

  const text = (s: string): string => {
    for (const r of roots) s = s.split(r).join("<TMP>");
    if (ctx.mockURL) s = s.split(ctx.mockURL).join("<MOCK_URL>");
    s = s.replace(PI_PACKAGE, "<PI_PACKAGE>");
    if (ctx.homeDir && ctx.homeDir !== "/") s = s.split(ctx.homeDir).join("<HOME>");
    s = s.replace(UUID, (u) => placeholder(uuids, "uuid", u.toLowerCase()));
    return s.replace(ISO, (_m, sep: string, msSep?: string) =>
      `1970-01-01T00${sep}00${sep}00${msSep ? `${msSep}000` : ""}Z`,
    );
  };

  const isEntryId = (key: string, value: string): boolean => ENTRY_KEYS.has(key) && PI_ENTRY_ID.test(value);

  const walk = (value: unknown, key?: string): unknown => {
    if (key === "timestamp") {
      if (typeof value === "number") return 0;
      if (typeof value === "string" && ISO.test(value)) {
        ISO.lastIndex = 0;
        return "1970-01-01T00:00:00.000Z";
      }
    }
    if (key === "durationMs" && typeof value === "number") return 0;
    if (typeof value === "string") {
      const s = text(value);
      return key !== undefined && isEntryId(key, s) ? placeholder(entries, "entry", s) : s;
    }
    if (Array.isArray(value)) return value.map((v) => walk(v));
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
    }
    return value;
  };

  return lines.map((line) =>
    line.raw !== undefined ? { dir: line.dir, raw: text(line.raw) } : { dir: line.dir, record: walk(line.record) },
  );
}

/** A session file: one JSON value per line, as Pi wrote it. */
export type SessionFile = unknown[];

/**
 * Normalizes a transcript together with the session files Pi wrote during it, so the same
 * UUID, entry id or path gets the same placeholder in both.
 */
export function normalizeRecording(
  lines: FixtureLine[],
  sessions: SessionFile[],
  ctx: NormalizeContext,
): { lines: FixtureLine[]; sessions: SessionFile[] } {
  const combined: FixtureLine[] = [...lines, ...sessions.flat().map((record) => ({ dir: "recv" as const, record }))];
  const out = normalize(combined, ctx);
  const sessionsOut: SessionFile[] = [];
  let offset = lines.length;
  for (const file of sessions) {
    sessionsOut.push(out.slice(offset, offset + file.length).map((l) => l.record));
    offset += file.length;
  }
  return { lines: out.slice(0, lines.length), sessions: sessionsOut };
}
