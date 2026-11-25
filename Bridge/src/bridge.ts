// wilco-bridge: connects a Pi session open in the Mac terminal to Wilco Host, so the phone can
// follow and drive it (Open/Protocol/bridge.md). It does nothing in Pi's other modes: Wilco
// Host talks to its own Pi processes directly.
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { bridgeCommands, runCommand, type BridgeEnv, type Content, type DeliverAs } from "./bridge-commands.ts";
import { forwardedEvents, toRPC } from "./bridge-records.ts";

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

export function socketPath(): string {
  return process.env.WILCO_BRIDGE_SOCKET ?? path.join(os.homedir(), "Library", "Application Support", "Wilco", "Host", "bridge.sock");
}

/** One terminal session's connection to Wilco Host; tried again while the Host is away. */
class Link {
  role: "writer" | "follower" | undefined;
  private socket: net.Socket | undefined;
  private closed = false;
  private refused = false;
  private delay = 1000;
  private timer: NodeJS.Timeout | undefined;

  private readonly hello: () => Rec;
  private readonly onRecord: (record: Rec) => void;
  private readonly onRole: (role: "writer" | "follower", previous: string | undefined) => void;

  constructor(hello: () => Rec, onRecord: (record: Rec) => void, onRole: (role: "writer" | "follower", previous: string | undefined) => void) {
    this.hello = hello;
    this.onRecord = onRecord;
    this.onRole = onRole;
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
      this.delay = 1000;
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
      this.role = undefined;
      if (this.closed || this.refused) return;
      // Wilco Host is not running (or restarted): try again, at most every 5 s.
      this.timer = setTimeout(() => this.connect(), this.delay);
      this.timer.unref?.();
      this.delay = Math.min(this.delay * 2, 5000);
    });
  }

  private receive(record: Rec): void {
    switch (record.type) {
      case "wilco_bridge_welcome":
      case "wilco_bridge_role": {
        const previous = this.role;
        this.role = record.role === "follower" ? "follower" : "writer";
        this.onRole(this.role, previous);
        return;
      }
      case "wilco_bridge_refused":
        this.refused = true;
        this.role = undefined;
        this.socket?.destroy();
        return;
      default:
        if (this.role === "writer") this.onRecord(record);
    }
  }
}

export default function wilcoBridge(pi: BridgeAPI): void {
  let ctx: Rec | undefined;
  let link: Link | undefined;
  let compacting = false;
  // Messages from the phone waiting for Pi to take them (RPC's queue_update).
  const queue: { steering: string[]; followUp: string[] } = { steering: [], followUp: [] };

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
    send(content, deliverAs) {
      if (deliverAs) {
        (deliverAs === "steer" ? queue.steering : queue.followUp).push(text(content));
        link?.send({ type: "queue_update", steering: [...queue.steering], followUp: [...queue.followUp] });
        pi.sendUserMessage(content, { deliverAs });
      } else {
        pi.sendUserMessage(content);
      }
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
    link = new Link(hello, (record) => void answer(record), (role, previous) => {
      if (role === "follower") {
        ctx?.ui?.notify?.("This session is being driven from Wilco on your iPhone. You can type again when it finishes.", "info");
      } else if (previous === "follower") {
        pi.sendUserMessage(`/${reloadCommand}`, { expandPromptTemplates: true });
      }
    });
  });

  watch("session_shutdown", () => {
    link?.close();
    link = undefined;
  });

  // wilco-guard's questions, asked on the phone too while this terminal writes the session.
  const asked = new Map<string, (confirmed: boolean) => void>();
  let nextQuestion = 1;
  pi.events.on("wilco:ask", (question: { title: string; message: string; signal: AbortSignal; answer(confirmed: boolean): void }) => {
    if (link?.role !== "writer" || question.signal.aborted) return;
    const id = `wilco-bridge-${process.pid}-${nextQuestion++}`;
    asked.set(id, question.answer);
    link.send({ type: "extension_ui_request", id, method: "confirm", title: question.title, message: question.message });
    question.signal.addEventListener("abort", () => {
      if (asked.delete(id)) link?.send({ type: "wilco_dialog_closed", id });
    });
  });

  async function answer(record: Rec): Promise<void> {
    if (typeof record.type !== "string") return;
    if (record.type === "extension_ui_response") {
      const reply = asked.get(String(record.id));
      asked.delete(String(record.id));
      reply?.(record.confirmed === true);
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
            link?.send({ type: "queue_update", steering: [...queue.steering], followUp: [...queue.followUp] });
            break;
          }
        }
      }
      const record = toRPC(name, event);
      if (record) link?.send(record);
      return undefined;
    });
  }

  watch("input", (event, eventCtx) => {
    if (link?.role !== "follower" || event.source === "extension") return undefined;
    eventCtx.ui?.notify?.("Wilco is driving this session from your iPhone. Wait until it finishes.", "warning");
    return { action: "handled" };
  });

  watch("ui_prompt_start", (event) => {
    link?.send({ type: "wilco_terminal_prompt", kind: event.kind, title: event.title ?? "" });
  });
  watch("ui_prompt_end", () => {
    link?.send({ type: "wilco_terminal_prompt_end" });
  });
}
