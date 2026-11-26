<p align="right"><strong>English</strong> · <a href="../zh-CN/notifications-and-approvals.md">简体中文</a></p>

# Approvals and notifications

## Approvals

Every session Wilco Host starts runs with [wilco-guard](../../Bridge/README.md#wilco-guard). Before Pi runs a risky command (`rm -r`, `sudo`, `git push --force` and the like) or writes outside its folder, it stops and asks you. The question shows up in the session on your iPhone or iPad, and Pi waits, with no time limit, until you approve or deny it.

wilco-guard is a safety net against mistakes, not a sandbox: Pi runs as you, so a command written to get past the rules (through a script file, say) can. When that matters, turn on Every command, which asks before each command Pi runs.

You choose what is asked about in the app, in Settings → your Mac → Ask for Approval. The rules are kept on the Mac and apply to its running sessions at once; see [wilco-guard with Wilco Host](../../Bridge/README.md#with-wilco-host).

## Notifications

Turn them on in Settings → Notifications. You can be told about:

- **Questions and approvals:** Pi is waiting for you.
- **Finished runs:** Pi finished what you asked, with the start of its answer.
- **Errors:** a run stopped because of an error.

Notifications are end-to-end encrypted. Your Mac seals each one so that only your device can open it; Wilco's push service passes it on without being able to read it. See [Protocol/push.md](../../Protocol/push.md).

### Approving from the Lock Screen

A question about a command shows **Approve** and **Deny** right on the notification, when the whole command fits in it. Both need Face ID, Touch ID or your passcode. A long command, one spread over several lines, or one with characters that cannot be seen opens the question in the app instead, so you always read exactly what you approve.

## Live Activities

When you send a prompt from the app, the run appears on the Lock Screen and in the Dynamic Island: whether Pi is working or waiting for you, how many steps it took, and for how long. It shows only the folder's and the Mac's names, never your code or commands. While Pi waits for a yes-or-no answer it offers **Deny**, and a button that opens the question so you can read it and approve it. Turn Live Activities off in Settings → Notifications.

## Widgets

Add the **Pi Sessions** widget to your Home Screen to see what needs you and what Pi is working on. Tap a session to open it. Session names are hidden while your iPhone is locked.

## Siri and Shortcuts

- "Ask Pi with Wilco" starts a new session in a folder you choose, with your request.
- "What is Pi doing in Wilco" tells you what needs you and what is running.

Both work only once your iPhone is unlocked.
