import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { exists, readText } from "../util/fs";

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  source: string;
}

export class SkillRegistry {
  private cache: SkillInfo[] | null = null;

  constructor(private readonly cwd: string) {}

  private roots(): Array<{ dir: string; source: string }> {
    return [
      { dir: path.join(this.cwd, ".xminal", "skills"), source: "project" },
      { dir: path.join(this.cwd, ".opencode", "skills"), source: "project" },
      { dir: path.join(this.cwd, ".claude", "skills"), source: "project" },
      { dir: path.join(os.homedir(), ".agents", "skills"), source: "global" },
      { dir: path.join(os.homedir(), ".claude", "skills"), source: "global" },
      { dir: path.join(os.homedir(), ".xminal", "skills"), source: "global" },
    ];
  }

  list(): SkillInfo[] {
    if (this.cache) return this.cache;
    const found = new Map<string, SkillInfo>();
    for (const root of this.roots()) {
      if (!exists(root.dir)) continue;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(root.dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillFile = path.join(root.dir, entry.name, "SKILL.md");
        if (!exists(skillFile)) continue;
        const parsed = parseSkill(readText(skillFile), entry.name);
        if (!found.has(parsed.name)) {
          found.set(parsed.name, { ...parsed, path: skillFile, source: root.source });
        }
      }
    }
    this.cache = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
    return this.cache;
  }

  load(name: string): string {
    const skill = this.get(name);
    if (!skill) throw new Error(`Skill not found: ${name}`);
    return readText(skill.path);
  }

  get(name: string): SkillInfo | undefined {
    return this.list().find((skill) => skill.name === name);
  }

  renderForPrompt(limit = 40): string {
    const skills = this.list().slice(0, limit);
    if (skills.length === 0) return "";
    return skills
      .map((skill) => `- ${skill.name}: ${skill.description.slice(0, 220)}`)
      .join("\n");
  }
}

function parseSkill(content: string, folderName: string): { name: string; description: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return { name: folderName, description: firstNonEmptyLine(content) };
  }
  const frontmatter = match[1];
  const fields: Record<string, string> = {};
  let currentKey = "";
  for (const line of frontmatter.split(/\r?\n/)) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      fields[currentKey] = keyMatch[2].trim();
    } else if (currentKey && line.trim()) {
      fields[currentKey] += " " + line.trim();
    }
  }
  const name = (fields.name || folderName).replace(/^["']|["']$/g, "");
  const description = (fields.description || firstNonEmptyLine(content)).replace(/^["']|["']$/g, "");
  return { name, description };
}

function firstNonEmptyLine(content: string): string {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.replace(/^#+\s*/, "").trim();
    if (trimmed && trimmed !== "---") return trimmed;
  }
  return "";
}
