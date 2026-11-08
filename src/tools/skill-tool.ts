import type { Tool } from "./types";
import { errorResult, stringArg, textResult } from "./types";
import { truncateText } from "../util/fs";

const skillTool: Tool = {
  name: "skill",
  description:
    "List or load agent skills (SKILL.md). Actions: list, load (name). Skills contain specialized procedures for tasks. Load a skill before doing work it covers.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["list", "load"], description: "Action." },
      name: { type: "string", description: "Skill name (load)." },
    },
    required: ["action"],
  },
  async run(args, context) {
    const action = stringArg(args, "action", "list");
    if (action === "load") {
      const name = stringArg(args, "name");
      if (!name) return errorResult("name is required for load.");
      const skill = context.skills.get(name);
      if (!skill) return errorResult(`Skill not found: ${name}. Use action=list to see available skills.`);
      return textResult(`# Skill: ${skill.name} (${skill.source})\n\n${truncateText(context.skills.load(name), 40_000)}`);
    }
    const skills = context.skills.list();
    if (skills.length === 0) return textResult("(no skills installed)");
    return textResult(
      skills.map((skill) => `${skill.name} [${skill.source}] — ${skill.description.slice(0, 200)}`).join("\n"),
    );
  },
};

export const skillTools: Tool[] = [skillTool];
