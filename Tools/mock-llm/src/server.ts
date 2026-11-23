import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { parseScript, type MockScript } from "./script.ts";
import { completion, streamChunks } from "./sse.ts";

export type { MockScript, MockToolCall, MockTurn } from "./script.ts";

export type MockLLM = {
  /** Base URL to configure as an OpenAI-compatible provider, e.g. http://127.0.0.1:1234/v1 */
  url: string;
  port: number;
  setScript(script: MockScript): void;
  requests(): unknown[];
  close(): Promise<void>;
};

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  req.setEncoding("utf8");
  for await (const chunk of req) body += chunk;
  return body;
}

function sendJSON(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

export async function startMockLLM(opts: { port?: number; script?: MockScript } = {}): Promise<MockLLM> {
  let script: MockScript = opts.script ?? { turns: [] };
  let nextTurn = 0;
  let log: unknown[] = [];

  const setScript = (s: MockScript) => {
    script = s;
    nextTurn = 0;
    log = [];
  };

  async function chatCompletions(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse((await readBody(req)) || "{}");
      if (typeof parsed === "object" && parsed !== null) body = parsed as Record<string, unknown>;
    } catch {
      return sendJSON(res, 400, { error: { message: "mock-llm: invalid JSON body" } });
    }
    log.push(body);
    const turn = script.turns[nextTurn];
    if (!turn) return sendJSON(res, 500, { error: { message: "mock-llm: script exhausted" } });
    nextTurn += 1;

    const id = `mock-${nextTurn}`;
    const model = typeof body.model === "string" ? body.model : "mock";
    if (body.stream !== true) return sendJSON(res, 200, completion(turn, id, model));

    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    for (const chunk of streamChunks(turn, id, model)) {
      if (turn.chunkDelayMs && chunk.choices.length > 0) await sleep(turn.chunkDelayMs);
      if (res.destroyed) return;
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.end("data: [DONE]\n\n");
  }

  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    const route = `${req.method} ${path}`;
    const handle = async () => {
      switch (route) {
        case "POST /v1/chat/completions":
          return chatCompletions(req, res);
        case "POST /__script":
          try {
            setScript(parseScript(JSON.parse(await readBody(req))));
            return sendJSON(res, 200, { ok: true });
          } catch (error) {
            return sendJSON(res, 400, { error: { message: String(error) } });
          }
        case "GET /__requests":
          return sendJSON(res, 200, log);
        default:
          return sendJSON(res, 404, { error: { message: `mock-llm: no route ${route}` } });
      }
    };
    handle().catch((error) => {
      if (!res.headersSent) sendJSON(res, 500, { error: { message: String(error) } });
      else res.destroy();
    });
  });

  server.listen(opts.port ?? 0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}/v1`,
    port,
    setScript,
    requests: () => [...log],
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
