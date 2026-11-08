"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkpointTools = void 0;
const types_1 = require("./types");
const checkpointTool = {
    name: "checkpoint",
    description: "Manage file checkpoints. Actions: create (label, files), list, restore (id), undo. Checkpoints are also created automatically before edits.",
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
        const action = (0, types_1.stringArg)(args, "action", "list");
        if (action === "create") {
            const label = (0, types_1.stringArg)(args, "label", "manual");
            const files = Array.isArray(args.files)
                ? args.files.map(String)
                : [...context.session.touchedFiles].slice(-50);
            const id = context.session.createCheckpoint(label, files);
            return (0, types_1.textResult)(`Created checkpoint ${id} (${files.length} file(s)).`);
        }
        if (action === "restore") {
            const id = (0, types_1.stringArg)(args, "id");
            const restored = context.session.restoreCheckpoint(id);
            return (0, types_1.textResult)(`Restored checkpoint ${id} (${restored} file(s)).`);
        }
        if (action === "undo") {
            const undone = context.session.undoLast();
            if (!undone)
                return (0, types_1.textResult)("No checkpoints to undo.");
            return (0, types_1.textResult)(`Undid checkpoint ${undone.id} (${undone.restored} file(s) restored).`);
        }
        const checkpoints = context.session.listCheckpoints();
        if (checkpoints.length === 0)
            return (0, types_1.textResult)("(no checkpoints)");
        return (0, types_1.textResult)(checkpoints
            .map((checkpoint) => `${checkpoint.id} · ${checkpoint.ts} · ${checkpoint.label} · ${checkpoint.files.length} file(s)`)
            .join("\n"));
    },
};
exports.checkpointTools = [checkpointTool];
//# sourceMappingURL=checkpoint-tool.js.map