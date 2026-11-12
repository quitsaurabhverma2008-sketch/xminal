import path from "node:path";
import os from "node:os";
import { appendLine, ensureDir, expandHome, readText, sha256 } from "../util/fs";
import { projectReceiptsDir } from "../config/paths";
import { matchesGlob } from "../util/glob";
import { analyzeCommand } from "./risk";
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
  private askHook?: (done: () => void) => void;

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

  /**
   * A hook that fires around a confirmation prompt.
   *
   * The agent uses it to move into the "awaiting_confirmation" state, so the
   * UI (and a crash log) can show that the run is waiting for a human.
   */
  setAskHook(hook: ((done: () => void) => void) | undefined): void {
    this.askHook = hook;
  }

  /** Ask the human, with the state hook around the prompt. */
  private async ask(tool: string, reason: string): Promise<boolean> {
    if (!this.askHandler) return false;
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      this.askHook?.(() => undefined);
    };
    this.askHook?.(release);
    try {
      return await this.askHandler(tool, reason);
    } finally {
      release();
    }
  }

  classifyTool(tool: string, args: Record<string, unknown>): { risk: RiskLevel; reason: string } {
    if (READ_ONLY_TOOLS.has(tool)) {
      // reading a protected file (keys, .env, ssh) is not "safe" — it leaks into the model context
      if (tool === "read") {
        const file = String(args.path ?? args.file ?? "");
        const protectedHit = this.isProtected(file);
        if (protectedHit) return { risk: "dangerous", reason: `protected path read: ${protectedHit}` };
      }
      return { risk: "safe", reason: "read-only tool" };
    }
    if (tool === "bash") {
      const command = String(args.command ?? "");
      const escape = this.bashOutsideWorkspace(command);
      if (escape) return { risk: "dangerous", reason: escape };
      // the command is analysed segment by segment: a string that merely
      // mentions "rm -rf" is not a delete, and `rm -r -f /` is caught
      const analysis = analyzeCommand(command);
      if (analysis.risk === "HIGH") {
        const first = analysis.findings[0];
        return { risk: "dangerous", reason: first ? first.description : "dangerous command" };
      }
      if (analysis.risk === "MEDIUM") {
        const first = analysis.findings[0];
        return { risk: "risky", reason: first ? first.description : "shell command" };
      }
      return { risk: "risky", reason: "shell command" };
    }
    if (tool === "write" || tool === "edit" || tool === "multi_edit") {
      const file = String(args.path ?? args.file ?? "");
      const protectedHit = this.isProtected(file);
      if (protectedHit) return { risk: "dangerous", reason: `protected path: ${protectedHit}` };
      if (this.isOutsideWorkspace(file)) {
        return { risk: "dangerous", reason: `outside the workspace: ${file}` };
      }
      return { risk: "risky", reason: "file mutation" };
    }
    if (tool === "git_commit" || tool === "git_branch" || tool === "worktree") {
      return { risk: "risky", reason: "git mutation" };
    }
    if (tool === "verify" || tool === "ralph") return { risk: "risky", reason: "runs project commands" };
    return { risk: "risky", reason: "unknown tool" };
  }

  /**
   * Detect a shell command that clearly mutates something outside the
   * workspace (writing to $HOME, /etc, /usr, …). Best effort — a heuristic,
   * not a sandbox. Anything it flags is denied unless the user approves.
   */
  bashOutsideWorkspace(command: string): string | undefined {
    if (!command) return undefined;
    const mutating = /(^|[;&|]\s*)(sudo\s+)?(rm|mv|cp|tee|dd|chmod|chown|truncate|install|ln|mkdir|touch|echo|printf|cat|shred)\b|>>?\s*\//;
    if (!mutating.test(command)) return undefined;
    const absolute = command.match(/(^|[\s'"=])\/[A-Za-z0-9_./-]+/g) ?? [];
    for (const raw of absolute) {
      const target = raw.trim().replace(/^["'=]+/, "");
      if (!target.startsWith("/")) continue;
      if (this.isOutsideWorkspace(target) && !target.startsWith("/tmp") && !target.startsWith("/dev")) {
        return `shell writes outside the workspace: ${target}`;
      }
    }
    const home = process.env.HOME ?? "";
    if (home && new RegExp(`(^|[\\s'"])${home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(command)) {
      return "shell writes inside the home directory, outside the workspace";
    }
    return undefined;
  }

  /** True when the path resolves outside the project directory. */
  isOutsideWorkspace(file: string): boolean {
    if (!file) return false;
    const abs = path.resolve(this.cwd, expandHome(file));
    if (abs === this.cwd) return false;
    if (abs.startsWith(this.cwd + path.sep)) return false;
    // the project's own state directory is fair game
    const projectState = path.join(this.cwd, ".xminal");
    if (abs === projectState || abs.startsWith(projectState + path.sep)) return false;
    return true;
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
      const ok = await this.ask(tool, `${risk}: ${reason}`);
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
