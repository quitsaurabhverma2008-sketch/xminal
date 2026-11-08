"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryStore = void 0;
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const fs_1 = require("../util/fs");
const paths_1 = require("../config/paths");
class MemoryStore {
    cwd;
    cache = null;
    constructor(cwd) {
        this.cwd = cwd;
    }
    dirs() {
        return [
            { dir: (0, paths_1.globalMemoryDir)(), scope: "global" },
            { dir: (0, paths_1.projectMemoryDir)(this.cwd), scope: "project" },
        ];
    }
    fileFor(scope) {
        return node_path_1.default.join(scope === "global" ? (0, paths_1.globalMemoryDir)() : (0, paths_1.projectMemoryDir)(this.cwd), "entries.jsonl");
    }
    loadAll() {
        if (this.cache)
            return this.cache;
        const entries = [];
        for (const { dir, scope } of this.dirs()) {
            const file = node_path_1.default.join(dir, "entries.jsonl");
            if (!(0, fs_1.exists)(file))
                continue;
            for (const line of (0, fs_1.readText)(file).split("\n")) {
                if (!line.trim())
                    continue;
                try {
                    const entry = JSON.parse(line);
                    entries.push({ ...entry, scope });
                }
                catch {
                    // skip
                }
            }
        }
        this.cache = entries;
        return entries;
    }
    add(text, tags = [], scope = "project") {
        const entry = {
            id: node_crypto_1.default.randomBytes(6).toString("hex"),
            ts: new Date().toISOString(),
            text: text.trim(),
            tags: tags.map((tag) => tag.toLowerCase()),
            scope,
        };
        const dir = scope === "global" ? (0, paths_1.globalMemoryDir)() : (0, paths_1.projectMemoryDir)(this.cwd);
        (0, fs_1.ensureDir)(dir);
        (0, fs_1.appendLine)(node_path_1.default.join(dir, "entries.jsonl"), JSON.stringify(entry));
        (0, fs_1.appendLine)(node_path_1.default.join(dir, "MEMORY.md"), `- [${entry.ts.slice(0, 10)}] ${entry.text}${entry.tags.length ? ` _(tags: ${entry.tags.join(", ")})_` : ""}`);
        this.cache = null;
        return entry;
    }
    list(scope) {
        return this.loadAll()
            .filter((entry) => !scope || entry.scope === scope)
            .sort((a, b) => b.ts.localeCompare(a.ts));
    }
    search(query, limit = 8) {
        const terms = query
            .toLowerCase()
            .split(/\s+/)
            .filter((term) => term.length > 1);
        if (terms.length === 0)
            return [];
        const results = [];
        for (const entry of this.loadAll()) {
            const haystack = `${entry.text} ${entry.tags.join(" ")}`.toLowerCase();
            let score = 0;
            for (const term of terms) {
                if (haystack.includes(term))
                    score += 1;
                if (entry.tags.includes(term))
                    score += 2;
            }
            if (score > 0)
                results.push({ ...entry, score });
        }
        return results.sort((a, b) => b.score - a.score || b.ts.localeCompare(a.ts)).slice(0, limit);
    }
    forget(id) {
        let removed = false;
        for (const scope of ["global", "project"]) {
            const file = this.fileFor(scope);
            if (!(0, fs_1.exists)(file))
                continue;
            const lines = (0, fs_1.readText)(file).split("\n").filter(Boolean);
            const kept = lines.filter((line) => {
                try {
                    return JSON.parse(line).id !== id;
                }
                catch {
                    return true;
                }
            });
            if (kept.length !== lines.length) {
                (0, fs_1.writeText)(file, kept.join("\n") + (kept.length ? "\n" : ""));
                removed = true;
            }
        }
        this.cache = null;
        this.rebuildMarkdown();
        return removed;
    }
    rebuildMarkdown() {
        const scopes = this.dirs();
        for (const { dir, scope } of scopes) {
            const entries = this.loadAll().filter((entry) => entry.scope === scope);
            (0, fs_1.ensureDir)(dir);
            const body = entries
                .slice()
                .sort((a, b) => a.ts.localeCompare(b.ts))
                .map((entry) => `- [${entry.ts.slice(0, 10)}] ${entry.text}${entry.tags.length ? ` _(tags: ${entry.tags.join(", ")})_` : ""}`)
                .join("\n");
            (0, fs_1.writeText)(node_path_1.default.join(dir, "MEMORY.md"), `# XMINAL Memory (${scope})\n\n${body}\n`);
        }
    }
    renderForPrompt(limit = 10) {
        const entries = this.loadAll()
            .sort((a, b) => b.ts.localeCompare(a.ts))
            .slice(0, limit);
        if (entries.length === 0)
            return "";
        return entries
            .map((entry) => `- (${entry.scope}, ${entry.ts.slice(0, 10)}) ${entry.text}`)
            .join("\n");
    }
}
exports.MemoryStore = MemoryStore;
//# sourceMappingURL=store.js.map