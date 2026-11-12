import fs from "node:fs";
import path from "node:path";
import { SKILL_BYTE_LIMIT } from "./manifest";

/**
 * Linting for skill folders.
 *
 * A skill can come from a third party, so the folder has to be checkable
 * before an agent relies on it: the frontmatter has to exist, the name has to
 * be usable, the description has to say when the skill applies, and the files
 * the body points at have to exist.
 */
export type SkillIssueCode =
  | "missing-frontmatter"
  | "name-mismatch"
  | "bad-name-charset"
  | "description-empty"
  | "description-not-use-when"
  | "description-too-long"
  | "frontmatter-too-long"
  | "skill-too-large"
  | "dev-file-in-skill"
  | "missing-reference"
  | "missing-script"
  | "empty-body";

export interface SkillIssue {
  skill: string;
  path: string;
  code: SkillIssueCode;
  severity: "error" | "warn";
  message: string;
}

export interface SkillValidationReport {
  skills: number;
  issues: SkillIssue[];
  ok: boolean;
}

const SKILL_FILE = "SKILL.md";
const NAME_PATTERN = /^[A-Za-z0-9-]+$/;
const DESCRIPTION_MAX = 500;
const FRONTMATTER_MAX = 1024;
const DEV_FILE_PATTERNS = [/^test-.*\.md$/i, /_test\.md$/i, /^CREATION-LOG\.md$/i, /\.log$/i];
const SKIP_DIRS = new Set([".git", "node_modules"]);
const MAX_WALK_DEPTH = 6;

/**
 * Check one skill folder. `skillName` defaults to the folder name.
 */
export function validateSkillDir(dir: string, skillName?: string): SkillIssue[] {
  const issues: SkillIssue[] = [];
  const folderName = path.basename(path.resolve(dir));
  const skill = skillName ?? folderName;
  const skillFile = path.join(dir, SKILL_FILE);

  const add = (code: SkillIssueCode, severity: "error" | "warn", message: string, file: string = skillFile): void => {
    issues.push({ skill, path: file, code, severity, message });
  };

  if (!isFile(skillFile)) {
    add("missing-frontmatter", "error", `SKILL.md not found in ${dir}`);
    return issues;
  }

  const content = fs.readFileSync(skillFile, "utf8");
  const bytes = Buffer.byteLength(content, "utf8");
  const front = parseFrontmatter(content);

  if (!front.present) {
    add("missing-frontmatter", "error", "SKILL.md has no --- frontmatter block");
  } else if (front.block.length > FRONTMATTER_MAX) {
    add(
      "frontmatter-too-long",
      "error",
      `frontmatter is ${front.block.length} characters, the limit is ${FRONTMATTER_MAX}`,
    );
  }

  const names = new Set<string>([folderName]);
  if (front.fields.name) names.add(front.fields.name);
  for (const name of names) {
    if (!NAME_PATTERN.test(name)) {
      add("bad-name-charset", "error", `name "${name}" must match /^[A-Za-z0-9-]+$/`);
    }
  }
  if (front.fields.name && front.fields.name !== folderName) {
    add(
      "name-mismatch",
      "warn",
      `frontmatter name "${front.fields.name}" does not match the folder name "${folderName}"`,
    );
  }

  const description = front.fields.description ?? "";
  if (!description) {
    add("description-empty", "error", "the frontmatter has no description");
  } else {
    if (!/^use\s+when\b/i.test(description)) {
      add("description-not-use-when", "warn", 'the description should start with "Use when"');
    }
    if (description.length > DESCRIPTION_MAX) {
      add(
        "description-too-long",
        "warn",
        `the description is ${description.length} characters, the limit is ${DESCRIPTION_MAX}`,
      );
    }
  }

  if (bytes >= SKILL_BYTE_LIMIT) {
    add("skill-too-large", "warn", `SKILL.md is ${bytes} bytes, the limit is ${SKILL_BYTE_LIMIT}`);
  }

  for (const devFile of findDevFiles(dir)) {
    add(
      "dev-file-in-skill",
      "error",
      `${path.basename(devFile)} is a development file and does not belong in a skill folder`,
      devFile,
    );
  }

  const body = front.body;
  for (const missing of findMissingReferences(dir, body, "references")) {
    add("missing-reference", "warn", `the body references ${missing.relative}, which does not exist`, missing.path);
  }
  for (const missing of findMissingReferences(dir, body, "scripts")) {
    add("missing-script", "warn", `the body references ${missing.relative}, which does not exist`, missing.path);
  }

  if (!body.trim()) {
    add("empty-body", "warn", "SKILL.md has no content besides the frontmatter");
  }

  return issues;
}

/**
 * Validate every skill folder inside the given roots.
 *
 * A root holds skill folders; a folder is validated when it contains a
 * SKILL.md. Relative roots are resolved against `cwd`.
 */
export function validateAll(cwd: string, roots: string[]): SkillValidationReport {
  const issues: SkillIssue[] = [];
  let skills = 0;

  for (const root of roots) {
    const rootDir = path.isAbsolute(root) ? root : path.resolve(cwd, root);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(rootDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(rootDir, entry.name);
      if (!isFile(path.join(skillDir, SKILL_FILE))) continue;
      skills += 1;
      issues.push(...validateSkillDir(skillDir, entry.name));
    }
  }

  return { skills, issues, ok: issues.every((issue) => issue.severity !== "error") };
}

interface Frontmatter {
  present: boolean;
  /** the frontmatter block including its --- delimiters */
  block: string;
  fields: Record<string, string>;
  /** everything after the frontmatter */
  body: string;
}

function parseFrontmatter(content: string): Frontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (!match) {
    return { present: false, block: "", fields: {}, body: content };
  }
  const raw = match[1];
  const fields: Record<string, string> = {};
  let currentKey = "";
  for (const line of raw.split(/\r?\n/)) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      currentKey = keyMatch[1].toLowerCase();
      fields[currentKey] = unquote(keyMatch[2].trim());
    } else if (currentKey && line.trim()) {
      fields[currentKey] = `${fields[currentKey] ?? ""} ${line.trim()}`.trim();
    }
  }
  return {
    present: true,
    block: match[0].trimEnd(),
    fields,
    body: content.slice(match[0].length),
  };
}

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

/** Development leftovers that should never ship inside a skill folder. */
function findDevFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string, depth: number): void => {
    if (depth > MAX_WALK_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(current, entry.name), depth + 1);
        continue;
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      const base = entry.name;
      if (DEV_FILE_PATTERNS.some((pattern) => pattern.test(base))) {
        found.push(path.join(current, base));
      }
    }
  };
  walk(dir, 0);
  return found.sort();
}

/** Files the body points at inside `sub` that are not on disk. */
function findMissingReferences(dir: string, body: string, sub: "references" | "scripts"): Array<{ relative: string; path: string }> {
  const pattern = new RegExp(`\\b${sub}\\/([A-Za-z0-9._\\-/]*[A-Za-z0-9_-])`, "g");
  const missing: Array<{ relative: string; path: string }> = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(pattern)) {
    const relative = match[0];
    if (seen.has(relative)) continue;
    seen.add(relative);
    const target = path.resolve(dir, relative);
    if (target !== path.resolve(dir) && !target.startsWith(path.resolve(dir) + path.sep)) continue;
    if (!exists(target)) missing.push({ relative, path: target });
  }
  return missing;
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function exists(file: string): boolean {
  try {
    fs.accessSync(file);
    return true;
  } catch {
    return false;
  }
}
