import fs from "node:fs";
import path from "node:path";
import type { Tool } from "./types";
import { booleanArg, errorResult, numberArg, stringArg, textResult } from "./types";
import { expandHome, isBinary, relativeTo, truncateText, walkFiles, ensureDir } from "../util/fs";
import { matchesGlob } from "../util/glob";
import { diffPreview, diffStat } from "../util/diff";

export function resolveToolPath(cwd: string, input: string): string {
  if (!input) throw new Error("Path is required.");
  return path.resolve(cwd, expandHome(input));
}

const readTool: Tool = {
  name: "read",
  description:
    "Read a text file from the project. Returns line-numbered content. Supports offset and limit for large files. Use this before editing a file.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path (relative to project root or absolute)." },
      offset: { type: "number", description: "1-based starting line. Default 1." },
      limit: { type: "number", description: "Maximum lines to return. Default 2000." },
    },
    required: ["path"],
  },
  async run(args, context) {
    const file = resolveToolPath(context.cwd, stringArg(args, "path"));
    const stat = fs.statSync(file);
    if (stat.isDirectory()) return errorResult(`${file} is a directory. Use the list tool.`);
    const buffer = fs.readFileSync(file);
    if (isBinary(buffer)) return errorResult(`Cannot read binary file: ${file}`);
    const text = buffer.toString("utf8");
    const lines = text.split("\n");
    const offset = Math.max(1, numberArg(args, "offset", 1));
    const limit = Math.max(1, Math.min(5000, numberArg(args, "limit", 2000)));
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const width = String(offset + slice.length - 1).length;
    const numbered = slice.map((line, index) => `${String(offset + index).padStart(width, " ")}: ${line}`).join("\n");
    const rel = relativeTo(context.cwd, file);
    const header = `${rel} (${lines.length} lines${stat.size ? `, ${stat.size} bytes` : ""})`;
    return textResult(`${header}\n${truncateText(numbered, 200_000)}`);
  },
};

const writeTool: Tool = {
  name: "write",
  description:
    "Create or overwrite a file with the given content. Parent directories are created automatically. A checkpoint is saved first so the change can be undone.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path." },
      content: { type: "string", description: "Full file content." },
    },
    required: ["path", "content"],
  },
  async run(args, context) {
    const file = resolveToolPath(context.cwd, stringArg(args, "path"));
    const content = stringArg(args, "content");
    let before = "";
    let existed = false;
    if (fs.existsSync(file)) {
      existed = true;
      before = fs.readFileSync(file, "utf8");
      context.session.createCheckpoint(`write:${relativeTo(context.cwd, file)}`, [file]);
    }
    context.session.touch(file);
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, content, "utf8");
    const stat = diffStat(before, content);
    const rel = relativeTo(context.cwd, file);
    const preview = existed ? diffPreview(before, content, 1, 24) : "";
    return textResult(
      `${existed ? "Updated" : "Created"} ${rel} (+${stat.added} −${stat.removed}, ${Buffer.byteLength(content)} bytes)` +
        (preview ? `\n${preview}` : ""),
      { path: rel, added: stat.added, removed: stat.removed },
    );
  },
};

