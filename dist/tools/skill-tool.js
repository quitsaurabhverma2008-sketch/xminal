"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.skillTools = void 0;
const types_1 = require("./types");
const fs_1 = require("../util/fs");
const skillTool = {
    name: "skill",
    description: "List or load agent skills (SKILL.md). Actions: list, load (name). Skills contain specialized procedures for tasks. Load a skill before doing work it covers.",
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
        const action = (0, types_1.stringArg)(args, "action", "list");
        if (action === "load") {
            const name = (0, types_1.stringArg)(args, "name");
            if (!name)
                return (0, types_1.errorResult)("name is required for load.");
            const skill = context.skills.get(name);
            if (!skill)
                return (0, types_1.errorResult)(`Skill not found: ${name}. Use action=list to see available skills.`);
            return (0, types_1.textResult)(`# Skill: ${skill.name} (${skill.source})\n\n${(0, fs_1.truncateText)(context.skills.load(name), 40_000)}`);
        }
        const skills = context.skills.list();
        if (skills.length === 0)
            return (0, types_1.textResult)("(no skills installed)");
        return (0, types_1.textResult)(skills.map((skill) => `${skill.name} [${skill.source}] — ${skill.description.slice(0, 200)}`).join("\n"));
    },
};
exports.skillTools = [skillTool];
//# sourceMappingURL=skill-tool.js.map