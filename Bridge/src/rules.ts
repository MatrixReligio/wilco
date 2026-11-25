// wilco-guard's rules: which tool calls need the owner's approval. Pure functions, no Pi imports.
import { existsSync, readFileSync, realpathSync } from "node:fs";
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

/** `protected`: the call touches wilco-guard's own files (its policy and code); always asked. */
export type Reason = "dangerous" | "outsideWorkspace" | "bash" | "protected";

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

/**
 * Decides whether a tool call needs approval under the policy. Never throws. Calls that touch
 * `protectedPaths` (wilco-guard's own policy and code) are always asked about, whatever the policy.
 */
export function assess(
  toolName: string, input: unknown, cwd: string, policy: GuardPolicy, home: string = os.homedir(), protectedPaths: string[] = [],
): Assessment {
  const fields = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  if (toolName === "bash") {
    const command = fields.command;
    if (typeof command !== "string" || command.trim() === "") return { ask: false };
    const summary = `run: ${firstLine(command)}`;
    if (mentions(command, protectedPaths, home)) {
      return question("protected", summary, `Pi wants to run a command that touches wilco-guard's own files:\n\n${command}`, "wilco-guard's files");
    }
    const label = policy.dangerousCommands ? dangerousCommand(command) : undefined;
    if (label) {
      return question("dangerous", summary, `Pi wants to run a command that looks dangerous (${label}):\n\n${command}`, label);
    }
    if (policy.allBash) return question("bash", summary, `Pi wants to run a command:\n\n${command}`);
    return { ask: false };
  }
  if (toolName === "write" || toolName === "edit") {
    const target = fields.path;
    if (typeof target !== "string" || target.trim() === "") return { ask: false };
    const verb = toolName === "write" ? "write" : "edit";
    const resolved = resolvePath(target, cwd, home);
    if (protectedPaths.some((dir) => mayBeInside(resolved, dir))) {
      return question("protected", `${verb}: ${target}`, `Pi wants to ${verb} one of wilco-guard's own files:\n\n${resolved}`, "wilco-guard's files");
    }
    if (!policy.outsideWorkspace || isInside(resolved, cwd)) return { ask: false };
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

/** Whether `target` lies within `root`, after following symbolic links (a link out of the root is outside). */
function isInside(target: string, root: string): boolean {
  const real = realResolve(target), realRoot = realResolve(path.resolve(root));
  if (real === undefined || realRoot === undefined) return false;
  const relative = path.relative(realRoot, real);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * For protection: whether `target` could be within `root`, ignoring case (macOS volumes usually do)
 * and assuming the worst when a path cannot be resolved.
 */
function mayBeInside(target: string, root: string): boolean {
  const real = realResolve(target), realRoot = realResolve(path.resolve(root));
  if (real === undefined || realRoot === undefined) return true;
  const relative = path.relative(realRoot.toLowerCase(), real.toLowerCase());
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** The path with every symbolic link in its existing part resolved; undefined when that fails. */
function realResolve(target: string): string | undefined {
  let existing = path.resolve(target);
  const rest: string[] = [];
  try {
    while (!existsSync(existing)) {
      const parent = path.dirname(existing);
      if (parent === existing) return existing;
      rest.unshift(path.basename(existing));
      existing = parent;
    }
    if (target.includes("\0")) return undefined;
    return path.join(realpathSync(existing), ...rest);
  } catch {
    return undefined;
  }
}

/** Whether a command names one of the directories (quotes, escapes and `~` taken into account). */
function mentions(command: string, directories: string[], home: string): boolean {
  if (directories.length === 0) return false;
  const words = lex(command).flatMap((t) => ("word" in t ? [t.word] : []));
  const texts = [command, ...words.map((w) => (w === "~" ? home : w.startsWith("~/") ? path.join(home, w.slice(2)) : w))].map((t) => t.toLowerCase());
  return directories.some((dir) => {
    const forms = [dir, dir.startsWith(home + "/") ? "~" + dir.slice(home.length) : dir].map((f) => f.toLowerCase());
    return texts.some((text) => forms.some((form) => text.includes(form)));
  });
}

// MARK: Commands

type Token = { op: string } | { word: string };

/** The end of the command substitution whose text starts at `start` (just after "$("), or the end of the text. */
function closingParen(text: string, start: number): number {
  let depth = 1;
  for (let k = start; k < text.length; k++) {
    if (text[k] === "\\") k++;
    else if (text[k] === "(") depth++;
    else if (text[k] === ")" && --depth === 0) return k;
  }
  return text.length;
}

/**
 * Splits a shell command into words and operators, honouring quotes and backslashes. Command
 * substitutions inside double quotes still run, so their text is added to `nested` to be checked too.
 */
function lex(command: string, nested: string[] = []): Token[] {
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
        else if (command[j] === "$" && command[j + 1] === "(") {
          const end = closingParen(command, j + 2);
          nested.push(command.slice(j + 2, end));
          word += command.slice(j, end + 1);
          j = end + 1;
          continue;
        } else if (command[j] === "`") {
          const end = command.indexOf("`", j + 1);
          const stop = end < 0 ? command.length : end;
          nested.push(command.slice(j + 1, stop));
          word += command.slice(j, stop + 1);
          j = stop + 1;
          continue;
        }
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
/** Shell words that may come before a command. */
const RESERVED = new Set(["if", "then", "else", "elif", "do", "while", "until", "{", "!", "time"]);
/** Commands that run another command, with the options of each that take a value. */
const WRAPPERS: Record<string, Set<string>> = {
  command: new Set(),
  exec: new Set(["-a"]),
  nohup: new Set(),
  env: new Set(["-u", "-C", "-P", "--unset", "--chdir"]),
  nice: new Set(["-n", "--adjustment"]),
  timeout: new Set(["-s", "-k", "--signal", "--kill-after"]),
  xargs: new Set(["-I", "-L", "-n", "-P", "-s", "-E", "-d", "-a", "-J", "-R"]),
  stdbuf: new Set(["-i", "-o", "-e"]),
  ionice: new Set(["-c", "-n", "-p"]),
  caffeinate: new Set(["-t", "-w"]),
  chronic: new Set(),
};
/** Global git options that take a separate value. */
const GIT_VALUE_OPTIONS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix", "--config-env"]);
const MAX_DEPTH = 4;
const SAFE_DEVICES = /^\/dev\/(null|stdout|stderr|stdin|tty|fd\/\d+)$/;

/** A short label for why a command looks dangerous, or undefined. */
export function dangerousCommand(command: string, depth = 0): string | undefined {
  if (depth > MAX_DEPTH) return "indirect command";
  const nested: string[] = [];
  const tokens = lex(command, nested);
  for (const inner of nested) {
    const label = dangerousCommand(inner, depth + 1);
    if (label) return label;
  }
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
    const label = judge(words, piped, depth);
    if (label) return label;
  }
  return undefined;
}

function judge(all: string[], piped: boolean, depth: number): string | undefined {
  let words = all;
  // Reserved words, variable assignments and commands that run another command.
  for (;;) {
    const first = words[0];
    if (first === undefined) return undefined;
    const base = path.basename(first);
    if (RESERVED.has(first) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(first)) {
      words = words.slice(1);
    } else if (Object.hasOwn(WRAPPERS, base)) {
      const valueOptions = WRAPPERS[base];
      let i = 1;
      while (i < words.length) {
        const word = words[i];
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) i += 1;
        else if (word.startsWith("-")) i += valueOptions.has(word) ? 2 : 1;
        else break;
      }
      if (base === "timeout") i += 1; // the duration
      words = words.slice(i);
    } else {
      break;
    }
  }
  const command = words[0] ?? "";
  // A command name that is computed ($CMD, $(...)) cannot be judged.
  if (command.includes("$") || command.includes("`") || command.startsWith("-")) return "indirect command";
  const name = path.basename(command);
  const args = words.slice(1);
  if (name === "eval") return dangerousCommand(args.join(" "), depth + 1);
  if (SHELLS.has(name)) {
    const flag = args.findIndex((a) => /^-[A-Za-z]*c[A-Za-z]*$/.test(a));
    if (flag >= 0) {
      const script = args.slice(flag + 1).find((a) => !a.startsWith("-"));
      if (script !== undefined) return dangerousCommand(script, depth + 1);
    }
  }
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
  while (i < args.length && args[i].startsWith("-")) i += GIT_VALUE_OPTIONS.has(args[i]) ? 2 : 1;
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
