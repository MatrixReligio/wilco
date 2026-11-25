// wilco-bridge: connects a Pi session open in the Mac terminal to Wilco Host, so the phone can
// follow and drive it (Open/Protocol/bridge.md). It does nothing in Pi's other modes: Wilco
// Host talks to its own Pi processes directly.
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { bridgeCommands, runCommand, type BridgeEnv, type Content, type DeliverAs } from "./bridge-commands.ts";
import { forwardedEvents, toRPC } from "./bridge-records.ts";
import { firstCopy } from "./first-copy.ts";

type Rec = Record<string, any>;
type Handler = (event: Rec, ctx: Rec) => unknown;
/** Only the parts of Pi's ExtensionAPI this extension uses, so it has no dependencies. */
type BridgeAPI = {
  on(event: string, handler: Handler): void;
  events: { on(topic: string, handler: (data: any) => void): void; emit(topic: string, data: unknown): void };
  sendUserMessage(content: Content, options?: { deliverAs?: DeliverAs; expandPromptTemplates?: boolean }): void;
  setModel(model: unknown): Promise<boolean>;
  setThinkingLevel(level: string): void;
  getThinkingLevel?(): string;
  getCommands(): unknown[];
  setSessionName(name: string): void;
  registerCommand(name: string, options: { description?: string; handler: (args: string, ctx: Rec) => Promise<void> | void }): void;
};

const protocolVersion = 1;
const reloadCommand = "wilco-reload";
const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh"];

/** How long to wait before trying Wilco Host again (ms); tests shorten them. */
export const timing = { first: 1000, max: 5000, notShared: 30_000 };

/** The terminal's notes, in Chinese when the user's language is, otherwise in English. */
function say(english: string, chinese: string): string {
  const language = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale || "";
  return /^zh/i.test(language) ? chinese : english;
}

type Role = "writer" | "follower";
/** Who has the session while this terminal waits: Wilco Host's Pi or another terminal. */
type Holder = "host" | "terminal";

export function socketPath(): string {
  return process.env.WILCO_BRIDGE_SOCKET ?? path.join(os.homedir(), "Library", "Application Support", "Wilco", "Host", "bridge.sock");
}

/** One terminal session's connection to Wilco Host; tried again while the Host is away. */
class Link {
  role: Role | undefined;
  private socket: net.Socket | undefined;
  private closed = false;
  /** The Host speaks another version: not tried again. */
  private refused = false;
  private delay = timing.first;
  /** Set when the Host said when to try again. */
  private retryIn: number | undefined;
  private timer: NodeJS.Timeout | undefined;

  private readonly hello: () => Rec;
  private readonly onRecord: (record: Rec) => void;
  private readonly onRole: (role: Role, holder: Holder) => void;
  private readonly onRefused: (reason: string) => void;
  private readonly onLost: () => void;

  constructor(hello: () => Rec, handlers: {
    record: (record: Rec) => void; role: (role: Role, holder: Holder) => void; refused: (reason: string) => void; lost: () => void;
  }) {
    this.hello = hello;
    this.onRecord = handlers.record;
    this.onRole = handlers.role;
    this.onRefused = handlers.refused;
    this.onLost = handlers.lost;
    this.connect();
  }

  send(record: Rec): void {
    if (this.role !== "writer" || !this.socket || this.socket.destroyed) return;
    this.socket.write(JSON.stringify(record) + "\n");
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.socket?.end();
    this.socket?.destroy();
  }

