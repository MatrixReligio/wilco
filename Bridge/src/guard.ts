// wilco-guard: asks the owner, through Pi's extension UI, before risky tool calls.
// Wilco Host loads it into every session it starts (pi -e) and points WILCO_GUARD_POLICY at the
// policy file; the policy is read again for every tool call, so changes apply at once.
import os from "node:os";
import path from "node:path";
import { assess, loadPolicy } from "./rules.ts";

// Only the parts of Pi's ExtensionAPI this extension uses, so it has no dependencies.
type ToolCallEvent = { toolName: string; toolCallId: string; input: unknown };
type GuardContext = { cwd: string; hasUI: boolean; ui: { confirm(title: string, message: string): Promise<boolean> } };
type Block = { block: true; reason: string };
type GuardAPI = { on(event: "tool_call", handler: (event: ToolCallEvent, ctx: GuardContext) => Promise<Block | undefined>): void };

export default function wilcoGuard(pi: GuardAPI): void {
  // Read once and removed, so the commands Pi runs do not inherit where the policy lives. The
  // policy's folder (with wilco-guard's code) is protected: touching it is always asked about.
  // WILCO_GUARD_PROTECT names more folders to protect, one per line (the Host's state folder).
  const policyFile = process.env.WILCO_GUARD_POLICY;
  const protect = process.env.WILCO_GUARD_PROTECT;
  delete process.env.WILCO_GUARD_POLICY;
  delete process.env.WILCO_GUARD_PROTECT;
  const protectedPaths = [
    ...(policyFile ? [path.dirname(path.resolve(policyFile))] : []),
    ...(protect ?? "").split("\n").filter((line) => line.trim() !== "").map((line) => path.resolve(line)),
  ];
  pi.on("tool_call", async (event, ctx) => {
    const result = assess(event.toolName, event.input, ctx.cwd, loadPolicy(policyFile), os.homedir(), protectedPaths);
    if (!result.ask) return undefined;
    const why = result.label ?? (result.reason === "outsideWorkspace" ? "outside the workspace" : "every command needs approval");
    if (!ctx.hasUI) return { block: true, reason: `Blocked by wilco-guard: there is no one to ask (${why})` };
    // No timeout: the question waits until someone answers it in Wilco.
    const approved = await ctx.ui.confirm(result.title, result.message);
    return approved ? undefined : { block: true, reason: `Blocked in Wilco: the owner declined (${why})` };
  });
}
