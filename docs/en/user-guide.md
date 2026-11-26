<p align="right"><strong>English</strong> · <a href="../zh-CN/user-guide.md">简体中文</a></p>

# Wilco user guide

Wilco lets you use the [Pi coding agent](https://github.com/earendil-works/pi) on your Mac from your iPhone or iPad: start sessions, follow them live, answer Pi's questions, approve risky commands and review what changed, from home or anywhere else. Pi keeps running on your Mac with your own settings, models and extensions. Your code and keys never leave the Mac.

Wilco has two parts:

- **Wilco Host**, free, on your Mac. It runs Pi for your devices and keeps them connected.
- **Wilco**, on the App Store for iPhone and iPad.

## Contents

1. [What you need](#1-what-you-need)
2. [Install Wilco Host on your Mac](#2-install-wilco-host-on-your-mac)
3. [Set up Wilco Host](#3-set-up-wilco-host)
4. [Pair your iPhone or iPad](#4-pair-your-iphone-or-ipad)
5. [Sessions](#5-sessions)
6. [Approvals](#6-approvals)
7. [Notifications, Live Activities, widgets and Siri](#7-notifications-live-activities-widgets-and-siri)
8. [More in a session](#8-more-in-a-session)
9. [Terminal sessions](#9-terminal-sessions)
10. [Wilco Host day to day](#10-wilco-host-day-to-day)
11. [Several Macs, several devices](#11-several-macs-several-devices)
12. [Updates](#12-updates)
13. [Privacy and security](#13-privacy-and-security)
14. [Troubleshooting](#14-troubleshooting)
15. [Uninstall](#15-uninstall)

## 1. What you need

- A Mac with macOS 26 (Tahoe) or later.
- [Pi](https://github.com/earendil-works/pi) installed on that Mac and working in Terminal (`pi` starts it), with at least one model set up.
- An iPhone or iPad with iOS or iPadOS 26 or later.
- To reach the Mac away from home: the Mac stays on, awake and online. Nothing else: no port forwarding, no VPN, no account.

Want to look around first? Open Wilco on your iPhone or iPad and tap **Try the demo**. The demo Mac runs inside the app, and nothing you do leaves your device.

## 2. Install Wilco Host on your Mac

**From the download.** Download `Wilco-Host-<version>.dmg` from the [latest release](https://github.com/MatrixReligio/wilco-releases/releases/latest), open it and drag **Wilco Host** to Applications. Wilco Host is signed and notarized by Apple.

**With Homebrew.**

```sh
brew tap matrixreligio/tap
brew trust matrixreligio/tap   # Homebrew 7 and later
brew install --cask wilco-host
```

Then open Wilco Host from Applications.

## 3. Set up Wilco Host

The first time it opens, Wilco Host walks you through five steps. You can go back or skip at any point, and do the rest later from its window.

1. **Welcome.**
2. **Run in the background.** Click **Start Wilco Host**. A small background Host now runs whenever you are logged in, even with the window closed, so your devices can reach Pi while the Mac is on. If macOS says the item needs your permission, click **Open Login Items** and allow **Wilco Host** in System Settings.
3. **Pi.** Wilco Host looks for Pi on your Mac and shows the version it found. If it says **Pi wasn't found**, install Pi, make sure `pi` starts in Terminal, and click **Check Again**. (You can also finish setup: Wilco Host keeps looking by itself.)
4. **Share a folder.** Click **Share a Folder…** and choose a project. Pi can only work in, read and change folders you share. Start with one; you can add more later.
5. **Pair your iPhone or iPad.** Click **Pair a Device…** and continue with the next section.

Wilco Host then lives in the menu bar. Click its icon for running sessions, your devices, **Pair a Device…** and **Open Wilco Host**.

## 4. Pair your iPhone or iPad

1. On the Mac: **Pair a Device…** (in the menu bar, or the QR button at the top of the Wilco Host window). A QR code appears. A code works once and for 10 minutes; click **New Code** for another.
2. On your iPhone or iPad: install **Wilco: Pi Remote** from the App Store, open it and tap **Pair a Mac**. Allow the camera and scan the code. (No camera? Click **Copy Link** on the Mac, send the link to your device, and paste it under **Or paste the pairing link**.)
3. Allow Wilco to find devices on your local network if iOS asks. Wilco uses it to talk to your Mac directly when you are at home.
4. Your device shows a six-digit code, and your Mac asks whether this device may pair. **Approve only if both show the same code.**

That's it. Your device now reaches the Mac on your local network when it can, and through the Wilco relay when you are away. You don't have to do anything to switch; the indicator at the top of Home shows **Local network** or **Via relay**.

## 5. Sessions

### Home

Home lists your sessions like a departures board: what **Needs you** comes first, then what is **Running**, then finished runs **To review**, then **Recent**. Each card shows the folder, Pi's current step, and how full the model's context is. With more than one Mac paired, the sessions of every Mac are listed together.

### Start a session

Tap **New session** and choose a folder shared from your Mac. Type what you want Pi to do and tap **Send**. A folder that is a git repository is also offered under **In a new git worktree**: Pi then works on its own branch in its own folder (see [Workspace tools](workspace-tools.md#a-new-session-in-its-own-git-worktree)).

Sessions you started earlier, on your phone or on the Mac, are on Home too. Open one to continue it; Wilco Host starts Pi for it again when needed.

### While Pi works

The session shows Pi's reply as it writes, its thinking (tap to expand), and every tool call as a step: files read, edits as diffs, commands with their output. Tap a step for its details.

While Pi is working, the message box offers three ways to send:

- **Steer:** Pi reads your message at its next step, without stopping.
- **Follow up:** your message waits until Pi finishes, then starts the next turn.
- **Stop:** ends the current run. The session stays; you can send again.

Queued messages show above the message box; **Clear queue** drops them.

### Model and thinking

Tap the model name in the bar under the session's title to choose another model, or how hard Pi thinks (from **Off** and **Minimal** to **Extra high**, as your model offers). The models are the ones Pi on your Mac knows, with your own keys.

### Typing less

- **Slash commands:** type `/` at the start of a message for Pi's prompt templates, skills and extensions' commands.
- **Photos:** tap **+** to attach up to four images, when the model reads images.
- **Dictation:** tap the microphone and speak. Speech is recognized on your device.
- **Shell commands:** start a message with `!` to run a command on the Mac. It is off until you allow it for the device on the Mac (see [Workspace tools](workspace-tools.md#run-a-command-on-the-mac)).

## 6. Approvals

Every session Wilco Host starts runs with **wilco-guard**. Before Pi runs a risky command or writes outside its folder, it stops and asks. The question appears in the session (and as a notification); Pi waits, with no time limit, until you tap **Approve** or **Deny**.

Choose what is asked about in the app, in **Settings → your Mac → Ask for Approval**, or on the Mac, in Wilco Host's **Pi** section.

- **Dangerous commands** (on by default): commands such as `rm -r`, `sudo` or `git push --force`.
- **Every command:** any shell command Pi runs.
- **Changes outside the folder** (on by default): writing or editing files outside the session's folder.

The rules are kept on the Mac and apply to its running sessions at once. Pi's other questions (choices, confirmations, text input from extensions) appear in the session the same way.

## 7. Notifications, Live Activities, widgets and Siri

Turn notifications on in **Settings → Notifications** and choose what you hear about: **Questions and approvals**, **Finished runs** and **Errors**. Notifications are end-to-end encrypted: only your device can read them.

- **From the Lock Screen:** a question about a short command shows **Approve** and **Deny** on the notification itself, after Face ID, Touch ID or your passcode. Longer ones open in the app so you always read exactly what you approve.
- **Live Activities:** a run you start from the app appears on the Lock Screen and in the Dynamic Island, with its status, steps and time. Turn them off in **Settings → Notifications**.
- **Widget:** add **Pi Sessions** to your Home Screen to see what needs you and what is running.
- **Siri and Shortcuts:** say "Ask Pi with Wilco" to start a session in a folder, or "What is Pi doing in Wilco" for a summary. Both work once your device is unlocked.

More in [Approvals and notifications](notifications-and-approvals.md).

## 8. More in a session

The **⋯** menu at the top of a session, and the bar under its title, hold the rest:

- **Changes:** every file Pi edited or wrote in this session, with lines added and removed; each opens as a diff.
- **Branches:** every message you sent, as a tree. Tap one to start a new session from just before it, or **Duplicate** the whole session.
- **Files:** browse the session's folder on your Mac, read-only.
- **Details:** folder, model, messages, tokens, cost and context. From here: **Rename**, **Compact** (summarize the session to free context) and **Export as HTML**.

The chart button on Home shows **Usage**: tokens and cost for the last 7, 30 or 90 days, by model and by folder.

Details: [Working in a session](session-tools.md) · [Workspace tools](workspace-tools.md).

## 9. Terminal sessions

Keep starting Pi in Terminal as you always do, and pick the same session up on your phone. In Wilco Host, open **Pi** and click **Install** under **Terminal sessions** once. Sessions running in a shared folder in Terminal then appear on Home marked **In the Mac terminal**. See [Terminal sessions](terminal-sessions.md).

## 10. Wilco Host day to day

Open the Wilco Host window from the menu bar (**Open Wilco Host**). Its sidebar:

| Section | What it is for |
| --- | --- |
| **Overview** | Whether Wilco Host is ready for your devices; active sessions, devices online, shared folders, connections; recent sessions. |
| **Sessions** | Every session on this Mac; **Stop Session** ends a running one (it can be continued later). |
| **Devices** | Paired iPhones and iPads, when each was last seen. **Allow running shell commands** per device; **Remove Device** to unpair. |
| **Folders** | The folders Pi may work in. **Share a Folder…**, **Stop Sharing…**. |
| **Connection** | **Allow devices to connect** (off disconnects every device until you turn it on again), **Reach this Mac from anywhere** (the relay), and an optional **Relay address** of a relay you run yourself. |
| **Pi** | The Pi version found, **Terminal sessions**, and **Ask for approval** (the same rules as in the app). |
| **Log** | Connections, pairing and sessions, while Wilco Host is open. |
| **Settings** | **Run in background**, and **Updates**: automatic checks, the **Stable** or **Beta** channel, **Open in the menu bar at login**, **Check for Updates…**. |

Quitting from the menu bar closes only the window and menu: the background Host keeps running for your devices (**Quit (Host Keeps Running)**). To stop it, turn off **Run in background** in Settings.

## 11. Several Macs, several devices

- **Another Mac:** install Wilco Host there and pair it the same way (**Settings → Pair a Mac…** in the app). Home lists the sessions of every Mac.
- **Another iPhone or iPad:** pair it from the Mac with a new code. Each device has its own keys.
- **Removing:** in the app, **Settings → your Mac → Remove This Mac**. On the Mac, **Devices → Remove Device** disconnects that device at once.

## 12. Updates

- **Wilco Host** updates itself: it checks while it is open, downloads in the background and installs when no session is running. **Settings → Updates** has **Check for Updates…**, automatic checks, and the **Stable** or **Beta** channel. Homebrew users can also run `brew upgrade --cask wilco-host`.
- **Wilco** updates from the App Store. When the app and Wilco Host are too far apart, the app says which one to update.

## 13. Privacy and security

- No account, no tracking, no analytics. The app collects no data.
- Your code, keys and Pi sessions stay on your Mac. The app loads a session from your Mac when you open it and keeps no copy, so reading one needs a connection to the Mac.
- Every connection is end-to-end encrypted (Noise protocol) between your device and your Mac. The relay only passes encrypted bytes it cannot read, and stores nothing; you can [run your own](self-hosting-relay.md).
- Pi can only work in folders you share, and wilco-guard asks before risky commands.

Details: [Security model](security-model.md) · [Privacy policy](https://matrixreligio.com/en/products/wilco/privacy/).

## 14. Troubleshooting

| What you see | What to do |
| --- | --- |
| **Can't reach your Mac** | Check that the Mac is on and awake, online, and that Wilco Host runs (its menu bar icon). In Wilco Host, **Connection → Allow devices to connect** must be on. |
| The device connects at home but not away | **Connection → Reach this Mac from anywhere** must be on. If you set your own **Relay address**, check that relay. |
| **Pairing didn't finish** or **This code has expired** | Make a **New Code** on the Mac and scan it again. Approve on the Mac only if the codes match. |
| **Pi wasn't found** | Install Pi so that `pi` starts in Terminal. Wilco Host finds it by itself; its **Pi** section then shows the version. |
| **Pi couldn't start on your Mac** | Run `pi` in Terminal in that folder: it shows what is wrong (often a model or key). |
| **Another app is using Wilco Host's network port** | Quit the other app; Wilco Host starts by itself. |
| **Wilco Host is already running in Terminal** | Stop `wilcod run` in Terminal; the background Host then starts. |
| **Allow Wilco Host in Login Items** | System Settings → General → Login Items & Extensions: allow Wilco Host. |
| No notifications | iOS Settings → Notifications → Wilco must be allowed, and the kinds you want on in Wilco's **Settings → Notifications**. |
| **Wilco Host on your Mac is newer than this app** | Update Wilco from the App Store. |
| Something else | **Log** in Wilco Host shows what happened. Report it at [support](https://matrixreligio.com/en/products/wilco/). |

## 15. Uninstall

- **iPhone or iPad:** delete the app. On the Mac, remove the device in **Devices**.
- **Mac, Homebrew:** `brew uninstall --cask wilco-host` (add `--zap` to also delete its settings and pairings).
- **Mac, by hand:** turn off **Run in background** in Wilco Host's Settings, quit it, and move **Wilco Host** from Applications to the Trash. Its data is in `~/Library/Application Support/Wilco`.

Your Pi, its settings and its sessions are not touched either way.
