# mock-llm

*English | [简体中文](README.zh-CN.md)*

A tiny scripted, OpenAI-compatible chat-completions server. Wilco uses it to drive a **real** Pi agent deterministically in tests: Pi talks to it like any `openai-completions` provider, and every reply comes from a script you control.

No runtime dependencies (only `node:http`). Requires Node.js 22.18+ (runs TypeScript directly).

## Use it from tests

```ts
import { startMockLLM } from "./src/server.ts";

const llm = await startMockLLM({
  port: 0,
  script: {
    turns: [
      { text: ["Let me check."], toolCalls: [{ id: "call_1", name: "bash", arguments: { command: "ls" } }] },
      { text: ["Done", "."], chunkDelayMs: 20 },
    ],
  },
});
// configure Pi with baseUrl = llm.url, api = "openai-completions"
await llm.close();
```

## Use it from the command line

```sh
node src/cli.ts --port 0 --script script.json
# first stdout line: MOCK_LLM_URL=http://127.0.0.1:54321/v1
```

The process exits cleanly on `SIGTERM` / `SIGINT`.

## Script format

| Field | Meaning |
|---|---|
| `turns[]` | Consumed one per `POST /v1/chat/completions`, in order. When none are left the server answers `500 {"error":{"message":"mock-llm: script exhausted"}}`. |
| `turns[].text` | Text chunks, streamed one SSE chunk each. |
| `turns[].toolCalls` | `{id, name, arguments}`; streamed as `delta.tool_calls` with `arguments` as a JSON string. Their presence makes `finish_reason` `"tool_calls"` instead of `"stop"`. |
| `turns[].chunkDelayMs` | Delay before each content chunk (to test streaming and aborts). |
| `turns[].usage` | Overrides the reported usage. Default: `prompt_tokens: 10`, `completion_tokens` = number of chunks. |

Streaming responses end with a usage-only chunk (`choices: []`) and `data: [DONE]`. Non-streaming requests get the equivalent single completion.

## Control endpoints

| Endpoint | Effect |
|---|---|
| `POST /__script` | Replace the script; resets the turn pointer and the request log. |
| `GET /__requests` | JSON array of every chat-completion request body received. |

## Develop

```sh
npm install
npm test        # vitest
npm run typecheck
```
