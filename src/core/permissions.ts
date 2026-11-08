import path from "node:path";
import os from "node:os";
import { appendLine, ensureDir, expandHome, readText, sha256 } from "../util/fs";
import { projectReceiptsDir } from "../config/paths";
import { matchesGlob } from "../util/glob";
import type { PermissionMode } from "../config/types";

export type RiskLevel = "safe" | "risky" | "dangerous";

export interface PermissionDecision {
  allowed: boolean;
  needsPrompt: boolean;
  reason: string;
  risk: RiskLevel;
}

export type AskHandler = (question: string, detail?: string) => Promise<boolean>;

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
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

const RISKY_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
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

export interface AuditVerification {
  valid: boolean;
  entries: number;
  firstBrokenSeq?: number;
  reason?: string;
}

export class AuditLog {
  private seq = 0;
  private prev = "genesis";

  constructor(private readonly cwd: string) {
    const dir = projectReceiptsDir(this.cwd);
    ensureDir(dir);
  }

  static verifyFile(file: string): AuditVerification {
    let prev = "genesis";
    let entries = 0;
    let firstBrokenSeq: number | undefined;
    let reason: string | undefined;
    let content = "";
    try {
      content = readText(file);
    } catch {
      return { valid: true, entries: 0, reason: "no audit entries yet" };
    }
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      entries += 1;
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        firstBrokenSeq = entries;
        reason = "malformed JSON line";
        break;
      }
      const expected = sha256(
        prev + JSON.stringify({ seq: entry.seq, ts: entry.ts, action: entry.action, decision: entry.decision, details: entry.details }),
      );
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

  append(action: string, decision: string, details: Record<string, unknown>): void {
    this.seq += 1;
    const entry = {
      seq: this.seq,
      ts: new Date().toISOString(),
      action,
      decision,
      details,
    };
    const hash = sha256(this.prev + JSON.stringify(entry));
    const line = JSON.stringify({ ...entry, prev: this.prev, hash });
    appendLine(path.join(projectReceiptsDir(this.cwd), "audit.jsonl"), line);
    this.prev = hash;
  }
}

export class PermissionManager {
  mode: PermissionMode;
  private audit: AuditLog;

  constructor(
    private readonly cwd: string,
    mode: PermissionMode,
    private readonly protectedPaths: string[],
    private askHandler?: AskHandler,
    readonly allowAll = false,
  ) {
    this.mode = mode;
    this.audit = new AuditLog(cwd);
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
    this.audit.append("mode_change", mode, {});
  }

  setAskHandler(handler: AskHandler | undefined): void {
    this.askHandler = handler;
  }

  classifyTool(tool: string, args: Record<string, unknown>): { risk: RiskLevel; reason: string } {
    if (READ_ONLY_TOOLS.has(tool)) return { risk: "safe", reason: "read-only tool" };
    if (tool === "bash") {
      const command = String(args.command ?? "");
      for (const item of DANGEROUS_PATTERNS) {
        if (item.pattern.test(command)) return { risk: "dangerous", reason: item.reason };
      }
      for (const item of RISKY_PATTERNS) {
        if (item.pattern.test(command)) return { risk: "risky", reason: item.reason };
      }
      return { risk: "risky", reason: "shell command" };
    }
    if (tool === "write" || tool === "edit" || tool === "multi_edit") {
      const file = String(args.path ?? args.file ?? "");
      const protectedHit = this.isProtected(file);
      if (protectedHit) return { risk: "dangerous", reason: `protected path: ${protectedHit}` };
      return { risk: "risky", reason: "file mutation" };
    }
    if (tool === "git_commit" || tool === "git_branch" || tool === "worktree") {
      return { risk: "risky", reason: "git mutation" };
    }
    if (tool === "verify" || tool === "ralph") return { risk: "risky", reason: "runs project commands" };
    return { risk: "risky", reason: "unknown tool" };
  }

  isProtected(file: string): string | undefined {
    if (!file) return undefined;
    const abs = path.resolve(this.cwd, expandHome(file));
    for (const raw of this.protectedPaths) {
      const pattern = expandHome(raw);
      if (pattern.includes("*") || pattern.includes("?")) {
        if (matchesGlob(pattern, abs) || matchesGlob(pattern, path.relative(this.cwd, abs))) return raw;
      } else {
        const target = path.isAbsolute(pattern) ? pattern : path.resolve(this.cwd, pattern);
        if (abs === target || abs.startsWith(target + path.sep)) return raw;
      }
    }
    if (abs === os.homedir()) return "home directory root";
    return undefined;
  }

  async check(tool: string, args: Record<string, unknown>): Promise<PermissionDecision> {
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
