// Pi extension used only by the "extension-ui" fixture scenario.
// It exercises every extension UI method that RPC mode forwards to the client.
// Types are kept loose on purpose so this file has no dependency on Pi's packages.

export default function uiProbe(pi: any) {
  pi.registerCommand("ui-probe", {
    description: "Exercise every RPC extension UI method",
    handler: async (_args: string, ctx: any) => {
      const choice = await ctx.ui.select("Allow dangerous command?", ["Allow", "Block"]);
      const confirmed = await ctx.ui.confirm("Proceed?", "The probe will continue.");
      const name = await ctx.ui.input("Name:", "type something...");
      const text = await ctx.ui.editor("Edit:", "prefilled text");
      ctx.ui.notify(`probe: ${choice}/${confirmed}/${name}/${text ?? "cancelled"}`, "info");
      ctx.ui.setStatus("ui-probe", "probing");
      ctx.ui.setWidget("ui-probe", ["line 1", "line 2"]);
      ctx.ui.setTitle("wilco probe");
      ctx.ui.setEditorText("prefill from probe");
    },
  });
}
