import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { startMockLLM, type MockLLM, type MockScript } from "../src/server.ts";

let llm: MockLLM | undefined;
afterEach(async () => {
  await llm?.close();
  llm = undefined;
});

async function start(script: MockScript): Promise<MockLLM> {
  llm = await startMockLLM({ port: 0, script });
  return llm;
}

async function chat(url: string, body: Record<string, unknown> = {}): Promise<Response> {
  return fetch(`${url}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "mock-1", stream: true, messages: [{ role: "user", content: "hi" }], ...body }),
  });
}

async function sseData(res: Response): Promise<string[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length));
}

function chunks(data: string[]): any[] {
  return data.filter((d) => d !== "[DONE]").map((d) => JSON.parse(d));
}

test("streams text chunks then DONE", async () => {
  const { url } = await start({ turns: [{ text: ["Hello", " world"] }] });
  const res = await chat(url);
  expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
  const data = await sseData(res);
  expect(data.at(-1)).toBe("[DONE]");
  const parsed = chunks(data);
  const text = parsed.map((c) => c.choices[0]?.delta?.content ?? "").join("");
  expect(text).toBe("Hello world");
  expect(parsed.filter((c) => c.choices[0]?.finish_reason === "stop")).toHaveLength(1);
  expect(parsed.every((c) => c.model === "mock-1" && c.object === "chat.completion.chunk")).toBe(true);
  const usage = parsed.at(-1);
  expect(usage.choices).toEqual([]);
  expect(usage.usage).toMatchObject({ prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 });
});

test("streams tool calls with finish_reason tool_calls", async () => {
  const args = { command: "ls -la", nested: { n: 1 } };
  const { url } = await start({ turns: [{ text: ["Let me look."], toolCalls: [{ id: "call_1", name: "bash", arguments: args }] }] });
  const parsed = chunks(await sseData(await chat(url)));
  const calls = parsed.flatMap((c) => c.choices[0]?.delta?.tool_calls ?? []);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ index: 0, id: "call_1", type: "function", function: { name: "bash" } });
  expect(JSON.parse(calls[0].function.arguments)).toEqual(args);
  expect(parsed.filter((c) => c.choices[0]?.finish_reason === "tool_calls")).toHaveLength(1);
  expect(parsed.some((c) => c.choices[0]?.finish_reason === "stop")).toBe(false);
});

test("turns are consumed in order", async () => {
  const { url } = await start({ turns: [{ text: ["first"] }, { text: ["second"] }] });
  const t1 = chunks(await sseData(await chat(url))).map((c) => c.choices[0]?.delta?.content ?? "").join("");
  const t2 = chunks(await sseData(await chat(url))).map((c) => c.choices[0]?.delta?.content ?? "").join("");
  expect([t1, t2]).toEqual(["first", "second"]);
});

test("exhausted script returns 500", async () => {
  const { url } = await start({ turns: [] });
  const res = await chat(url);
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: { message: "mock-llm: script exhausted" } });
});

test("chunkDelayMs delays each chunk", async () => {
  const { url } = await start({ turns: [{ text: ["a", "b", "c"], chunkDelayMs: 50 }] });
  const started = performance.now();
  await sseData(await chat(url));
  expect(performance.now() - started).toBeGreaterThanOrEqual(150);
});

test("records request bodies", async () => {
  const { url } = await start({ turns: [{ text: ["x"] }] });
  const messages = [{ role: "system", content: "sys" }, { role: "user", content: "what is 2+2?" }];
  await (await chat(url, { messages })).text();
  const log = (await (await fetch(`${url.replace(/\/v1$/, "")}/__requests`)).json()) as any[];
  expect(log).toHaveLength(1);
  expect(log[0].messages).toEqual(messages);
});

test("non-streaming request returns a full completion", async () => {
  const { url } = await start({ turns: [{ text: ["Hi", "!"], toolCalls: [{ id: "c", name: "read", arguments: { path: "a" } }] }] });
  const body = (await (await chat(url, { stream: false })).json()) as any;
  expect(body.object).toBe("chat.completion");
  expect(body.choices[0].message.content).toBe("Hi!");
  expect(body.choices[0].finish_reason).toBe("tool_calls");
  expect(JSON.parse(body.choices[0].message.tool_calls[0].function.arguments)).toEqual({ path: "a" });
});

test("__script replaces the script and resets state", async () => {
  const { url } = await start({ turns: [{ text: ["old"] }] });
  const base = url.replace(/\/v1$/, "");
  await (await chat(url)).text();
  const res = await fetch(`${base}/__script`, { method: "POST", body: JSON.stringify({ turns: [{ text: ["new"] }] }) });
  expect(res.status).toBe(200);
  const text = chunks(await sseData(await chat(url))).map((c) => c.choices[0]?.delta?.content ?? "").join("");
  expect(text).toBe("new");
  expect(((await (await fetch(`${base}/__requests`)).json()) as any[]).length).toBe(1);
});

test("cli prints url line first", async () => {
  const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
  const child = spawn(process.execPath, [cli, "--port", "0"], { stdio: ["ignore", "pipe", "inherit"] });
  try {
    let out = "";
    child.stdout.setEncoding("utf8");
    for await (const chunk of child.stdout) {
      out += chunk;
      if (out.includes("\n")) break;
    }
    const first = out.split("\n")[0];
    expect(first).toMatch(/^MOCK_LLM_URL=http:\/\/127\.0\.0\.1:\d+\/v1$/);
    const res = await fetch(`${first.slice("MOCK_LLM_URL=".length)}/chat/completions`, { method: "POST", body: "{}" });
    expect(res.status).toBe(500);
  } finally {
    child.kill("SIGTERM");
    const [code, signal] = await once(child, "exit");
    expect(code === 0 || signal === "SIGTERM").toBe(true);
  }
});
