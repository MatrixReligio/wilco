<p align="right"><strong>English</strong> · <a href="../zh-CN/session-tools.md">简体中文</a></p>

# Working in a session

The session page is more than a transcript and a message box. The **⋯** menu at the top and the bar under the title give you the rest.

## Branches: start again from any message

Open **⋯ → Branches** to see every message you sent in the session, as a tree. Where you went back and tried something else, the session branches; the route to where Pi is now is marked.

Tap a message to start a **new session from just before it**. The message becomes your draft, so you can change it and send it again. The session you came from stays exactly as it was, even if Pi is still working in it: the new session runs in a Pi of its own on your Mac.

**Duplicate** (at the top of Branches) copies the whole session into a new one.

An extension on your Mac can stop a fork; Wilco then says so.

## Slash commands

Type `/` at the start of a message to see the commands Pi offers in this session: prompt templates, skills and extensions' commands. Keep typing to narrow the list, and tap one to start your message with it.

## Photos

Tap **+** beside the message box to attach up to four images: from your photo library, the camera, or what you copied. They go with the next message you send, steering or follow-up included.

- Images are only offered when the session's model reads them. Switch to such a model to attach one.
- Each image is turned upright and made smaller before it leaves your phone (at most 2048 pixels on its long side and 1.5 MB), so large photos still go through quickly.

## Changes

Once Pi has edited or written files, the bar under the title shows how many, with the lines added and removed (for example **3 files +42 −7**). Tap it (or **⋯ → Changes**) for the list. Each file opens its edits in order, as diffs.

The list comes from the session's own transcript: changes made outside Pi, or before the session started, are not in it.

## Details, rename and compact

**⋯ → Details** shows the session's folder and model, how many messages and tool calls it has, its tokens (input, output, cache), its cost and how full the model's context is.

- **Rename** gives the session a name of your own; it shows as its title here and on your Mac.
- **Compact** asks Pi to summarize the session so far, which frees room in the model's context. How it went appears in the transcript. It is not available while Pi is working.

In a session that is open in the Mac terminal, the actions the terminal cannot take from outside are shown as unavailable.
