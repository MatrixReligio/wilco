# Wilco Pi extensions

**English** · [简体中文](README.zh-CN.md)

## wilco-guard

wilco-guard asks for your approval, through Pi's extension UI, before risky tool calls. In a session started by Wilco Host the question reaches your iPhone or iPad. If you are away, it arrives as a notification; when the whole command fits in it, you can approve or deny it from the lock screen, otherwise it opens the question in the app. Questions have no time limit: Pi waits until you answer.

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

Touching the policy's folder, or any folder listed one per line in `WILCO_GUARD_PROTECT` (Wilco Host lists its state folder), is always asked about, whatever the rules. Both variables are removed from the environment once read, so the commands Pi runs do not inherit them. Commands are checked including `$(…)` and backtick substitutions, also inside double quotes; a substitution that cannot be read with confidence (unbalanced, with a comment, or backticks inside double quotes) is asked about as an indirect command.

Questions use `ctx.ui.confirm`, with a title that starts with `wilco-guard: `. Without a UI to ask (for example `pi -p`), a call that would be asked about is blocked.

## wilco-bridge

wilco-bridge brings a Pi session you started in Terminal to Wilco on your iPhone and iPad. Wilco Host lists the session with **In the Mac terminal**, and you can follow it live and keep working in it from the phone while the terminal shows the same session.

### Install

- **From Wilco Host:** open the Pi page in Wilco Host's settings and click **Install** under Terminal sessions. Wilco Host runs `pi install` with the copy of wilco-bridge it bundles; **Remove** undoes it.
- **On its own:** `pi install npm:@matrixreligio/wilco` installs wilco-bridge together with wilco-guard.

Pi sessions started after installing load it. The session's folder must be one you share in Wilco Host; for other folders the extension does nothing.

### What works from the phone

Sending prompts, steering and follow-ups, stopping a run, changing the model and thinking level, naming and compacting the session, and answering wilco-guard's questions (when wilco-guard is installed in Pi too). The app does not offer what the terminal cannot do from outside, such as clearing queued messages or running `!` shell commands. A question another extension asks in the terminal can be answered only there.

### One session, one writer

A session is run by one Pi at a time: Wilco Host's own, or the terminal's. If you open a session in Terminal that Wilco Host's Pi holds, the Host hands it over: at once when its Pi is idle, otherwise when the current run ends. Until then the terminal follows and does not take typing (Pi says so). When you close the terminal, the next time you open the session on your phone Wilco Host continues it with its own Pi.

wilco-bridge talks to Wilco Host over a socket only your Mac user can open: `~/Library/Application Support/Wilco/Host/bridge.sock` (`WILCO_BRIDGE_SOCKET` names another). If Wilco Host is not running, it keeps trying in the background and the terminal works as usual. The protocol is in [Protocol/bridge.md](../Protocol/bridge.md).

## Develop

```sh
npm install
npm test          # rules and the bridge, plus real Pi runs (TUI on a pseudo-terminal too) when pi is installed (isolated: temp HOME, never your ~/.pi)
npm run typecheck
```
