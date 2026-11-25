// The RPC commands a device may send to a terminal session, run through Pi's extension API
// (Open/Protocol/bridge.md). Pure over BridgeEnv, so it is tested without Pi.

type Rec = Record<string, any>;
export type DeliverAs = "steer" | "followUp";
export type Content = string | Rec[];

/** What the bridge needs from the terminal's Pi. */
export interface BridgeEnv {
  isIdle(): boolean;
  /** Pi refuses messages while it compacts the session. */
  isCompacting(): boolean;
  hasModel(): boolean;
  /** `deliverAs` applies when Pi turns out to be busy; otherwise the message starts a run. */
  send(content: Content, deliverAs: DeliverAs): void;
  abort(): void;
  state(): Rec;
  messages(): unknown[];
  models(): unknown[];
  /** The model set, or undefined when it is unknown or has no credentials. */
  setModel(provider: string, modelId: string): Promise<unknown | undefined>;
  setThinkingLevel(level: string): void;
  thinkingLevels(): string[];
  commands(): unknown[];
  setSessionName(name: string): void;
  compact(customInstructions: string | undefined): void;
  stats(): Rec;
}

export const notAvailable = "Not available while the session is open in the terminal.";

/** The command types this bridge runs (the hello lists them). */
export const bridgeCommands = [
  "prompt", "steer", "follow_up", "abort", "get_state", "get_messages", "get_available_models", "set_model",
  "set_thinking_level", "get_available_thinking_levels", "get_session_stats", "get_commands", "set_session_name", "compact",
  "extension_ui_response",
] as const;

function content(command: Rec): Content {
  const text = typeof command.message === "string" ? command.message : "";
  const images = Array.isArray(command.images) ? command.images : [];
  return images.length === 0 ? text : [{ type: "text", text }, ...images];
}

/** Why Pi would drop a message sent now (it reports that only in the terminal). */
function undeliverable(env: BridgeEnv): string | undefined {
  if (env.isCompacting()) return "Pi is compacting the session in the terminal. Send it again when that is done.";
  if (!env.hasModel()) return "No model is selected in the terminal.";
  return undefined;
}

export async function runCommand(command: Rec, env: BridgeEnv): Promise<Rec> {
  const type = String(command.type ?? "");
  const ok = (data?: unknown): Rec =>
    data === undefined ? { type: "response", id: command.id, command: type, success: true } : { type: "response", id: command.id, command: type, success: true, data };
  const fail = (error: string): Rec => ({ type: "response", id: command.id, command: type, success: false, error });
  try {
    switch (type) {
      case "prompt":
      case "steer":
      case "follow_up": {
        // Pi refuses a message while it works unless told how to deliver it, so it is always
        // told: a run the terminal started a moment ago must not turn the phone's message away.
        const refusal = undeliverable(env);
        if (refusal) return fail(refusal);
        const behavior = type === "steer" || (type === "prompt" && command.streamingBehavior === "steer") ? "steer" : "followUp";
        env.send(content(command), behavior);
        return ok();
      }
      case "abort":
        env.abort();
        return ok();
      case "get_state":
        return ok(env.state());
      case "get_messages":
        return ok({ messages: env.messages() });
      case "get_available_models":
        return ok({ models: env.models() });
      case "set_model": {
        const model = await env.setModel(String(command.provider ?? ""), String(command.modelId ?? ""));
        return model === undefined ? fail(`Model ${command.provider}/${command.modelId} is not available.`) : ok(model);
      }
      case "set_thinking_level":
        env.setThinkingLevel(String(command.level ?? ""));
        return ok();
      case "get_available_thinking_levels":
        return ok({ levels: env.thinkingLevels() });
      case "get_session_stats":
        return ok(env.stats());
      case "get_commands":
        return ok({ commands: env.commands() });
      case "set_session_name":
        env.setSessionName(String(command.name ?? ""));
        return ok();
      case "compact":
        env.compact(typeof command.customInstructions === "string" ? command.customInstructions : undefined);
        return ok();
      default:
        return fail(notAvailable);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