const editTool: Tool = {
  name: "edit",
  description:
    "Replace an exact string in a file. oldString must match exactly (including whitespace). Set replaceAll=true to replace every occurrence. A checkpoint is saved first.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path." },
      oldString: { type: "string", description: "Exact text to find." },
      newString: { type: "string", description: "Replacement text." },
      replaceAll: { type: "boolean", description: "Replace all occurrences (default false)." },
    },
    required: ["path", "oldString", "newString"],
  },
  async run(args, context) {
    const file = resolveToolPath(context.cwd, stringArg(args, "path"));
    if (!fs.existsSync(file)) return errorResult(`File not found: ${file}`);
    const oldString = stringArg(args, "oldString");
    const newString = stringArg(args, "newString");
    if (oldString === newString) return errorResult("oldString and newString are identical.");
    const before = fs.readFileSync(file, "utf8");
    const count = countOccurrences(before, oldString);
    if (count === 0) return errorResult(`oldString not found in ${relativeTo(context.cwd, file)}.`);
    if (count > 1 && !booleanArg(args, "replaceAll", false)) {
      return errorResult(
        `oldString occurs ${count} times. Provide more context or set replaceAll=true.`,
      );
    }
    context.session.createCheckpoint(`edit:${relativeTo(context.cwd, file)}`, [file]);
    context.session.touch(file);
    const after = booleanArg(args, "replaceAll", false)
      ? before.split(oldString).join(newString)
      : before.replace(oldString, newString);
    fs.writeFileSync(file, after, "utf8");
    const stat = diffStat(before, after);
    const preview = diffPreview(before, after, 2, 40);
    return textResult(
      `Edited ${relativeTo(context.cwd, file)} (${count} replacement${count === 1 ? "" : "s"}, +${stat.added} −${stat.removed})\n${preview}`,
      { path: relativeTo(context.cwd, file), replacements: count },
    );
  },
};

const multiEditTool: Tool = {
  name: "multi_edit",
  description: "Apply multiple exact-string edits to one file atomically. A checkpoint is saved first.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path." },
      edits: {
        type: "array",
        description: "List of edits.",
        items: {
          type: "object",
          properties: {
            oldString: { type: "string" },
            newString: { type: "string" },
            replaceAll: { type: "boolean" },
          },
          required: ["oldString", "newString"],
        },
      },
    },
    required: ["path", "edits"],
  },
  async run(args, context) {
    const file = resolveToolPath(context.cwd, stringArg(args, "path"));
    if (!fs.existsSync(file)) return errorResult(`File not found: ${file}`);
    const edits = args.edits;
    if (!Array.isArray(edits) || edits.length === 0) return errorResult("edits must be a non-empty array.");
    let content = fs.readFileSync(file, "utf8");
    context.session.createCheckpoint(`multi_edit:${relativeTo(context.cwd, file)}`, [file]);
    context.session.touch(file);
    const before = content;
    let applied = 0;
    for (const [index, raw] of edits.entries()) {
      const edit = raw as Record<string, unknown>;
      const oldString = stringArg(edit, "oldString");
      const newString = stringArg(edit, "newString");
      const replaceAll = booleanArg(edit, "replaceAll", false);
      if (!content.includes(oldString)) {
        return errorResult(`Edit #${index + 1} failed: oldString not found. No changes written.`);
      }
      content = replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString);
      applied++;
    }
    fs.writeFileSync(file, content, "utf8");
    return textResult(
      `Applied ${applied} edits to ${relativeTo(context.cwd, file)} (+${diffStat(before, content).added} −${diffStat(before, content).removed})\n${diffPreview(before, content, 1, 30)}`,
    );
  },
};

const listTool: Tool = {
  name: "list",
  description: "List files and directories at a path. Directories are marked with a trailing slash.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path. Default project root." },
      depth: { type: "number", description: "Recursion depth (default 1, max 3)." },
      limit: { type: "number", description: "Maximum entries (default 300)." },
    },
  },
  async run(args, context) {
    const root = resolveToolPath(context.cwd, stringArg(args, "path", "."));
    const depth = Math.max(1, Math.min(3, numberArg(args, "depth", 1)));
    const limit = Math.max(1, Math.min(2000, numberArg(args, "limit", 300)));
    const lines: string[] = [];
    const walk = (dir: string, currentDepth: number, prefix: string) => {
      if (lines.length >= limit) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (error) {
        lines.push(`${prefix}[error: ${(error as Error).message}]`);
        return;
      }
      entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (lines.length >= limit) return;
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
        if (entry.isDirectory()) {
          lines.push(`${prefix}${entry.name}/`);
          if (currentDepth < depth) walk(path.join(dir, entry.name), currentDepth + 1, prefix + "  ");
        } else {
          let size = 0;
          try {
            size = fs.statSync(path.join(dir, entry.name)).size;
          } catch {
            // ignore
          }
          lines.push(`${prefix}${entry.name}${size ? ` (${formatBytes(size)})` : ""}`);
        }
      }
    };
    walk(root, 1, "");
    return textResult(`${relativeTo(context.cwd, root)}/\n${lines.join("\n") || "(empty)"}`);
  },
};

