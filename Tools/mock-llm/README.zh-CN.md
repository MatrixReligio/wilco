# mock-llm

*[English](README.md) | 简体中文*

一个极小的、按脚本回复的 OpenAI 兼容 chat-completions 服务。Wilco 在测试中用它确定性地驱动**真实的** Pi agent：Pi 把它当作普通的 `openai-completions` provider 来调用，而每一条回复都来自你控制的脚本。

没有运行时依赖（只用 `node:http`）。需要 Node.js 22.18+（直接运行 TypeScript）。

## 在测试中使用

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
// 给 Pi 配置 baseUrl = llm.url，api = "openai-completions"
await llm.close();
```

## 在命令行中使用

```sh
node src/cli.ts --port 0 --script script.json
# stdout 第一行：MOCK_LLM_URL=http://127.0.0.1:54321/v1
```

收到 `SIGTERM` / `SIGINT` 时进程会正常退出。

## 脚本格式

| 字段 | 含义 |
|---|---|
| `turns[]` | 每个 `POST /v1/chat/completions` 按顺序消耗一个。用完后服务返回 `500 {"error":{"message":"mock-llm: script exhausted"}}`。 |
| `turns[].text` | 文本块，每块作为一个 SSE chunk 流式发出。 |
| `turns[].toolCalls` | `{id, name, arguments}`；以 `delta.tool_calls` 流式发出，`arguments` 为 JSON 字符串。只要有工具调用，`finish_reason` 就是 `"tool_calls"` 而不是 `"stop"`。 |
| `turns[].chunkDelayMs` | 每个内容块之前的延迟（用于测试流式输出和中止）。 |
| `turns[].usage` | 覆盖上报的用量。默认 `prompt_tokens: 10`，`completion_tokens` 为块数。 |

流式响应以一个只含用量的 chunk（`choices: []`）和 `data: [DONE]` 结束。非流式请求得到等价的完整 completion。

## 控制端点

| 端点 | 作用 |
|---|---|
| `POST /__script` | 替换脚本，并重置 turn 序号与请求日志。 |
| `GET /__requests` | 收到的所有 chat-completion 请求体（JSON 数组）。 |

## 开发

```sh
npm install
npm test        # vitest
npm run typecheck
```
