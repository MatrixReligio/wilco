<p align="right"><strong>English</strong> · <a href="../zh-CN/architecture.md">简体中文</a></p>

# Architecture

Wilco has four parts. Pi stays the only agent: Wilco starts, follows and controls Pi, and never replaces it.

| Part | Runs on | Role | Source |
| --- | --- | --- | --- |
| Wilco app | iPhone, iPad | The remote control: sessions, chat, tool timeline, approvals, Live Activities | Closed |
| Wilco Host | Your Mac | `wilcod` background agent plus a menu-bar app and dashboard. Owns Pi processes, pairing, workspaces and connections | Closed |
| Wilco Relay | Cloudflare | Forwards encrypted traffic when you're away from home; sends encrypted push notifications | Open (`Relay/`) |
| Pi extensions | Inside Pi | `wilco-bridge` connects Pi TUI sessions; `wilco-guard` asks for approval before risky tool calls | Open (`Bridge/`) |

## Data flow

```text
Wilco app ─┬─ LAN / direct TCP ──────────────┐
           └─ WebSocket ─ Wilco Relay ───────┤  same end-to-end encrypted records
                                             ▼
                                   wilcod (Wilco Host)
                                   ├─ pi --mode rpc   ← one process per active session
                                   └─ Unix socket ← Pi TUI + wilco-bridge
```

## Design principles

1. **Pi is the source of truth.** Pi's JSONL session files are the only durable record of your conversations. The app loads sessions from the host as you open them and keeps no copy; the host and relay store no conversation content.
2. **Thin host, native records.** On a session channel, Wilco carries Pi's official RPC records unchanged inside a small envelope (sequence number, session id). The host adds only what Pi doesn't provide: pairing, workspaces, session listing, files, push, and capability negotiation.
3. **Forward compatible.** The app decodes the record types it knows and keeps unknown ones as raw JSON, shown with a generic view. A Pi update that adds events doesn't break the app.
4. **One writer per session.** A session is driven either by a host-owned Pi RPC process or by a Pi TUI running `wilco-bridge`, never both at the same time. The host hands control over when that is safe.
5. **Least exposure.** Only workspaces you authorize are visible. Absolute paths outside them are replaced with opaque identifiers before leaving your Mac.

## Connections

The app tries every route at the same time and keeps the first that works: your local network (found with Bonjour), saved direct addresses such as a Tailscale address, and the Wilco Relay. If a connection drops, the app reconnects and resumes from the last sequence number it received. When the gap is too large, it catches up with Pi's durable entry cursor (`get_entries since`).

See also: [Security model](security-model.md) · [Protocol overview](protocol.md)