  private connect(): void {
    if (this.closed || this.refused) return;
    const socket = net.createConnection(socketPath());
    this.socket = socket;
    let pending = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(JSON.stringify(this.hello()) + "\n");
    });
    socket.on("data", (chunk: string) => {
      pending += chunk;
      let nl: number;
      while ((nl = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, nl);
        pending = pending.slice(nl + 1);
        if (line.trim() === "") continue;
        let record: Rec;
        try { record = JSON.parse(line); } catch { continue; }
        this.receive(record);
      }
    });
    socket.on("error", () => {});
    socket.on("close", () => {
      if (this.socket !== socket) return;
      const had = this.role;
      this.role = undefined;
      if (had) this.onLost();
      if (this.closed || this.refused) return;
      // Wilco Host is not running (or restarted): try again, less and less often (at most
      // every timing.max), unless it said when.
      const wait = this.retryIn ?? this.delay;
      if (this.retryIn === undefined) this.delay = Math.min(this.delay * 2, timing.max);
      this.retryIn = undefined;
      this.timer = setTimeout(() => this.connect(), wait);
      this.timer.unref?.();
    });
  }

  private receive(record: Rec): void {
    switch (record.type) {
      case "wilco_bridge_welcome":
      case "wilco_bridge_role": {
        // Answered: the next loss of the Host starts again from the shortest wait.
        this.delay = timing.first;
        this.role = record.role === "follower" ? "follower" : "writer";
        this.onRole(this.role, record.holder === "terminal" ? "terminal" : "host");
        return;
      }
      case "wilco_bridge_refused": {
        const reason = String(record.reason ?? "");
        this.role = undefined;
        if (reason === "unsupported_version") this.refused = true;
        // Not shared yet: asked again now and then, so sharing the folder later works.
        else if (reason === "not_shared") this.retryIn = timing.notShared;
        this.onRefused(reason);
        this.socket?.destroy();
        return;
      }
      default:
        if (this.role === "writer") this.onRecord(record);
    }
  }
}

