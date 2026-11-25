# Wilco Pi extensions

**English** · [简体中文](README.zh-CN.md)

## wilco-guard

wilco-guard asks for your approval, through Pi's extension UI, before risky tool calls. In a session started by Wilco Host the question reaches your iPhone or iPad. If you are away, it arrives as a notification you can approve from the lock screen. Questions have no time limit: Pi waits until you answer.

What it asks about:

| Rule | Default | Asks before |
|---|---|---|
| Dangerous commands | on | `rm -r`, `sudo`, `git push --force` (and `+ref`, `--delete`, `--mirror`), `git reset --hard`, `git clean -f`, `mkfs`, `dd of=`, `chmod -R` / `chown -R`, `find -delete`, `shutdown` / `reboot`, piping into a shell, and redirecting into a device |
| Writes outside the workspace | on | `write` and `edit` on a path outside the session's working folder |
| Every command (strict) | off | every `bash` command |

Commands are also asked about when their target cannot be read (`$CMD`, `$(…)` in the command position); wrappers such as `env`, `nice`, `timeout`, `xargs`, `sh -c` and `eval` are looked through. Touching wilco-guard's own folder (its policy and code) is always asked about, whatever the rules say.

The rules are a safety net against mistakes, not a sandbox: Pi runs as you, so a command that sets out to get past them can (for example through a script file). Use strict mode when that matters.

### With Wilco Host

Nothing to install: Wilco Host bundles wilco-guard and loads it into every session it starts. You can change the rules in Wilco Host's settings, or on your phone under the Host's settings. Changes apply to running sessions at once.

### On its own

```sh
pi install npm:@matrixreligio/wilco
```

The policy is read on every tool call from the JSON file named by `WILCO_GUARD_POLICY`. Without the variable, or when the file cannot be read or is malformed, the defaults apply:

```json
{ "dangerousCommands": true, "outsideWorkspace": true, "allBash": false }
```

Questions use `ctx.ui.confirm`, with a title that starts with `wilco-guard: `. Without a UI to ask (for example `pi -p`), a call that would be asked about is blocked.

## wilco-bridge

wilco-bridge (planned for milestone M4) will connect a Pi TUI session to Wilco Host over a local Unix socket, so your phone can follow and drive it.

## Develop

```sh
npm install
npm test          # rules, plus a real Pi run when pi is installed (isolated: temp HOME, never your ~/.pi)
npm run typecheck
```
