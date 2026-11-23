# Wilco Protocol

**English** · 简体中文概览见 [docs/zh-CN/protocol.md](../docs/zh-CN/protocol.md)

This directory holds the Wilco wire protocol material: the normative specification (written alongside the reference implementation), Noise usage notes, test vectors, and **canonical Pi fixtures**.

See the [Protocol overview](../docs/en/protocol.md) for the design.

## Pi fixtures

`fixtures/pi/<pi-version>/` contains real Pi RPC transcripts recorded by [`Tools/fixture-recorder`](../Tools/fixture-recorder/README.md). Every Wilco client and host implementation is tested against them, so a new Pi release that changes the wire format shows up as a failing contract test.

- `<scenario>.jsonl`: one line per record, in the order observed:
  - `{"dir":"send","record":{…}}`: a command written to Pi's stdin
  - `{"dir":"send","raw":"…"}`: a raw, non-JSON input line (used to test parse errors)
  - `{"dir":"recv","record":{…}}`: a record Pi wrote to stdout (stderr is not recorded)
- `manifest.json`: `{"piVersion": "…", "scenarios": […]}`, with no timestamps, so re-recording is byte-for-byte reproducible.
- `known-unknowns.json` (optional): record types a given Pi version emits that the Swift model deliberately keeps as `.unknown`.

Recordings are normalized: UUIDs become `<uuid-N>`, session entry ids `<entry-N>`, timestamps and durations are zeroed, and the temp workspace, mock server URL, Pi install path and home directory are replaced by `<TMP>`, `<MOCK_URL>`, `<PI_PACKAGE>` and `<HOME>`.

Re-record with your local Pi (fully isolated from your own Pi setup and sessions):

```sh
Scripts/record-fixtures.sh            # all scenarios
Scripts/record-fixtures.sh abort      # one scenario
```
