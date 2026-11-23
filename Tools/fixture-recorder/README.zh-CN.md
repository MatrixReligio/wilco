# fixture-recorder

*[English](README.md) | 简体中文*

为 Wilco 的契约测试录制真实的 Pi RPC 交互记录。每个场景都会启动 `pi --mode rpc` 并对接 [mock-llm](../mock-llm/README.zh-CN.md)，依次执行步骤，再把归一化后的 JSONL 记录写到 `Protocol/fixtures/pi/<pi 版本>/`。

## 隔离

录制过程绝不会触碰你的 Pi 配置或正在运行的会话：

- 使用一次性的临时根目录，其中有独立的 `HOME`、`PI_CODING_AGENT_DIR`（只含一个 `mock` provider）、工作目录和会话目录；
- 只继承 `PATH`、语言区域和终端相关变量，不会带入任何 API key 或 `PI_*` 设置；并设置 `PI_OFFLINE=1`、`PI_TELEMETRY=0`；
- 使用 `--no-skills --no-prompt-templates --no-context-files --no-mcp --no-extensions --no-themes`，场景没有要求（临时）会话目录时加 `--no-session`；
- 只会向录制器自己启动的子进程发送信号。

## 运行

```sh
npm install
node src/cli.ts --pi "$(command -v pi)" --out ../../Protocol/fixtures/pi --scenarios all
# 或在仓库根目录执行：Scripts/record-fixtures.sh [name,name|all]
npm test   # 单元测试；PATH 中有 pi（或设置了 PI_PATH）时也会运行集成测试
```

## 场景

`scenarios/<name>.json`（文件名即场景名）：

```jsonc
{
  "mock": { "turns": [{ "text": ["Hello"] }] },   // mock-llm 脚本
  "useSessionDir": false,                          // true：--session-dir <tmp>/sessions
  "extensions": ["extensions/ui-probe.ts"],        // 通过 -e 加载
  "steps": [
    { "send": { "type": "prompt", "message": "Hi" } },  // 没写 id 时自动分配 "c<n>"
    { "await": "response" },                            // 等最近一次 send/sendRaw 的响应
    { "await": "event", "type": "message_update", "assistantEvent": "text_delta" },
    { "respondUI": { "method": "select", "value": "Allow" } },
    { "sendRaw": "{not json" },
    { "sleepMs": 300 }
  ]
}
```

`send` 中的字符串值可以用 `"$last:<command>:<path>"` 引用之前的响应，例如 `"$last:get_fork_messages:data.messages[1].entryId"`。每一步超时为 15 秒。

## 归一化

UUID → `<uuid-N>`；`id`、`parentId`、`entryId`、`firstKeptEntryId`、`leafId`、`fromId`、`since`、`targetId` 下的 8 位十六进制会话 entry id → `<entry-N>`；`timestamp` 与 `durationMs` 置零（字符串中的 ISO 时间戳也会处理）；临时根目录 → `<TMP>`；mock 地址 → `<MOCK_URL>`；Pi 安装路径 → `<PI_PACKAGE>`；主目录 → `<HOME>`。同一文件内，同一个原始值始终映射到同一个占位符。