export default function wilcoBridge(pi: BridgeAPI): void {
  // Installed both from Wilco Host and from the npm package: one copy talks to the Host.
  if (!firstCopy("bridge", pi.events)) return;
  let ctx: Rec | undefined;
  let link: Link | undefined;
  let compacting = false;
  /** Set while someone else has the session: typing waits, and the session is read again after. */
  let waitingFor: Holder | undefined;
  let reloadWhenWriter = false;
  /** The last note shown, so a note is not repeated on every retry. */
  let shown: string | undefined;
  // Messages from the phone waiting for Pi to take them (RPC's queue_update).
  let queue: { steering: string[]; followUp: string[] } = { steering: [], followUp: [] };

  const sendQueue = () => link?.send({ type: "queue_update", steering: [...queue.steering], followUp: [...queue.followUp] });
  const note = (message: string, level: "info" | "warning") => {
    if (shown === message) return;
    shown = message;
    ctx?.ui?.notify?.(message, level);
  };
  const waitingNote = (holder: Holder) => holder === "terminal"
    ? say("This session is open in Pi in another terminal. You can type here once it is closed there.",
          "这个会话已在另一个终端的 Pi 中打开。在那边关闭后，即可在这里输入。")
    : say("Wilco is running this session from your iPhone or iPad. You can type here again when it finishes.",
          "Wilco 正在通过你的 iPhone 或 iPad 运行这个会话。运行结束后，即可在这里继续输入。");
  const reload = () => {
    reloadWhenWriter = false;
    pi.sendUserMessage(`/${reloadCommand}`, { expandPromptTemplates: true });
  };
  const wait = (holder: Holder) => {
    waitingFor = holder;
    reloadWhenWriter = true;
    note(waitingNote(holder), "info");
  };

  const text = (value: Content): string =>
    typeof value === "string" ? value : value.filter((part) => part.type === "text").map((part) => String(part.text ?? "")).join("");

  const entries = (): Rec[] => {
    try { return (ctx?.sessionManager?.getEntries?.() ?? []) as Rec[]; } catch { return []; }
  };
  const messages = (): unknown[] => {
    const manager = ctx?.sessionManager;
    const built = manager?.buildSessionContext?.();
    if (built && Array.isArray(built.messages)) return built.messages;
    return ((manager?.getBranch?.() ?? []) as Rec[]).filter((entry) => entry.type === "message").map((entry) => entry.message);
  };

  const env: BridgeEnv = {
    isIdle: () => ctx?.isIdle?.() ?? true,
    isCompacting: () => compacting,
    hasModel: () => ctx?.model !== undefined && ctx?.model !== null,
    send(content, deliverAs) {
      // Shown as waiting only when Pi is busy; Pi ignores deliverAs when it is not.
      if (!(ctx?.isIdle?.() ?? true)) {
        (deliverAs === "steer" ? queue.steering : queue.followUp).push(text(content));
        sendQueue();
      }
      pi.sendUserMessage(content, { deliverAs });
    },
    abort: () => ctx?.abort?.(),
    state() {
      const manager = ctx?.sessionManager;
      const state: Rec = {
        thinkingLevel: pi.getThinkingLevel?.() ?? ctx?.thinkingLevel ?? "off",
        isStreaming: !(ctx?.isIdle?.() ?? true),
        isCompacting: compacting,
        sessionId: manager?.getSessionId?.(),
        messageCount: messages().length,
        pendingMessageCount: queue.steering.length + queue.followUp.length,
      };
      if (ctx?.model) state.model = ctx.model;
      const file = manager?.getSessionFile?.();
      if (file) state.sessionFile = file;
      const name = manager?.getSessionName?.();
      if (name) state.sessionName = name;
      return state;
    },
    messages,
    models: () => ctx?.modelRegistry?.getAvailable?.() ?? [],
    async setModel(provider, modelId) {
      const model = ctx?.modelRegistry?.find?.(provider, modelId);
      if (!model) return undefined;
      return (await pi.setModel(model)) ? model : undefined;
    },
    setThinkingLevel: (level) => pi.setThinkingLevel(level),
    thinkingLevels: () => (ctx?.model?.reasoning ? thinkingLevels : ["off"]),
    commands: () => pi.getCommands(),
    setSessionName: (name) => pi.setSessionName(name),
    compact: (customInstructions) => ctx?.compact?.(customInstructions === undefined ? {} : { customInstructions }),
    stats() {
      const manager = ctx?.sessionManager;
      let userMessages = 0, assistantMessages = 0, toolCalls = 0, toolResults = 0, cost = 0;
      const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
      for (const entry of entries()) {
        if (entry.type !== "message") continue;
        const message = entry.message ?? {};
        if (message.role === "user") userMessages += 1;
        if (message.role === "toolResult") toolResults += 1;
        if (message.role !== "assistant") continue;
        assistantMessages += 1;
        toolCalls += (message.content ?? []).filter((part: Rec) => part.type === "toolCall").length;
        const usage = message.usage ?? {};
        for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) tokens[key] += Number(usage[key] ?? 0);
        cost += Number(usage.cost?.total ?? 0);
      }
      tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
      const stats: Rec = {
        sessionId: manager?.getSessionId?.(), userMessages, assistantMessages, toolCalls, toolResults,
        totalMessages: userMessages + assistantMessages + toolResults, tokens, cost,
      };
      const file = manager?.getSessionFile?.();
      if (file) stats.sessionFile = file;
      const usage = ctx?.getContextUsage?.();
      if (usage) stats.contextUsage = usage;
      return stats;
    },
  };

  // Handed the session after Wilco Host's Pi worked on it: read it again from its file.
  pi.registerCommand(reloadCommand, {
    description: "Wilco: reload this session after Wilco Host worked on it",
    handler: async (_args, commandCtx) => {
      const file = commandCtx.sessionManager?.getSessionFile?.();
      if (file) await commandCtx.switchSession?.(file);
    },
  });

  const watch = (name: string, handler: Handler) =>
    pi.on(name, (event, eventCtx) => {
      ctx = eventCtx;
      return handler(event, eventCtx);
    });

  watch("session_start", (_event, eventCtx) => {
    link?.close();
    link = undefined;
    if (eventCtx.mode !== "tui") return;
    const hello = () => ({
      type: "wilco_bridge_hello", bridgeProtocolVersion: protocolVersion,
      sessionId: ctx?.sessionManager?.getSessionId?.(), sessionFile: ctx?.sessionManager?.getSessionFile?.(), cwd: ctx?.cwd,
      commands: [...bridgeCommands],
    });
    link = new Link(hello, {
      record: (record) => void answer(record),
      role: (role, holder) => {
        if (role === "follower") return wait(holder);
        waitingFor = undefined;
        shown = undefined;
        // Someone else wrote the session meanwhile: read it again before taking typing.
        if (reloadWhenWriter) return reload();
        // Questions still waiting are asked on the phone again (a reconnect lost them there).
        for (const question of asked.values()) link?.send(question.request);
      },
      refused: (reason) => {
        if (reason === "another_writer") return wait("terminal");
        if (reason === "unsupported_version") {
          note(say("Wilco Host and this wilco-bridge do not speak the same version. Update them to reach this session from Wilco.",
                   "Wilco Host 与这个 wilco-bridge 的版本不一致。请更新两者，以便从 Wilco 访问这个会话。"), "warning");
        }
      },
      lost: () => {
        // The Host is gone, and with it the run this terminal waited for: read the session
        // again (it may have grown) and take typing.
        if (waitingFor === undefined) return;
        waitingFor = undefined;
        shown = undefined;
        reload();
      },
    });
  });

  watch("session_shutdown", () => {
    link?.close();
    link = undefined;
  });

  // wilco-guard's questions, asked on the phone too while this terminal writes the session.
  const asked = new Map<string, { answer: (confirmed: boolean) => void; request: Rec }>();
  let nextQuestion = 1;
  pi.events.on("wilco:ask", (question: { title: string; message: string; signal: AbortSignal; answer(confirmed: boolean): void }) => {
    if (link?.role !== "writer" || question.signal.aborted) return;
    const id = `wilco-bridge-${process.pid}-${nextQuestion++}`;
    const request = { type: "extension_ui_request", id, method: "confirm", title: question.title, message: question.message };
    asked.set(id, { answer: question.answer, request });
    link.send(request);
    question.signal.addEventListener("abort", () => {
      if (asked.delete(id)) link?.send({ type: "wilco_dialog_closed", id });
    });
  });

  async function answer(record: Rec): Promise<void> {
    if (typeof record.type !== "string") return;
    if (record.type === "extension_ui_response") {
      const question = asked.get(String(record.id));
      asked.delete(String(record.id));
      question?.answer(record.confirmed === true);
      return;
    }
    link?.send(await runCommand(record, env));
  }

  for (const name of forwardedEvents) {
    watch(name, (event) => {
      if (name === "session_before_compact") compacting = true;
      if (name === "session_compact" || name === "session_compact_failed") compacting = false;
      if (name === "message_start" && event.message?.role === "user") {
        const said = text(event.message.content ?? []);
        for (const list of [queue.steering, queue.followUp]) {
          const index = list.indexOf(said);
          if (index >= 0) {
            list.splice(index, 1);
            sendQueue();
            break;
          }
        }
      }
      const record = toRPC(name, event);
      if (record) link?.send(record);
      // Pi let go of messages it did not run (cleared in the terminal): stop showing them.
      if (name === "agent_settled" && !(ctx?.hasPendingMessages?.() ?? false) && queue.steering.length + queue.followUp.length > 0) {
        queue.steering = [];
        queue.followUp = [];
        sendQueue();
      }
      return undefined;
    });
  }

  watch("input", (event, eventCtx) => {
    if (waitingFor === undefined || event.source === "extension") return undefined;
    eventCtx.ui?.notify?.(waitingNote(waitingFor), "warning");
    return { action: "handled" };
  });

  // A question another extension asks in the terminal (wilco-guard's reach the phone as
  // extension_ui_request instead, so they are not announced twice).
  let terminalPrompt = false;
  watch("ui_prompt_start", (event) => {
    const title = String(event.title ?? "");
    if (title.startsWith("wilco-guard: ")) return;
    terminalPrompt = true;
    link?.send({ type: "wilco_terminal_prompt", kind: event.kind, title });
  });
  watch("ui_prompt_end", () => {
    if (!terminalPrompt) return;
    terminalPrompt = false;
    link?.send({ type: "wilco_terminal_prompt_end" });
  });
}
