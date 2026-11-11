import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export function expandHome(input: string): string {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, value: unknown, mode?: number): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
  if (mode !== undefined) {
    try {
      fs.chmodSync(file, mode);
    } catch {
      // best effort — some filesystems (FAT/exFAT) do not support chmod
    }
  }
}

/** Restrict a file to the owner (best effort). */
export function chmodPrivate(file: string): void {
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // best effort
  }
}

export function readText(file: string): string {
  return fs.readFileSync(file, "utf8");
}

export function writeText(file: string, content: string): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, "utf8");
}

export function appendLine(file: string, line: string): void {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, line + "\n", "utf8");
}

export function exists(file: string): boolean {
  try {
    fs.accessSync(file);
    return true;
  } catch {
    return false;
  }
}

export function isBinary(buffer: Buffer): boolean {
  const len = Math.min(buffer.length, 4096);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

export function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function shortHash(text: string, length = 8): string {
  return sha256(text).slice(0, length);
}

export function truncateText(text: string, maxChars: number, note = "…[truncated]"): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.75);
  const tail = Math.max(0, maxChars - head);
  return text.slice(0, head) + `\n${note} (${text.length - maxChars} chars)\n` + text.slice(text.length - tail);
}

export function walkFiles(root: string, options: { maxFiles?: number; ignore?: string[] } = {}): string[] {
  const maxFiles = options.maxFiles ?? 20000;
  const ignore = new Set(options.ignore ?? ["node_modules", ".git", "dist", ".xminal", "coverage", ".next", "build"]);
  const out: string[] = [];
  const stack = [root];
  while (stack.length && out.length < maxFiles) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") {
        if (ignore.has(entry.name)) continue;
      }
      if (ignore.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

export function relativeTo(base: string, file: string): string {
  const rel = path.relative(base, file);
  return rel === "" ? "." : rel;
}

export function copyFileWithDirs(src: string, dest: string): void {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

export function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
