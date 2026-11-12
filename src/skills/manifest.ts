import fs from "node:fs";
import path from "node:path";
import { parseSkill } from "./loader";

/**
 * Progressive disclosure for a skill folder.
 *
 * A skill folder is:
 *
 *   <skill>/SKILL.md        the entry point (what the agent reads first)
 *   <skill>/references/     heavy material, read only when the skill asks for it
 *   <skill>/scripts/        executables the skill runs
 *   <skill>/templates/      files the skill copies or fills in
 *
 * The manifest is the cheap summary: the description, the headings of SKILL.md
 * and the list of the files that live next to it. The agent learns what else
 * exists without paying for the 40 000 characters of SKILL.md.
 */
export interface SkillManifest {
  name: string;
  description: string;
  whenToUse?: string;
  triggers: string[];
  /** size of SKILL.md in bytes */
  bytes: number;
  /** the "## Heading" sections of SKILL.md */
  sections: string[];
  /** files under references/, relative to the skill folder */
  references: string[];
  /** executables under scripts/, relative to the skill folder */
  scripts: string[];
  /** templates under templates/ */
  templates: string[];
  /** true when SKILL.md reached the size cap and may be truncated */
  truncated: boolean;
}

/** SKILL.md at or above this size is considered too big to read in one go. */
export const SKILL_BYTE_LIMIT = 20_000;

const SKILL_FILE = "SKILL.md";

/**
 * Summarize a skill folder without reading its heavy parts.
 */
export function buildManifest(skillDir: string, name: string): SkillManifest {
  const skillFile = path.join(skillDir, SKILL_FILE);
  const content = readSafe(skillFile);
  const parsed = parseSkill(content, name || path.basename(skillDir));
  const bytes = Buffer.byteLength(content, "utf8");
  return {
    name: name || parsed.name,
    description: parsed.description,
    whenToUse: parsed.whenToUse,
    triggers: parsed.triggers,
    bytes,
    sections: extractSections(content),
    references: listSubFiles(skillDir, "references"),
    scripts: listSubFiles(skillDir, "scripts"),
    templates: listSubFiles(skillDir, "templates"),
    truncated: bytes >= SKILL_BYTE_LIMIT,
  };
}

/**
 * Read a file that belongs to a skill folder.
 *
 * The path is resolved first and refused when it escapes the skill folder, so
 * a model cannot walk out of the skill with `../../etc/passwd`.
 */
export function readSkillFile(skillDir: string, relative: string): { content: string } | { error: string } {
  const base = path.resolve(skillDir);
  const target = path.resolve(base, relative);
  if (!isInside(base, target)) return { error: "path outside the skill folder" };
  try {
    // a symlink inside the skill folder must not point out of it either
    const realBase = fs.realpathSync(base);
    const realTarget = fs.realpathSync(target);
    if (!isInside(realBase, realTarget)) return { error: "path outside the skill folder" };
  } catch {
    // the file may simply not exist; the read below says so
  }
  try {
    return { content: fs.readFileSync(target, "utf8") };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "cannot read file" };
  }
}

/** True when `target` is `base` itself or lives under it. */
function isInside(base: string, target: string): boolean {
  return target === base || target.startsWith(base + path.sep);
}

/** The "## Heading" titles of SKILL.md, in order, fenced code excluded. */
function extractSections(content: string): string[] {
  const body = stripFrontmatter(content);
  const sections: string[] = [];
  let fence = "";
  for (const line of body.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (marker === fence) fence = "";
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^##[ \t]+(.+?)[ \t]*$/);
    if (heading) sections.push(heading[1].replace(/\s+#+\s*$/, "").trim());
  }
  return sections;
}

/** The files directly inside a sub folder, as paths relative to the skill folder. */
function listSubFiles(skillDir: string, sub: string): string[] {
  const dir = path.join(skillDir, sub);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    files.push(`${sub}/${entry.name}`);
  }
  return files.sort();
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/);
  return match ? content.slice(match[0].length) : content;
}

function readSafe(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}
