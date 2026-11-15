import fs from "node:fs";
import path from "node:path";
import type { ToolKind, ToolCallLocation } from "./protocol";

/**
 * XMINAL tool names → ACP presentation.
 *
 * ACP clients pick an icon and a layout from `kind`, and show `title` to the
 * user. Both are display metadata only — they never grant access.
 */
const TOOL_KINDS: Record<string, ToolKind> = {
  read: "read",
  list: "search",
  glob: "search",
  grep: "search",
  search: "search",
  write: "edit",
  edit: "edit",
  multi_edit: "edit",
  patch: "edit",
  bash: "execute",
  shell: "execute",
  git: "execute",
  worktree: "execute",
  web_fetch: "fetch",
  web_search: "fetch",
  todo: "other",
  memory: "other",
  skill: "other",
  skills: "other",
  spec: "other",
  checkpoint: "other",
  verify: "execute",
  diagnostics: "read",
  mcp_call: "other",
  agent: "other",
};

export function toolKind(name: string): ToolKind {
  return TOOL_KINDS[name] ?? "other";
}

function fileArg(args: Record<string, unknown>): string {
  const value = args.path ?? args.file ?? args.filePath ?? args.target;
  return typeof value === "string" ? value : "";
}

function shortPath(value: string, cwd: string): string {
  if (!value) return "";
  const rel = path.isAbsolute(value) ? path.relative(cwd, value) : value;
  return rel && !rel.startsWith("..") ? rel : value;
}

/** A short, human-readable line for the tool call card. */
export function toolTitle(name: string, args: Record<string, unknown>, cwd: string): string {
  const file = fileArg(args);
  switch (name) {
    case "read":
      return file ? `Read ${shortPath(file, cwd)}` : "Read file";
    case "write":
      return file ? `Write ${shortPath(file, cwd)}` : "Write file";
    case "edit":
    case "multi_edit":
    case "patch":
      return file ? `Edit ${shortPath(file, cwd)}` : "Edit file";
    case "bash":
    case "shell": {
      const command = typeof args.command === "string" ? args.command : "";
      const oneLine = command.replace(/\s+/g, " ").trim();
      return oneLine ? `Run ${oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine}` : "Run command";
    }
    case "grep":
    case "search": {
      const pattern = typeof args.pattern === "string" ? args.pattern : "";
      return pattern ? `Search for ${pattern}` : "Search";
    }
    case "glob":
      return file ? `Find files in ${shortPath(file, cwd)}` : "Find files";
    case "list":
      return file ? `List ${shortPath(file, cwd)}` : "List directory";
    case "web_fetch":
    case "web_search": {
      const url = typeof args.url === "string" ? args.url : "";
      return url ? `Fetch ${url}` : "Fetch URL";
    }
    case "git":
      return "Run git";
    case "todo":
      return "Update the todo list";
    case "memory":
      return "Update memory";
    case "diagnostics":
      return "Read diagnostics";
    default:
      return name.replace(/_/g, " ");
  }
}

/** The files a tool touches — clients use this to follow along. */
export function toolLocations(name: string, args: Record<string, unknown>, cwd: string): ToolCallLocation[] {
  const file = fileArg(args);
  if (!file) return [];
  if (!["read", "write", "edit", "multi_edit", "patch", "list"].includes(name)) return [];
  const absolute = path.isAbsolute(file) ? file : path.resolve(cwd, file);
  return [{ path: absolute, line: null }];
}

/** Read a file before it is touched, so the diff can show the real old text. */
export function readIfExists(absolute: string): string | null {
  try {
    return fs.readFileSync(absolute, "utf8");
  } catch {
    return null;
  }
}

/**
 * The content a write/edit tool produces, so the client can render a diff.
 * `oldText` comes from the snapshot taken before the tool ran.
 */
export function newTextFor(name: string, args: Record<string, unknown>, absolute: string): string | null {
  if (name === "write") {
    if (typeof args.content === "string") return args.content;
    return readIfExists(absolute);
  }
  if (name === "edit" || name === "patch") {
    if (typeof args.newStr === "string" && typeof args.oldStr === "string" && args.oldStr.length > 0) {
      const current = readIfExists(absolute);
      if (current !== null && current.includes(args.oldStr)) {
        return current.replace(args.oldStr, args.newStr);
      }
    }
    return readIfExists(absolute);
  }
  if (name === "multi_edit") {
    const edits = Array.isArray(args.edits) ? args.edits : [];
    let content = readIfExists(absolute);
    if (content === null) return null;
    for (const edit of edits) {
      if (!edit || typeof edit !== "object") continue;
      const oldStr = (edit as Record<string, unknown>).oldStr;
      const newStr = (edit as Record<string, unknown>).newStr;
      if (typeof oldStr !== "string" || typeof newStr !== "string") continue;
      content = content.replace(oldStr, newStr);
    }
    return content;
  }
  return null;
}
