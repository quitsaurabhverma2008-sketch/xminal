import type { Tool } from "./types";
import { stringArg, textResult } from "./types";

const checkpointTool: Tool = {
  name: "checkpoint",
  description:
    "Manage file checkpoints. Actions: create (label, files), list, restore (id), undo. Checkpoints are also created automatically before edits.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["create", "list", "restore", "undo"], description: "Action." },
      label: { type: "string", description: "Checkpoint label (create)." },
      files: { type: "array", items: { type: "string" }, description: "Files to snapshot (create). Defaults to touched files." },
      id: { type: "string", description: "Checkpoint id (restore)." },
    },
    required: ["action"],
  },
  async run(args, context) {
    const action = stringArg(args, "action", "list");
    if (action === "create") {
      const label = stringArg(args, "label", "manual");
      const files = Array.isArray(args.files)
        ? (args.files as unknown[]).map(String)
        : [...context.session.touchedFiles].slice(-50);
      const id = context.session.createCheckpoint(label, files);
      return textResult(`Created checkpoint ${id} (${files.length} file(s)).`);
    }
    if (action === "restore") {
      const id = stringArg(args, "id");
      const restored = context.session.restoreCheckpoint(id);
      return textResult(`Restored checkpoint ${id} (${restored} file(s)).`);
    }
    if (action === "undo") {
      const undone = context.session.undoLast();
      if (!undone) return textResult("No checkpoints to undo.");
      return textResult(`Undid checkpoint ${undone.id} (${undone.restored} file(s) restored).`);
    }
    const checkpoints = context.session.listCheckpoints();
    if (checkpoints.length === 0) return textResult("(no checkpoints)");
    return textResult(
      checkpoints
        .map((checkpoint) => `${checkpoint.id} · ${checkpoint.ts} · ${checkpoint.label} · ${checkpoint.files.length} file(s)`)
        .join("\n"),
    );
  },
};

export const checkpointTools: Tool[] = [checkpointTool];
