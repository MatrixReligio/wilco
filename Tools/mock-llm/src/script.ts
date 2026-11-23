/** One scripted tool call the mock model will emit. */
export type MockToolCall = { id: string; name: string; arguments: Record<string, unknown> };

/** One assistant turn: text chunks are streamed in order, then tool calls. */
export type MockTurn = {
  text?: string[];
  toolCalls?: MockToolCall[];
  chunkDelayMs?: number;
  usage?: { prompt_tokens: number; completion_tokens: number };
};

/** Turns are consumed one per chat completion request, in order. */
export type MockScript = { turns: MockTurn[] };

export function parseScript(value: unknown): MockScript {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { turns?: unknown }).turns)) {
    throw new Error("mock-llm: a script must be an object with a 'turns' array");
  }
  return value as MockScript;
}
