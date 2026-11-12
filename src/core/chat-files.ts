/**
 * The files in the chat — the working set the agent is allowed to change,
 * plus the read-only reference files.
 *
 * The idea (popularised by aider): the model should edit the files it was
 * given, and the repository map should not repeat what is already in the
 * context. Files in the chat are therefore excluded from the map, and the
 * files that depend on them are boosted.
 */
import path from "node:path";
import fs from "node:fs";

export type ChatFileKind = "editable" | "read-only";

export interface ChatFile {
  readonly path: string; // absolute
  readonly kind: ChatFileKind;
  readonly addedAt: string;
}

export class ChatFilesStore {
  private readonly files = new Map<string, ChatFile>();

  /** Add a file. Returns false when it was already known. */
  add(file: string, kind: ChatFileKind = "editable"): boolean {
    const absolute = path.resolve(file);
    if (this.files.has(absolute)) return false;
    this.files.set(absolute, { path: absolute, kind, addedAt: new Date().toISOString() });
    return true;
  }

  /** Remove a file. Returns false when it was not in the chat. */
  drop(file: string): boolean {
    return this.files.delete(path.resolve(file));
  }

  get(file: string): ChatFile | undefined {
    return this.files.get(path.resolve(file));
  }

  has(file: string): boolean {
    return this.files.has(path.resolve(file));
  }

  /** Every file in the chat. */
  all(): ChatFile[] {
    return [...this.files.values()];
  }

  /** The editable files. */
  editable(): ChatFile[] {
    return this.all().filter((file) => file.kind === "editable");
  }

  /** The read-only reference files. */
  readOnly(): ChatFile[] {
    return this.all().filter((file) => file.kind === "read-only");
  }

  /** The paths, relative to the project, for the repo map. */
  relativePaths(cwd: string): string[] {
    return this.all().map((file) => path.relative(cwd, file.path).split(path.sep).join("/"));
  }

  clear(): void {
    this.files.clear();
  }
}

/** Expand a path the user typed: relative to the project, or absolute. */
export function resolveChatPath(cwd: string, input: string): string {
  const expanded = input.startsWith("~")
    ? path.join(process.env.HOME ?? "~", input.slice(1))
    : input;
  return path.resolve(cwd, expanded);
}

/**
 * Expand a directory into the files it holds (one level deep is enough for a
 * reference set; deeper trees are skipped).
 */
export function expandDirectory(dir: string, limit = 200): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile()) out.push(full);
    if (out.length >= limit) break;
  }
  return out;
}

/** A readable summary of the working set, for the prompt and the UI. */
export function renderChatFiles(files: ChatFilesStore, cwd: string, maxChars = 1200): string {
  const editable = files.editable().map((file) => path.relative(cwd, file.path));
  const readOnly = files.readOnly().map((file) => path.relative(cwd, file.path));
  if (!editable.length && !readOnly.length) return "";
  const lines: string[] = ["Files in the chat (these are the files you may change):"];
  for (const file of editable.slice(0, 40)) lines.push(`  ${file}`);
  if (readOnly.length) {
    lines.push("Read-only reference files (do not edit them):");
    for (const file of readOnly.slice(0, 20)) lines.push(`  ${file}`);
  }
  const text = lines.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}
