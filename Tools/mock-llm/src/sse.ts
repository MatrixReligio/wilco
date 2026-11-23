import type { MockTurn } from "./script.ts";

type Delta = {
  content?: string;
  tool_calls?: { index: number; id: string; type: "function"; function: { name: string; arguments: string } }[];
};

type Chunk = {
  id: string;
  object: "chat.completion.chunk";
  created: 0;
  model: string;
  choices: { index: 0; delta: Delta; finish_reason: "stop" | "tool_calls" | null }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

export function finishReason(turn: MockTurn): "stop" | "tool_calls" {
  return turn.toolCalls && turn.toolCalls.length > 0 ? "tool_calls" : "stop";
}

export function usageFor(turn: MockTurn) {
  const prompt = turn.usage?.prompt_tokens ?? 10;
  const completion = turn.usage?.completion_tokens ?? (turn.text?.length ?? 0) + (turn.toolCalls?.length ?? 0);
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}

function toolCallDeltas(turn: MockTurn): Delta["tool_calls"] {
  return (turn.toolCalls ?? []).map((call, index) => ({
    index,
    id: call.id,
    type: "function" as const,
    function: { name: call.name, arguments: JSON.stringify(call.arguments) },
  }));
}

/**
 * The SSE chunk sequence for one turn: one chunk per text piece, one per tool call,
 * the last of which carries finish_reason, then a usage-only chunk.
 */
export function streamChunks(turn: MockTurn, id: string, model: string): Chunk[] {
  const deltas: Delta[] = [
    ...(turn.text ?? []).map((content) => ({ content })),
    ...(toolCallDeltas(turn) ?? []).map((call) => ({ tool_calls: [call] })),
  ];
  if (deltas.length === 0) deltas.push({ content: "" });
  const chunk = (delta: Delta, finish: Chunk["choices"][0]["finish_reason"]): Chunk => ({
    id, object: "chat.completion.chunk", created: 0, model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  const chunks = deltas.map((delta, i) => chunk(delta, i === deltas.length - 1 ? finishReason(turn) : null));
  chunks.push({ id, object: "chat.completion.chunk", created: 0, model, choices: [], usage: usageFor(turn) });
  return chunks;
}

export function completion(turn: MockTurn, id: string, model: string) {
  const toolCalls = toolCallDeltas(turn);
  return {
    id, object: "chat.completion", created: 0, model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: (turn.text ?? []).join(""),
        ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls.map(({ index: _, ...call }) => call) } : {}),
      },
      finish_reason: finishReason(turn),
    }],
    usage: usageFor(turn),
  };
}
