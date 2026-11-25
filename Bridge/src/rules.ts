// wilco-guard's rules: which tool calls need the owner's approval. Pure functions, no Pi imports.
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** What wilco-guard asks about. Wilco Host writes it as JSON to the file named by WILCO_GUARD_POLICY. */
export type GuardPolicy = {
  /** Commands that destroy data or reach beyond the project (rm -r, sudo, git push --force, ...). */
  dangerousCommands: boolean;
  /** write and edit on paths outside the session's working directory. */
  outsideWorkspace: boolean;
  /** Strict mode: every bash command. */
  allBash: boolean;
};

export const DEFAULT_POLICY: Readonly<GuardPolicy> = Object.freeze({ dangerousCommands: true, outsideWorkspace: true, allBash: false });

export type Reason = "dangerous" | "outsideWorkspace" | "bash";

export type Assessment =
  | { ask: false }
  | { ask: true; reason: Reason; label?: string; title: string; message: string; summary: string };

const TITLE_PREFIX = "wilco-guard: ";
const MAX_TITLE = 200;

/** Reads the policy; a missing, unreadable or malformed file gives the defaults (never "allow everything"). */
export function loadPolicy(file: string | undefined): GuardPolicy {
  if (!file) return { ...DEFAULT_POLICY };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { ...DEFAULT_POLICY };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { ...DEFAULT_POLICY };
  const policy = { ...DEFAULT_POLICY };
  for (const key of Object.keys(DEFAULT_POLICY) as (keyof GuardPolicy)[]) {
    const value = (parsed as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") return { ...DEFAULT_POLICY };
    policy[key] = value;
  }
  return policy;
}

/** Decides whether a tool call needs approval under the policy. Never throws. */
export function assess(toolName: string, input: unknown, cwd: string, policy: GuardPolicy, home: string = os.homedir()): Assessment {
  const fields = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  if (toolName === "bash") {
    const command = fields.command;
    if (typeof command !== "string" || command.trim() === "") return { ask: false };
    const summary = `run: ${firstLine(command)}`;
    const label = policy.dangerousCommands ? dangerousCommand(command) : undefined;
    if (label) {
      return question("dangerous", summary, `Pi wants to run a command that looks dangerous (${label}):\n\n${command}`, label);
    }
    if (policy.allBash) return question("bash", summary, `Pi wants to run a command:\n\n${command}`);
    return { ask: false };
  }
  if ((toolName === "write" || toolName === "edit") && policy.outsideWorkspace) {
    const target = fields.path;
    if (typeof target !== "string" || target.trim() === "") return { ask: false };
    const resolved = resolvePath(target, cwd, home);
    if (isInside(resolved, cwd)) return { ask: false };
    const verb = toolName === "write" ? "write" : "edit";
    return question("outsideWorkspace", `${verb}: ${target}`, `Pi wants to ${verb} a file outside the workspace:\n\n${resolved}`);
  }
  return { ask: false };
}

function question(reason: Reason, summary: string, message: string, label?: string): Assessment {
  let title = TITLE_PREFIX + summary.replace(/\s+/g, " ").trim();
  if (title.length > MAX_TITLE) title = title.slice(0, MAX_TITLE - 1) + "…";
  return label === undefined ? { ask: true, reason, title, message, summary } : { ask: true, reason, label, title, message, summary };
}

function firstLine(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return text.trim().includes("\n") ? `${line} …` : line;
}

function resolvePath(target: string, cwd: string, home: string): string {
  let p = target.trim();
  if (p.startsWith("@")) p = p.slice(1);
  if (p === "~") p = home;
  else if (p.startsWith("~/")) p = path.join(home, p.slice(2));
  return path.resolve(cwd, p);
}

function isInside(target: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

// MARK: Commands

type Token = { op: string } | { word: string };

/** Splits a shell command into words and operators, honouring quotes and backslashes. */
function lex(command: string): Token[] {
  const tokens: Token[] = [];
  let word = "";
  let inWord = false;
  const flush = () => {
    if (inWord) tokens.push({ word });
    word = "";
    inWord = false;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (c === "'") {
      const end = command.indexOf("'", i + 1);
      word += command.slice(i + 1, end < 0 ? command.length : end);
      inWord = true;
      i = end < 0 ? command.length : end;
    } else if (c === '"') {
      let j = i + 1;
      while (j < command.length && command[j] !== '"') {
        if (command[j] === "\\" && j + 1 < command.length) j++;
        word += command[j];
        j++;
      }
      inWord = true;
      i = j;
    } else if (c === "\\") {
      word += command[i + 1] ?? "";
      inWord = true;
      i++;
    } else if (/\s/.test(c)) {
      flush();
      if (c === "\n") tokens.push({ op: ";" });
    } else if (c === "|" || c === "&" || c === ";" || c === "(" || c === ")" || c === "`") {
      flush();
      const two = command.slice(i, i + 2);
      if (two === "||" || two === "&&") {
        tokens.push({ op: two });
        i++;
      } else tokens.push({ op: c });
    } else if (c === "$" && command[i + 1] === "(") {
      flush();
      tokens.push({ op: "$(" });
      i++;
    } else if (c === ">" || c === "<") {
      flush();
      let op = c;
      while (command[i + 1] === ">" || command[i + 1] === "&") op += command[++i];
      tokens.push({ op });
    } else {
      word += c;
      inWord = true;
    }
  }
  flush();
  return tokens;
}

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "fish", "ksh"]);
const WRAPPERS = new Set(["command", "exec", "nohup", "time", "env", "xargs", "nice"]);
const SAFE_DEVICES = /^\/dev\/(null|stdout|stderr|stdin|tty|fd\/\d+)$/;

