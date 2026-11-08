import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { exists, readJson, readText, writeJson, sha256 } from "../util/fs";

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  source: string;
}

export interface SkillVerification {
  total: number;
  added: string[];
  changed: string[];
  removed: string[];
  ok: boolean;
  lockPath: string;
}

export function skillLockPath(cwd: string, lockPath?: string): string {
  return lockPath ?? path.join(cwd, ".xminal", "skills.lock.json");
}

export function hashSkills(skills: SkillInfo[]): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const skill of skills) {
    hashes[skill.name] = sha256(readText(skill.path));
  }
  return hashes;
}

export function hashProjectSkills(cwd: string): Record<string, string> {
  const projectSkills = new SkillRegistry(cwd).list().filter((skill) => skill.source === "project");
  return hashSkills(projectSkills);
}

export function verifySkills(cwd: string, lockPath?: string): SkillVerification {
  const file = skillLockPath(cwd, lockPath);
  const current = hashProjectSkills(cwd);
  const lock = readJson<Record<string, string>>(file, {});
  const added = Object.keys(current).filter((name) => !(name in lock));
  const removed = Object.keys(lock).filter((name) => !(name in current));
  const changed = Object.keys(current).filter((name) => lock[name] && lock[name] !== current[name]);
  return {
    total: Object.keys(current).length,
    added,
    changed,
    removed,
    ok: added.length + changed.length + removed.length === 0,
    lockPath: file,
  };
}

export function writeSkillsLock(cwd: string, lockPath?: string): number {
  const hashes = hashProjectSkills(cwd);
  writeJson(skillLockPath(cwd, lockPath), hashes);
  return Object.keys(hashes).length;
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
