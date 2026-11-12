/**
 * Feature-scoped spec artifacts on disk.
 *
 * A feature is a directory under the project:
 *
 *   <project>/.xminal/features/current.json          → which feature is active
 *   <project>/.xminal/features/001-user-auth/spec.md  → what it must do
 *   <project>/.xminal/features/001-user-auth/plan.md  → how it will be built
 *   <project>/.xminal/features/001-user-auth/tasks.md → the checklist
 *   <project>/.xminal/features/001-user-auth/clarify.json
 *
 * Everything here is deterministic and offline: no network, no clock except
 * the creation timestamp, no hidden state. The store never throws for a
 * missing feature — a caller that asks for "the current feature" of a project
 * that has none gets `undefined` back and decides what that means.
 */
import fs from "node:fs";
import path from "node:path";

import { PLAN_TEMPLATE, SPEC_TEMPLATE, TASKS_TEMPLATE } from "./templates";

/** Where the artifacts of one feature live. */
export interface FeaturePaths {
  /** the feature directory */
  dir: string;
  /** the specification */
  spec: string;
  /** the implementation plan */
  plan: string;
  /** the task checklist */
  tasks: string;
  /** the clarification log */
  clarify: string;
}

/** The three markdown artifacts that can be read and written. */
export type ArtifactName = "spec" | "plan" | "tasks";

interface CurrentFeature {
  feature_directory: string;
  created: string;
  title: string;
}

/** Generic words that carry no meaning in a feature name. */
const STOP_WORDS = new Set([
  "implement", "for", "the", "api", "and", "of", "to", "a", "an", "in", "on", "with",
]);

/** Pure filler words — dropped in every form of the slug. */
const FILLER_WORDS = new Set([
  "for", "the", "and", "of", "to", "a", "an", "in", "on", "with", "that", "this",
  "from", "by", "at", "as", "into", "but", "or", "is", "are", "be",
]);

/** Leading action verbs and the noun form used in a descriptive slug. */
const ACTION_FORMS: Record<string, string> = {
  implement: "implementation",
  add: "addition",
  build: "build",
  create: "creation",
  support: "support",
  write: "writing",
  make: "making",
  handle: "handling",
};

/** `<project>/.xminal/features` */
export function featuresDir(cwd: string): string {
  return path.join(cwd, ".xminal", "features");
}

/** `<project>/.xminal/features/current.json` */
export function currentFeaturePath(cwd: string): string {
  return path.join(featuresDir(cwd), "current.json");
}

/**
 * A short, readable directory name for a feature title.
 *
 * "Implement OAuth2 for the API" → "oauth2-api-implementation"
 * "Add a user login screen"       → "user-login-screen"
 *
 * The primary rule is the stop-word list: generic words are dropped, the rest
 * is lowercased and joined with hyphens. When that would leave the slug with
 * less than two words, a descriptive noun-phrase form is used instead (the
 * object first, the action last) so the directory still says what the feature
 * is about.
 */
export function shortName(title: string): string {
  const words = tokenize(title);
  if (words.length === 0) return "feature";

  const kept = words.filter((word) => !STOP_WORDS.has(word));
  if (kept.length >= 2) return kept.join("-");

  // Too little survived the stop-word filter — rebuild a descriptive slug.
  const action = words.find((word) => word in ACTION_FORMS);
  const nouns = words.filter((word) => !FILLER_WORDS.has(word) && !(word in ACTION_FORMS));
  const parts = nouns.slice();
  if (action) parts.push(ACTION_FORMS[action]);
  if (parts.length === 0) return words.join("-");
  return parts.join("-");
}

/**
 * Create (or re-select) a feature directory.
 *
 * Feature directories are numbered sequentially (`001-`, `002-`, …). Asking for
 * the same title twice is idempotent: the existing directory is returned with
 * `created: false` and nothing already on disk is overwritten.
 */
