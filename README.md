<p align="center"><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>

# Wilco

**Your Pi agent at home. You, anywhere.**

Wilco is a native iPhone and iPad client for the [Pi coding agent](https://github.com/earendil-works/pi). It lets you start, follow, steer and approve Pi sessions that run on your own Mac, from anywhere, without moving your code, credentials or conversations off that Mac.

> *Wilco* is radio shorthand for "will comply": you give the instruction, your agent carries it out.

> [!IMPORTANT]
> Wilco is in early development. Nothing in this repository is ready to install yet. Watch the repository or read the [roadmap](#roadmap) to follow progress.

## Why Wilco

- **Local-first.** Pi keeps running on your Mac. Repositories, API keys and session history never leave it. Wilco has no account system and no cloud copy of your conversations.
- **End-to-end encrypted, everywhere.** On your home network Wilco connects directly. Away from home, it goes through a relay that only forwards encrypted bytes and cannot read them. Push notifications are encrypted too.
- **Built for agent work, not just chat.** Sessions read like flights on a departures board: status, current step, context usage and cost at a glance. Tool calls show as a timeline with diffs and terminal output, and approvals reach your lock screen.
- **Follows Pi as it evolves.** Wilco passes Pi's official RPC records through unchanged instead of re-inventing them. New Pi events and extension dialogs show up without an app update, and contract tests catch protocol changes early.
- **Works with your terminal.** The optional `wilco-bridge` Pi extension lets your phone follow and drive a session you started in the Pi TUI.

## How it works

```text
 iPhone / iPad                        Your Mac
┌──────────────┐   LAN (direct)     ┌──────────────────────────────┐
│  Wilco app   │◄──────────────────►│  Wilco Host (wilcod)         │
│              │                    │   ├─ pi --mode rpc  (session) │
│              │   Internet         │   ├─ pi --mode rpc  (session) │
│              │◄──► Wilco Relay ◄─►│   └─ Pi TUI + wilco-bridge    │
└──────────────┘   (ciphertext only)└──────────────────────────────┘
```

1. **Wilco Host** runs on your Mac and starts Pi through its official RPC mode, one process per active session.
2. You pair your iPhone once by scanning a QR code. From then on, the two devices authenticate each other with a Noise handshake.
3. The app connects over your local network, any address you can reach directly (for example Tailscale), or the Wilco Relay, whichever works first.

Read more in [Architecture](docs/en/architecture.md) and [Security model](docs/en/security-model.md).

## What's in this repository

This repository holds Wilco's open-source parts, under the MIT license:

| Path | What it is |
| --- | --- |
| [`Relay/`](Relay/) | Cloudflare Worker that relays encrypted traffic. You can run your own. |
| [`Push/`](Push/) | Cloudflare Worker that passes notifications, sealed to each device, and Live Activity updates to Apple's push service. |
| [`Bridge/`](Bridge/) | Pi extensions: `wilco-bridge` (connects Pi TUI sessions to Wilco) and `wilco-guard` (approval policies). |
| [`Protocol/`](Protocol/) | The Wilco wire protocol specification, test vectors and recorded Pi fixtures. |
| [`Tools/`](Tools/) | Test tooling: [`mock-llm`](Tools/mock-llm/) (scripted OpenAI-compatible model) and [`fixture-recorder`](Tools/fixture-recorder/) (records isolated Pi RPC transcripts). |
| [`docs/`](docs/) | User and developer documentation in English and Chinese. |

The iOS app and the Mac host are developed in a separate repository and distributed as signed binaries.

## Roadmap

| Milestone | Scope |
| --- | --- |
| M0 Foundations | Protocol core, test infrastructure, recorded Pi fixtures |
| M1 Local MVP | Pairing, sessions, live chat and tool timeline on your home network |
| M2 Anywhere | Wilco Relay, seamless reconnect and resume |
| M3 Reach you | Encrypted push, Live Activities, lock-screen approvals, widgets, Siri |
| M4 Depth | Session tree and forks, files and diffs, usage stats, `wilco-bridge` for the Pi TUI |
| M5 Launch | iPad polish, localization, accessibility, App Store release |

## Documentation

- [Architecture](docs/en/architecture.md)
- [Security model](docs/en/security-model.md)
- [Protocol overview](docs/en/protocol.md)
- [Self-hosting the relay](docs/en/self-hosting-relay.md)
- [FAQ](docs/en/faq.md)

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md). To report a security issue, follow [SECURITY.md](SECURITY.md) and do not open a public issue.

## License

[MIT](LICENSE) © MatrixReligio LLC

Wilco is an independent project. It is not affiliated with or endorsed by the Pi project or Earendil. "Pi" is used only to describe compatibility.
