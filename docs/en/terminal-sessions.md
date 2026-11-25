<p align="right"><strong>English</strong> · <a href="../zh-CN/terminal-sessions.md">简体中文</a></p>

# Terminal sessions on your phone

Start Pi in Terminal on your Mac as you always do, and pick the same session up on your iPhone or iPad: follow the run live, answer its questions, send the next prompt from the couch. This works through [wilco-bridge](../../Bridge/README.md#wilco-bridge), a small Pi extension.

## Set it up

1. In Wilco Host's settings, open **Pi** and click **Install** under **Terminal sessions**. (Or run `pi install npm:@matrixreligio/wilco`, which also installs wilco-guard.)
2. Make sure the folder you work in is shared in Wilco Host.
3. Start Pi in Terminal in that folder. Sessions you already had open load the extension the next time you start them.

## On your phone

The session appears on Home with **In the Mac terminal**, and opens like any other. Everything you send goes to the Pi in your terminal, and the terminal shows it too.

From the phone you can send prompts, steer a run or queue a follow-up, stop a run, change the model and thinking level, rename or compact the session, and answer wilco-guard's questions. Controls the terminal cannot serve from outside, such as clearing queued messages, are shown as unavailable while the session is open in the terminal. A question another extension asks in the terminal can only be answered there.

## Moving between the Mac and the phone

One Pi runs a session at a time.

- **Opening in Terminal a session Wilco Host is running:** if Pi is idle there, the terminal takes the session at once. If it is in the middle of a run, the terminal waits and shows a note; when the run ends it reloads the session, with everything the run did, and you can type again.
- **Closing the terminal:** the session stays on your phone. The next time you open it, Wilco Host continues it with its own Pi.

## Privacy and safety

wilco-bridge talks only to Wilco Host on the same Mac, through a socket that only your user can open. It never connects anywhere else, and only sessions in folders you share are visible to your devices. When Wilco Host is not running, the terminal works as usual.

wilco-guard asks before risky commands only if it is loaded in that Pi: Wilco Host's **Install** adds wilco-bridge alone, so install the npm package if you want the terminal's commands checked too. See [Approvals and notifications](notifications-and-approvals.md).
