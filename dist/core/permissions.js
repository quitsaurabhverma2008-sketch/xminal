"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionManager = exports.AuditLog = void 0;
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const fs_1 = require("../util/fs");
const paths_1 = require("../config/paths");
const glob_1 = require("../util/glob");
const DANGEROUS_PATTERNS = [
    { pattern: /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i, reason: "recursive force delete" },
    { pattern: /\bsudo\b|\bdoas\b/i, reason: "privilege escalation" },
    { pattern: /\bchmod\s+777\b/i, reason: "world-writable permissions" },
    { pattern: /\bcurl\b[^|]*\|\s*(ba)?sh\b/i, reason: "pipe download to shell" },
    { pattern: /\bwget\b[^|]*\|\s*(ba)?sh\b/i, reason: "pipe download to shell" },
    { pattern: /\bgit\s+push\b[^\n]*--force|\bgit\s+push\b[^\n]*-f\b/i, reason: "force push" },
    { pattern: /\bgit\s+reset\s+--hard\b/i, reason: "discard working tree" },
    { pattern: /\bgit\s+clean\s+-[a-z]*f/i, reason: "delete untracked files" },
    { pattern: /\bdd\s+if=|\bmkfs\b|\bfdisk\b|\bparted\b/i, reason: "disk operation" },
    { pattern: /\bshutdown\b|\breboot\b|\bpoweroff\b/i, reason: "system power" },
    { pattern: /:\s*\(\s*\)\s*\{.*\|.*&.*\}/i, reason: "fork bomb" },
    { pattern: />\s*\/dev\/sd[a-z]/i, reason: "raw device write" },
    { pattern: /\b(curl|wget|nc|ncat|socat)\b/i, reason: "network command" },
];
const RISKY_PATTERNS = [
    { pattern: /\bnpm\s+(install|i)\b|\byarn\s+add\b|\bpnpm\s+add\b/i, reason: "installs dependencies" },
    { pattern: /\bpip\s+install\b|\buv\s+pip\s+install\b/i, reason: "installs packages" },
    { pattern: /\bgit\s+(commit|merge|rebase|checkout|switch)\b/i, reason: "modifies git state" },
    { pattern: /\bmv\b|\bcp\b|\brm\b/i, reason: "filesystem mutation" },
    { pattern: /\bdocker\b|\bpodman\b/i, reason: "container operation" },
    { pattern: /\bkill\b|\bpkill\b|\bkillall\b/i, reason: "process control" },
];
const READ_ONLY_TOOLS = new Set([
    "read",
    "glob",
    "grep",
    "list",
    "todo",
    "memory",
    "skill",
    "skills",
    "task",
    "git_status",
    "git_diff",
    "git_log",
    "web_fetch",
    "web_search",
    "diagnostics",
    "mcp_list",
    "think",
    "checkpoint_list",
]);
class AuditLog {
    cwd;
    seq = 0;
    prev = "genesis";
    constructor(cwd) {
        this.cwd = cwd;
        const dir = (0, paths_1.projectReceiptsDir)(this.cwd);
        (0, fs_1.ensureDir)(dir);
    }
    static verifyFile(file) {
        let prev = "genesis";
        let entries = 0;
        let firstBrokenSeq;
        let reason;
        let content = "";
        try {
            content = (0, fs_1.readText)(file);
        }
        catch {
            return { valid: true, entries: 0, reason: "no audit entries yet" };
        }
        for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            entries += 1;
            let entry;
            try {
                entry = JSON.parse(trimmed);
            }
            catch {
                firstBrokenSeq = entries;
                reason = "malformed JSON line";
                break;
            }
            const expected = (0, fs_1.sha256)(prev + JSON.stringify({ seq: entry.seq, ts: entry.ts, action: entry.action, decision: entry.decision, details: entry.details }));
            if (entry.prev !== prev || entry.hash !== expected) {
                firstBrokenSeq = Number(entry.seq ?? entries);
                reason = "chain broken (prev/hash mismatch)";
                break;
            }
            prev = expected;
        }
        return firstBrokenSeq === undefined
            ? { valid: true, entries }
            : { valid: false, entries, firstBrokenSeq, reason };
    }
    append(action, decision, details) {
        this.seq += 1;
        const entry = {
            seq: this.seq,
            ts: new Date().toISOString(),
            action,
            decision,
            details,
        };
        const hash = (0, fs_1.sha256)(this.prev + JSON.stringify(entry));
        const line = JSON.stringify({ ...entry, prev: this.prev, hash });
        (0, fs_1.appendLine)(node_path_1.default.join((0, paths_1.projectReceiptsDir)(this.cwd), "audit.jsonl"), line);
        this.prev = hash;
    }
}
exports.AuditLog = AuditLog;
class PermissionManager {
    cwd;
    protectedPaths;
    askHandler;
    allowAll;
    mode;
    audit;
    constructor(cwd, mode, protectedPaths, askHandler, allowAll = false) {
        this.cwd = cwd;
        this.protectedPaths = protectedPaths;
        this.askHandler = askHandler;
        this.allowAll = allowAll;
        this.mode = mode;
        this.audit = new AuditLog(cwd);
    }
    setMode(mode) {
        this.mode = mode;
        this.audit.append("mode_change", mode, {});
    }
    setAskHandler(handler) {
        this.askHandler = handler;
    }
    classifyTool(tool, args) {
        if (READ_ONLY_TOOLS.has(tool))
            return { risk: "safe", reason: "read-only tool" };
        if (tool === "bash") {
            const command = String(args.command ?? "");
            for (const item of DANGEROUS_PATTERNS) {
                if (item.pattern.test(command))
                    return { risk: "dangerous", reason: item.reason };
            }
            for (const item of RISKY_PATTERNS) {
                if (item.pattern.test(command))
                    return { risk: "risky", reason: item.reason };
            }
            return { risk: "risky", reason: "shell command" };
        }
        if (tool === "write" || tool === "edit" || tool === "multi_edit") {
            const file = String(args.path ?? args.file ?? "");
            const protectedHit = this.isProtected(file);
            if (protectedHit)
                return { risk: "dangerous", reason: `protected path: ${protectedHit}` };
            return { risk: "risky", reason: "file mutation" };
        }
        if (tool === "git_commit" || tool === "git_branch" || tool === "worktree") {
            return { risk: "risky", reason: "git mutation" };
        }
        if (tool === "verify" || tool === "ralph")
            return { risk: "risky", reason: "runs project commands" };
        return { risk: "risky", reason: "unknown tool" };
    }
    isProtected(file) {
        if (!file)
            return undefined;
        const abs = node_path_1.default.resolve(this.cwd, (0, fs_1.expandHome)(file));
        for (const raw of this.protectedPaths) {
            const pattern = (0, fs_1.expandHome)(raw);
            if (pattern.includes("*") || pattern.includes("?")) {
                if ((0, glob_1.matchesGlob)(pattern, abs) || (0, glob_1.matchesGlob)(pattern, node_path_1.default.relative(this.cwd, abs)))
                    return raw;
            }
            else {
                const target = node_path_1.default.isAbsolute(pattern) ? pattern : node_path_1.default.resolve(this.cwd, pattern);
                if (abs === target || abs.startsWith(target + node_path_1.default.sep))
                    return raw;
            }
        }
        if (abs === node_os_1.default.homedir())
            return "home directory root";
        return undefined;
    }
    async check(tool, args) {
        const { risk, reason } = this.classifyTool(tool, args);
        if (risk === "dangerous" && reason.startsWith("protected path")) {
            this.audit.append(tool, "deny", { args, reason });
            return { allowed: false, needsPrompt: false, reason, risk };
        }
        if (risk === "safe") {
            this.audit.append(tool, "allow", { args, reason, mode: this.mode });
            return { allowed: true, needsPrompt: false, reason, risk };
        }
        if (this.mode === "full" || this.allowAll) {
            this.audit.append(tool, "allow", { args, reason, mode: this.mode });
            return { allowed: true, needsPrompt: false, reason, risk };
        }
        if (this.mode === "ask") {
            const ok = this.askHandler ? await this.askHandler(tool, `${risk}: ${reason}`) : false;
            this.audit.append(tool, ok ? "allow" : "deny", { args, reason, mode: this.mode });
            return { allowed: ok, needsPrompt: true, reason, risk };
        }
        if (this.mode === "auto" && risk === "risky") {
            this.audit.append(tool, "allow", { args, reason, mode: this.mode });
            return { allowed: true, needsPrompt: false, reason, risk };
        }
        const ok = this.askHandler ? await this.askHandler(tool, `${risk}: ${reason}`) : false;
        this.audit.append(tool, ok ? "allow" : "deny", { args, reason, mode: this.mode });
        return { allowed: ok, needsPrompt: true, reason, risk };
    }
}
exports.PermissionManager = PermissionManager;
//# sourceMappingURL=permissions.js.map