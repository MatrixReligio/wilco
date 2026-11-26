<p align="right"><strong>English</strong> · <a href="../zh-CN/workspace-tools.md">简体中文</a></p>

# Your Mac's folders from your phone

Besides the session itself, Wilco lets you look at the folder Pi works in, see what your sessions cost, run a command on the Mac, share a session as a page, give a new session a git worktree of its own, and dictate your messages. Each needs a Wilco Host that offers it; an older Host simply doesn't show the option.

## Files

**⋯ → Files** on the session page opens the session's folder on your Mac. Folders open, and a file shows its text (Markdown and code included) or, for an image, the picture.

- It is read-only: nothing on the Mac changes.
- Only what is inside the session's folder can be opened. A link that leads out of it is not followed, and `.git` is not shown.
- A text file shows at most its first 2 MB.

## Usage

The chart button at the top of Home shows the Mac's token use and cost for the last 7, 30 or 90 days, by day, with totals by model and by folder. It is worked out on the Mac from Pi's session files, including sessions started in the Mac terminal, so it matches what Pi itself recorded.

## Run a command on the Mac

Start a message with `!` to run the rest as a shell command in the session's folder, as Pi's own `!` does in the terminal. The output appears in the session as it is written, and **Stop** ends the command.

- `!` keeps the command and its output in the session for Pi to read next time; `!!` runs it without telling Pi.
- Your Mac decides which devices may do this. In Wilco Host, open **Devices** and turn on **Allow running shell commands** for the device. It is off for every device until you turn it on, and a device without it sees why it cannot.
- Commands run as your Mac account, with your permissions, so only allow devices you trust.

## Export a session

**⋯ → Details → Export as HTML** asks Pi on your Mac to make a page of the whole session. When it is ready, tap the page's name to save or send it like any other file. The page is made on the Mac and only the finished page is sent to your phone; nothing is kept on the Mac afterwards.

## A new session in its own git worktree

When a folder is a git repository (the folder has its own `.git`), the new-session menu also lists it under **In a new git worktree**. Pi then works on a branch and in a folder of its own, so several sessions can change the same project without getting in each other's way.

- The worktree is made at `.wilco/worktrees/<id>` inside the repository, on branch `wilco/<id>`, from what is checked out now. `.wilco/` is added to the repository's local exclude file, so it never shows up as a change.
- Home and the session's details show the branch.
- Wilco never deletes a worktree or its branch: merge or remove them with git when you are done (`git worktree remove`, `git branch -d`).
- A repository with no commit yet cannot have a worktree; Wilco says git could not make one.

## Dictation

Tap the microphone beside the message box and speak. The words appear in the draft as they are recognized, after anything you typed, and settle as recognition becomes sure. Tap the microphone again to stop; typing also stops it.

- Speech is turned into text on your iPhone or iPad. It is never sent anywhere to be recognized.
- Nothing is sent to Pi until you tap **Send**, so you can fix the text first.
- The first time, iOS asks for the microphone and speech recognition, and may download your language's speech model.
