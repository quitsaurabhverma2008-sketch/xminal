import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ensureDir, exists, readJson, readText, writeJson, writeText, appendLine } from "../util/fs";
import { globalMemoryDir, projectMemoryDir } from "../config/paths";

export interface MemoryEntry {
  id: string;
  ts: string;
  text: string;
  tags: string[];
  scope: "global" | "project";
}

export interface MemorySearchResult extends MemoryEntry {
  score: number;
}

export class MemoryStore {
  private cache: MemoryEntry[] | null = null;

  constructor(private readonly cwd: string) {}

  private dirs(): Array<{ dir: string; scope: "global" | "project" }> {
    return [
      { dir: globalMemoryDir(), scope: "global" },
      { dir: projectMemoryDir(this.cwd), scope: "project" },
    ];
  }

  private fileFor(scope: "global" | "project"): string {
    return path.join(scope === "global" ? globalMemoryDir() : projectMemoryDir(this.cwd), "entries.jsonl");
  }

  private loadAll(): MemoryEntry[] {
    if (this.cache) return this.cache;
    const entries: MemoryEntry[] = [];
    for (const { dir, scope } of this.dirs()) {
      const file = path.join(dir, "entries.jsonl");
      if (!exists(file)) continue;
      for (const line of readText(file).split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as MemoryEntry;
          entries.push({ ...entry, scope });
        } catch {
          // skip
        }
      }
    }
    this.cache = entries;
    return entries;
  }

  add(text: string, tags: string[] = [], scope: "global" | "project" = "project"): MemoryEntry {
    const entry: MemoryEntry = {
      id: crypto.randomBytes(6).toString("hex"),
      ts: new Date().toISOString(),
      text: text.trim(),
      tags: tags.map((tag) => tag.toLowerCase()),
      scope,
    };
    const dir = scope === "global" ? globalMemoryDir() : projectMemoryDir(this.cwd);
    ensureDir(dir);
    appendLine(path.join(dir, "entries.jsonl"), JSON.stringify(entry));
    appendLine(path.join(dir, "MEMORY.md"), `- [${entry.ts.slice(0, 10)}] ${entry.text}${entry.tags.length ? ` _(tags: ${entry.tags.join(", ")})_` : ""}`);
    this.cache = null;
    return entry;
  }

  list(scope?: "global" | "project"): MemoryEntry[] {
    return this.loadAll()
      .filter((entry) => !scope || entry.scope === scope)
      .sort((a, b) => b.ts.localeCompare(a.ts));
  }

  search(query: string, limit = 8): MemorySearchResult[] {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 1);
    if (terms.length === 0) return [];
    const results: MemorySearchResult[] = [];
    for (const entry of this.loadAll()) {
      const haystack = `${entry.text} ${entry.tags.join(" ")}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (haystack.includes(term)) score += 1;
        if (entry.tags.includes(term)) score += 2;
      }
      if (score > 0) results.push({ ...entry, score });
    }
    return results.sort((a, b) => b.score - a.score || b.ts.localeCompare(a.ts)).slice(0, limit);
  }

  forget(id: string): boolean {
    let removed = false;
    for (const scope of ["global", "project"] as const) {
      const file = this.fileFor(scope);
      if (!exists(file)) continue;
      const lines = readText(file).split("\n").filter(Boolean);
      const kept = lines.filter((line) => {
        try {
          return (JSON.parse(line) as MemoryEntry).id !== id;
        } catch {
          return true;
        }
      });
      if (kept.length !== lines.length) {
        writeText(file, kept.join("\n") + (kept.length ? "\n" : ""));
        removed = true;
      }
    }
    this.cache = null;
    this.rebuildMarkdown();
    return removed;
  }

  private rebuildMarkdown(): void {
    const scopes: Array<{ dir: string; scope: "global" | "project" }> = this.dirs();
    for (const { dir, scope } of scopes) {
      const entries = this.loadAll().filter((entry) => entry.scope === scope);
      ensureDir(dir);
      const body = entries
        .slice()
        .sort((a, b) => a.ts.localeCompare(b.ts))
        .map(
          (entry) =>
            `- [${entry.ts.slice(0, 10)}] ${entry.text}${entry.tags.length ? ` _(tags: ${entry.tags.join(", ")})_` : ""}`,
        )
        .join("\n");
      writeText(path.join(dir, "MEMORY.md"), `# XMINAL Memory (${scope})\n\n${body}\n`);
    }
  }

  renderForPrompt(limit = 10): string {
    const entries = this.loadAll()
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, limit);
    if (entries.length === 0) return "";
    return entries
      .map((entry) => `- (${entry.scope}, ${entry.ts.slice(0, 10)}) ${entry.text}`)
      .join("\n");
  }
}