const globTool: Tool = {
  name: "glob",
  description: "Find files by glob pattern (e.g. **/*.ts, src/**/test*.js). Returns paths relative to the project.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern." },
      path: { type: "string", description: "Root directory. Default project root." },
      limit: { type: "number", description: "Maximum results (default 200)." },
    },
    required: ["pattern"],
  },
  async run(args, context) {
    const pattern = stringArg(args, "pattern");
    if (!pattern) return errorResult("pattern is required.");
    const root = resolveToolPath(context.cwd, stringArg(args, "path", "."));
    const limit = Math.max(1, Math.min(2000, numberArg(args, "limit", 200)));
    const files = walkFiles(root, { maxFiles: 50000 });
    const matches: string[] = [];
    const hasSlash = pattern.includes("/");
    for (const file of files) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      const target = hasSlash ? rel : path.basename(rel);
      if (matchesGlob(pattern, target)) {
        matches.push(relativeTo(context.cwd, file));
        if (matches.length >= limit) break;
      }
    }
    matches.sort();
    return textResult(matches.length ? matches.join("\n") : `No files matched ${pattern}`);
  },
};

const grepTool: Tool = {
  name: "grep",
  description: "Search file contents with a regular expression. Returns path:line: text. Skips binary files and large files.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regular expression." },
      path: { type: "string", description: "Root directory or file. Default project root." },
      include: { type: "string", description: "Optional glob filter for filenames, e.g. *.ts." },
      caseSensitive: { type: "boolean", description: "Case sensitive (default false)." },
      maxResults: { type: "number", description: "Maximum matches (default 100)." },
    },
    required: ["pattern"],
  },
  async run(args, context) {
    const patternText = stringArg(args, "pattern");
    if (!patternText) return errorResult("pattern is required.");
    const caseSensitive = booleanArg(args, "caseSensitive", false);
    let regex: RegExp;
    try {
      regex = new RegExp(patternText, caseSensitive ? "" : "i");
    } catch (error) {
      return errorResult(`Invalid regular expression: ${(error as Error).message}`);
    }
    const root = resolveToolPath(context.cwd, stringArg(args, "path", "."));
    const include = stringArg(args, "include", "");
    const maxResults = Math.max(1, Math.min(1000, numberArg(args, "maxResults", 100)));
    const files: string[] = [];
    const stat = fs.statSync(root);
    if (stat.isFile()) files.push(root);
    else files.push(...walkFiles(root, { maxFiles: 50000 }).filter((file) => !include || matchesGlob(include, path.basename(file))));
    const results: string[] = [];
    for (const file of files) {
      if (results.length >= maxResults) break;
      let buffer: Buffer;
      try {
        const fileStat = fs.statSync(file);
        if (fileStat.size > 1_500_000) continue;
        buffer = fs.readFileSync(file);
      } catch {
        continue;
      }
      if (isBinary(buffer)) continue;
      const lines = buffer.toString("utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          results.push(`${relativeTo(context.cwd, file)}:${i + 1}: ${lines[i].slice(0, 300)}`);
          if (results.length >= maxResults) break;
        }
      }
    }
    return textResult(results.length ? results.join("\n") : `No matches for ${patternText}`);
  },
};

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const fsTools: Tool[] = [readTool, writeTool, editTool, multiEditTool, listTool, globTool, grepTool];
