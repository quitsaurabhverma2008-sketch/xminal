"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentTools = void 0;
const types_1 = require("./types");
const taskTool = {
    name: "task",
    description: "Spawn a subagent with fresh context to explore, plan, review, or implement a focused task. Use for parallel research or isolated work. Returns the subagent's final report.",
    readOnly: true,
    parameters: {
        type: "object",
        properties: {
            prompt: { type: "string", description: "Detailed task for the subagent." },
            type: {
                type: "string",
                enum: ["general", "explore", "plan", "review"],
                description: "Subagent role. explore/plan/review are read-only.",
            },
            readOnly: { type: "boolean", description: "Force read-only tools." },
            maxTurns: { type: "number", description: "Maximum agent turns (default 20)." },
        },
        required: ["prompt"],
    },
    async run(args, context) {
        const prompt = (0, types_1.stringArg)(args, "prompt");
        if (!prompt)
            return (0, types_1.errorResult)("prompt is required.");
        if (!context.runSubagent)
            return (0, types_1.errorResult)("Subagent support is not available in this context.");
        const type = (0, types_1.stringArg)(args, "type", "general");
        try {
            const report = await context.runSubagent(prompt, {
                type,
                readOnly: (0, types_1.booleanArg)(args, "readOnly", false) || type !== "general",
                maxTurns: Number(args.maxTurns ?? 20),
            });
            return (0, types_1.textResult)(report);
        }
        catch (error) {
            return (0, types_1.errorResult)(`Subagent failed: ${error.message}`);
        }
    },
};
const thinkTool = {
    name: "think",
    description: "Record a short private reasoning note or plan before acting. Does not execute anything and does not change files.",
    readOnly: true,
    parameters: {
        type: "object",
        properties: {
            thought: { type: "string", description: "Reasoning note or plan." },
        },
        required: ["thought"],
    },
    async run(args) {
        return (0, types_1.textResult)(`Noted: ${(0, types_1.stringArg)(args, "thought").slice(0, 2000)}`);
    },
};
exports.agentTools = [taskTool, thinkTool];
//# sourceMappingURL=agent-tools.js.map