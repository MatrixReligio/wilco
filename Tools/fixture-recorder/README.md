# fixture-recorder

*English | [简体中文](README.zh-CN.md)*

Records real Pi RPC transcripts for Wilco's contract tests. Each scenario starts `pi --mode rpc` against [mock-llm](../mock-llm/README.md), runs a list of steps, and writes a normalized JSONL transcript to `Protocol/fixtures/pi/<pi-version>/`.

## Isolation

Recording never touches your Pi setup or running sessions:

- a throw-away temp root with its own `HOME`, `PI_CODING_AGENT_DIR` (containing only a `mock` provider), working directory and session directory;
- only `PATH`, locale and terminal variables are inherited, so no API keys or `PI_*` settings leak in; `PI_OFFLINE=1`, `PI_TELEMETRY=0`;
- `--no-skills --no-prompt-templates --no-context-files --no-mcp --no-extensions --no-themes`, plus `--no-session` unless a scenario asks for a (temporary) session dir;
- Pi's managed launcher (`~/.pi/agent/bin/pi`) is resolved to the release binary it would run, because the launcher exports `PI_MANAGED_INSTALL_ROOT`, which makes Pi tidy up `~/.pi/agent/install` on start-up;
- only the child processes the recorder started are ever signalled.

## Run

```sh
npm install
node src/cli.ts --pi "$(command -v pi)" --out ../../Protocol/fixtures/pi --scenarios all
npm run record                          # all scenarios into ../../Protocol/fixtures/pi, pi from PI_PATH or PATH
npm run record -- --scenarios abort     # one scenario
npm test   # unit tests; integration tests run when pi is on PATH (or PI_PATH is set)
```

## Scenarios

`scenarios/<name>.json` (the file name is the scenario name):

```jsonc
{
  "mock": { "turns": [{ "text": ["Hello"] }] },   // mock-llm script
  "useSessionDir": false,                          // true: --session-dir <tmp>/sessions
  "extensions": ["extensions/ui-probe.ts"],        // loaded with -e
  "steps": [
    { "send": { "type": "prompt", "message": "Hi" } },  // id "c<n>" is assigned when absent
    { "await": "response" },                            // response to the last send/sendRaw
    { "await": "event", "type": "message_update", "assistantEvent": "text_delta" },
    { "respondUI": { "method": "select", "value": "Allow" } },
    { "sendRaw": "{not json" },
    { "sleepMs": 300 }
  ]
}
```

String values in `send` may reference earlier responses as `"$last:<command>:<path>"`, e.g. `"$last:get_fork_messages:data.messages[1].entryId"`. Each step times out after 15 s.

## Normalization

UUIDs → `<uuid-N>`; 8-hex session entry ids under `id`, `parentId`, `entryId`, `firstKeptEntryId`, `leafId`, `fromId`, `since`, `targetId` → `<entry-N>`; `timestamp` and `durationMs` zeroed (also ISO timestamps inside strings); temp root → `<TMP>`; mock URL → `<MOCK_URL>`; Pi install path → `<PI_PACKAGE>`; home directory → `<HOME>`. The same original value always maps to the same placeholder within a file.
