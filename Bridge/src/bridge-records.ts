// Pi's extension events, in the shapes Pi's RPC mode writes them (Open/Protocol/bridge.md). The
// terminal's events carry more than RPC sends (whole messages on every update, the turn's
// context); those extra fields are left out so the records match a session Wilco Host runs.

type Rec = Record<string, unknown>;

/** The RPC record for an extension event, or undefined for events RPC does not send. */
export function toRPC(name: string, event: Rec): Rec | undefined {
  switch (name) {
    case "agent_start":
      return { type: "agent_start" };
    case "agent_end":
      return { type: "agent_end", messages: event.messages ?? [], willRetry: event.willRetry ?? false };
    case "agent_settled":
      return { type: "agent_settled", aborted: event.aborted ?? false };
    case "turn_start":
      return { type: "turn_start" };
    case "turn_end":
      return { type: "turn_end", message: event.message, toolResults: event.toolResults ?? [] };
    case "message_start":
    case "message_end":
      return { type: name, message: event.message };
    case "message_update": {
      const record: Rec = { type: "message_update", assistantMessageEvent: event.assistantMessageEvent };
      const usage = (event.message as Rec | undefined)?.usage;
      if (usage !== undefined) record.usage = usage;
      return record;
    }
    case "tool_execution_start":
      return pick(name, event, ["toolCallId", "toolName", "args"]);
    case "tool_execution_update":
      return pick(name, event, ["toolCallId", "toolName", "args", "partialResult"]);
    case "tool_execution_end":
      return pick(name, event, ["toolCallId", "toolName", "result", "isError", "durationMs"]);
    case "session_before_compact":
      return { type: "compaction_start", reason: event.reason };
    case "session_compact":
      return { type: "compaction_end", reason: event.reason, result: event.compactionEntry ?? null, aborted: false, willRetry: event.willRetry ?? false };
    case "session_compact_failed": {
      const record: Rec = { type: "compaction_end", reason: event.reason, result: null, aborted: event.aborted ?? false, willRetry: event.willRetry ?? false };
      if (event.errorMessage !== undefined) record.errorMessage = event.errorMessage;
      return record;
    }
    case "session_info_changed":
      return { type: "session_info_changed", name: event.name };
    case "thinking_level_select":
      return { type: "thinking_level_changed", level: event.level };
    default:
      return undefined;
  }
}

/** The extension events the bridge listens to. */
export const forwardedEvents = [
  "agent_start", "agent_end", "agent_settled", "turn_start", "turn_end",
  "message_start", "message_update", "message_end",
  "tool_execution_start", "tool_execution_update", "tool_execution_end",
  "session_before_compact", "session_compact", "session_compact_failed",
  "session_info_changed", "thinking_level_select",
] as const;

function pick(type: string, event: Rec, keys: string[]): Rec {
  const record: Rec = { type };
  for (const key of keys) if (event[key] !== undefined) record[key] = event[key];
  return record;
}