export function createFeature(cwd: string, title: string): { paths: FeaturePaths; created: boolean } {
  fs.mkdirSync(featuresDir(cwd), { recursive: true });

  const slug = shortName(title);
  const existing = listFeatures(cwd).find((name) => name.slice(4) === slug);
  if (existing) {
    const paths = featurePaths(cwd, existing);
    // Fill in only what is missing — an existing artifact is never clobbered.
    writeIfMissing(paths.spec, SPEC_TEMPLATE);
    writeIfMissing(paths.plan, PLAN_TEMPLATE);
    writeIfMissing(paths.tasks, TASKS_TEMPLATE);
    writeIfMissing(paths.clarify, emptyClarify());
    setCurrentFeature(cwd, existing);
    return { paths, created: false };
  }

  const name = `${String(nextIndex(cwd)).padStart(3, "0")}-${slug}`;
  const paths = featurePaths(cwd, name);
  fs.mkdirSync(paths.dir, { recursive: true });
  fs.writeFileSync(paths.spec, SPEC_TEMPLATE, "utf8");
  fs.writeFileSync(paths.plan, PLAN_TEMPLATE, "utf8");
  fs.writeFileSync(paths.tasks, TASKS_TEMPLATE, "utf8");
  fs.writeFileSync(paths.clarify, emptyClarify(), "utf8");
  setCurrentFeature(cwd, name);
  return { paths, created: true };
}

/** The paths of one feature directory (does not touch the disk). */
function featurePaths(cwd: string, dir: string): FeaturePaths {
  const root = path.join(featuresDir(cwd), dir);
  return {
    dir: root,
    spec: path.join(root, "spec.md"),
    plan: path.join(root, "plan.md"),
    tasks: path.join(root, "tasks.md"),
    clarify: path.join(root, "clarify.json"),
  };
}

/**
 * The feature that is currently active.
 *
 * Returns `undefined` when there is no `current.json`, when it is unreadable,
 * or when it does not name a feature — never throws.
 */
export function resolveFeature(cwd: string): FeaturePaths | undefined {
  const current = readCurrent(cwd);
  if (!current || !current.feature_directory) return undefined;
  return featurePaths(cwd, current.feature_directory);
}

/** Point the project at one feature directory. */
export function setCurrentFeature(cwd: string, dir: string): void {
  const file = currentFeaturePath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = readCurrent(cwd);
  const created = existing && existing.feature_directory === dir ? existing.created : new Date().toISOString();
  const payload: CurrentFeature = {
    feature_directory: dir,
    created,
    title: dir.replace(/^\d{3}-/, ""),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

/** Read one artifact of the current feature; `undefined` when there is none. */
export function readArtifact(cwd: string, name: ArtifactName): string | undefined {
  const paths = resolveFeature(cwd);
  if (!paths) return undefined;
  const file = paths[name];
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

/** Write one artifact of the current feature; returns the file path. */
export function writeArtifact(cwd: string, name: ArtifactName, content: string): string {
  const paths = resolveFeature(cwd);
  if (!paths) {
    throw new Error("no current feature — create one before writing an artifact");
  }
  const file = paths[name];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  return file;
}

/** Every feature directory of the project, oldest first. */
export function listFeatures(cwd: string): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(featuresDir(cwd));
  } catch {
    return [];
  }
  return entries
    .filter((name) => /^\d{3}-/.test(name))
    .sort((a, b) => {
      const na = Number(a.slice(0, 3));
      const nb = Number(b.slice(0, 3));
      return na === nb ? a.localeCompare(b) : na - nb;
    });
}

// ── internals ─────────────────────────────────────────────────────────

function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/^feature\//, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function nextIndex(cwd: string): number {
  const numbers = listFeatures(cwd).map((name) => Number(name.slice(0, 3)));
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
}

function readCurrent(cwd: string): CurrentFeature | undefined {
  try {
    const raw = fs.readFileSync(currentFeaturePath(cwd), "utf8");
    const parsed = JSON.parse(raw) as Partial<CurrentFeature>;
    if (!parsed || typeof parsed.feature_directory !== "string" || !parsed.feature_directory) return undefined;
    return {
      feature_directory: parsed.feature_directory,
      created: typeof parsed.created === "string" ? parsed.created : "",
      title: typeof parsed.title === "string" ? parsed.title : parsed.feature_directory.replace(/^\d{3}-/, ""),
    };
  } catch {
    return undefined;
  }
}

function emptyClarify(): string {
  return JSON.stringify({ created: new Date().toISOString(), questions: [], answers: [] }, null, 2) + "\n";
}

function writeIfMissing(file: string, content: string): void {
  try {
    fs.accessSync(file);
    return; // already there — never clobber
  } catch {
    // not there yet
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}
