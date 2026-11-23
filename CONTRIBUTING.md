<p align="center"><strong>English</strong> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a></p>

# Contributing to Wilco

Thanks for helping make Wilco better. This guide covers the open-source parts in this repository: the relay, the Pi extensions, the protocol and the docs.

## Before you start

- For anything larger than a small fix, please open an issue first so we can agree on the approach.
- Security issues go through [SECURITY.md](SECURITY.md), never through public issues.
- By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).

## Ground rules

1. **Test first.** Wilco is built test-first. Every behavior change comes with a test that failed before the change and passes after it. Pull requests without tests for new behavior will be asked to add them.
2. **Write it yourself.** Do not copy code from projects with incompatible licenses (for example GPL). Ideas are welcome; copied code is not.
3. **Keep the open parts self-contained.** Code here must not depend on Wilco's closed-source apps.
4. **Protocol changes are additive.** Within a major protocol version, new fields and messages must be optional and gated by a capability. Update the spec, the fixtures and both language versions of the docs in the same pull request.
5. **Docs come in two languages.** English is the default; every user-facing document has a Simplified Chinese version. If you can only write one language, say so in the pull request and a maintainer will help.

## Development setup

Each component has its own README with setup and test commands:

- [`Relay/`](Relay/): TypeScript, Cloudflare Workers, Vitest
- [`Bridge/`](Bridge/): TypeScript Pi extensions, Vitest
- [`Protocol/`](Protocol/): specification, fixtures and test vectors

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- Keep pull requests focused on one change. Fill in the pull request template.
- All CI checks must pass before review.

## Reporting bugs and requesting features

Use the issue templates. For bugs, include your Wilco, Pi and OS versions, what you expected, what happened, and the steps to reproduce.