/** A short label for why a command looks dangerous, or undefined. */
export function dangerousCommand(command: string): string | undefined {
  const tokens = lex(command);
  // Redirections into a device.
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i], next = tokens[i + 1];
    if ("op" in t && t.op.startsWith(">") && "word" in next && next.word.startsWith("/dev/") && !SAFE_DEVICES.test(next.word)) {
      return "write to a device";
    }
  }
  // Simple commands, with what separated each from the one before.
  let segment: string[] = [];
  let pipedInto = false;
  let previousOp = "";
  const segments: { words: string[]; piped: boolean }[] = [];
  const close = () => {
    if (segment.length > 0) segments.push({ words: segment, piped: pipedInto });
    segment = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if ("word" in t) {
      if (previousOp.startsWith(">") || previousOp.startsWith("<")) {
        previousOp = "";
        continue; // a redirection target, not an argument
      }
      if (segment.length === 0) pipedInto = previousOp === "|";
      segment.push(t.word);
      previousOp = "";
    } else {
      if (t.op.startsWith(">") || t.op.startsWith("<")) {
        previousOp = t.op;
        continue;
      }
      close();
      previousOp = t.op;
    }
  }
  close();
  for (const { words, piped } of segments) {
    const label = judge(words, piped);
    if (label) return label;
  }
  return undefined;
}

function judge(all: string[], piped: boolean): string | undefined {
  let words = all;
  // Leading variable assignments and harmless wrappers.
  for (;;) {
    const first = words[0];
    if (first === undefined) return undefined;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first)) words = words.slice(1);
    else if (WRAPPERS.has(path.basename(first))) words = words.slice(1).filter((w, i) => i > 0 || !w.startsWith("-"));
    else break;
  }
  const name = path.basename(words[0] ?? "");
  const args = words.slice(1);
  const shortFlags = args.filter((a) => /^-[A-Za-z]+$/.test(a)).join("");
  switch (name) {
    case "sudo":
    case "doas":
      return "sudo";
    case "rm":
      return /[rR]/.test(shortFlags) || args.includes("--recursive") ? "rm -r" : undefined;
    case "git":
      return judgeGit(args);
    case "dd":
      return args.some((a) => a.startsWith("of=")) ? "dd" : undefined;
    case "chmod":
    case "chown":
      return /R/.test(shortFlags) || args.includes("--recursive") ? `${name} -R` : undefined;
    case "find":
      return args.includes("-delete") || args.some((a, i) => (a === "-exec" || a === "-execdir") && path.basename(args[i + 1] ?? "") === "rm")
        ? "find -delete"
        : undefined;
    case "shutdown":
    case "reboot":
    case "halt":
    case "poweroff":
      return "shutdown";
    default:
      if (name === "mkfs" || name.startsWith("mkfs.") || name === "newfs" || name.startsWith("newfs_")) return "mkfs";
      if (piped && SHELLS.has(name)) return "pipe to shell";
      return undefined;
  }
}

function judgeGit(args: string[]): string | undefined {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) i += args[i] === "-C" || args[i] === "-c" ? 2 : 1;
  const sub = args[i];
  const rest = args.slice(i + 1);
  const shortFlags = rest.filter((a) => /^-[A-Za-z]+$/.test(a)).join("");
  if (sub === "push") {
    const forced = /f/.test(shortFlags) || rest.some((a) => a === "--force" || a.startsWith("--force-with-lease") || a === "--mirror" || a === "--delete")
      || rest.some((a) => a.startsWith("+") || a.startsWith(":"));
    return forced ? "git push --force" : undefined;
  }
  if (sub === "reset") return rest.includes("--hard") ? "git reset --hard" : undefined;
  if (sub === "clean") return /f/.test(shortFlags) || rest.includes("--force") ? "git clean -f" : undefined;
  return undefined;
}
