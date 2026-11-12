import type { Tool } from "./types";
import { errorResult, stringArg, textResult } from "./types";
import { truncateText } from "../util/fs";
import path from "node:path";
import { buildManifest, readSkillFile, SKILL_BYTE_LIMIT } from "../skills/manifest";

const skillTool: Tool = {
  name: "skill",
  description:
    "List or load agent skills (SKILL.md). Actions: list, load (name), outline (name), read (name + file). " +
    "A skill holds the procedure; heavy material lives in references/ and is read one file at a time. " +
    "Load a skill before doing work it covers.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["list", "load", "outline", "read"], description: "Action." },
      name: { type: "string", description: "Skill name." },
      file: { type: "string", description: "File inside the skill folder (read), e.g. references/notes.md" },
    },
    required: ["action"],
  },
  async run(args, context) {
    const action = stringArg(args, "action", "list");
    if (action === "load" || action === "outline" || action === "read") {
      const name = stringArg(args, "name");
      if (!name) return errorResult("name is required for load.");
      const skill = context.skills.get(name);
      if (!skill) return errorResult(`Skill not found: ${name}. Use action=list to see available skills.`);
      const dir = path.dirname(skill.path);
      if (action === "outline") {
        const manifest = buildManifest(dir, skill.name);
        const lines = [
          `# Skill: ${manifest.name} (${skill.source})`,
          manifest.description,
          manifest.whenToUse ? `use when: ${manifest.whenToUse}` : "",
          manifest.sections.length ? `sections: ${manifest.sections.join(" · ")}` : "",
          manifest.references.length ? `references: ${manifest.references.join(", ")}` : "",
          manifest.scripts.length ? `scripts: ${manifest.scripts.join(", ")}` : "",
          manifest.templates.length ? `templates: ${manifest.templates.join(", ")}` : "",
          manifest.truncated ? "(SKILL.md is large — read it in parts)" : "",
        ].filter(Boolean);
        return textResult(lines.join("\n"));
      }
      if (action === "read") {
        const file = stringArg(args, "file");
        if (!file) return errorResult("file is required for read.");
        const result = readSkillFile(dir, file);
        if ("error" in result) return errorResult(result.error);
        return textResult(`# ${skill.name}/${file}\n\n${truncateText(result.content, 20_000)}`);
      }
      const manifest = buildManifest(dir, skill.name);
      const body = truncateText(context.skills.load(name), SKILL_BYTE_LIMIT);
      const extra = manifest.references.length
        ? `\n\nAlso in this skill (read with action=read): ${manifest.references.join(", ")}`
        : "";
      return textResult(`# Skill: ${skill.name} (${skill.source})\n\n${body}${extra}`);
    }
    const skills = context.skills.list();
    if (skills.length === 0) return textResult("(no skills installed)");
    return textResult(
      skills
        .map((skill) => {
          const hint = skill.whenToUse ? ` — use when: ${skill.whenToUse.slice(0, 160)}` : "";
          return `${skill.name} [${skill.source}] — ${skill.description.slice(0, 200)}${hint}`;
        })
        .join("\n"),
    );
  },
};

export const skillTools: Tool[] = [skillTool];
