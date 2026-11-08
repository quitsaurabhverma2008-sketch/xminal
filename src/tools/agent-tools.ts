import type { Tool } from "./types";
import { booleanArg, errorResult, stringArg, textResult } from "./types";

const taskTool: Tool = {
  name: "task",
  description:
    "Spawn a subagent with fresh context to explore, plan, review, or implement a focused task. Use for parallel research or isolated work. Returns the subagent's final report.",
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
    const prompt = stringArg(args, "prompt");
    if (!prompt) return errorResult("prompt is required.");
    if (!context.runSubagent) return errorResult("Subagent support is not available in this context.");
    const type = stringArg(args, "type", "general") as "general" | "explore" | "plan" | "review";
    try {
      const report = await context.runSubagent(prompt, {
        type,
        readOnly: booleanArg(args, "readOnly", false) || type !== "general",
        maxTurns: Number(args.maxTurns ?? 20),
      });
      return textResult(report);
    } catch (error) {
      return errorResult(`Subagent failed: ${(error as Error).message}`);
    }
  },
};

const thinkTool: Tool = {
  name: "think",
  description:
    "Record a short private reasoning note or plan before acting. Does not execute anything and does not change files.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      thought: { type: "string", description: "Reasoning note or plan." },
    },
    required: ["thought"],
  },
  async run(args) {
    return textResult(`Noted: ${stringArg(args, "thought").slice(0, 2000)}`);
  },
};

export const agentTools: Tool[] = [taskTool, thinkTool];
