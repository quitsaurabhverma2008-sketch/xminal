// Tool activity renderer — compact, dedicated presentation for tool executions.
// Raw tool logs never reach the conversation stream directly; callers merge the
// onToolCall → onToolResult pair into one ActivityLine and render it here.
// Honesty rule: never fabricate a status — pending until the result lands.
import {
  fgGreen, fgRed, fgMuted, fgText, fgAmber, fgAccent, BOLD, RESET,
} from "../theme";
import { visibleWidth, stripAnsi } from "../width";

export interface ActivityLine {
  kind: "tool";
  name: string;
  argsRaw: string;
  startedAt: number;
  status: "pending" | "ok" | "err";
  durationMs?: number;
  /** first content line of the result (for errors or one-line detail) */
  detail?: string;
  /** number of unshown result lines */
  extraLines?: number;
  added?: number;
  removed?: number;
  /** first ~8 diff-body lines, when the result carries a unified diff */
  preview?: string[];
  /** diff-body lines beyond the captured preview */
  extraPreviewLines?: number;
}

export function makeActivity(name: string, argsRaw: string): ActivityLine {
  return { kind: "tool", name, argsRaw, startedAt: Date.now(), status: "pending" };
}

const truncate = (text: string, width: number): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return visibleWidth(flat) <= width ? flat : flat.slice(0, Math.max(0, width - 1)) + "…";
};

/** Extract the operator-relevant target from raw JSON args, best effort. */
export function toolTarget(name: string, argsRaw: string, width = 80): string {
  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(argsRaw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
  } catch {
    return truncate(argsRaw, width);
  }
  const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
  switch (name) {
    case "read": case "write": case "edit": case "multi_edit": case "list":
      return truncate(str(args.path ?? args.dir ?? "."), width);
    case "glob": case "grep":
      return truncate(str(args.pattern ?? args.query ?? args.include ?? ""), width);
    case "bash":
      return truncate(str(args.command), width);
    case "git": case "worktree": case "stash":
      return truncate(str(args.command ?? args.args ?? args.subcommand ?? args.operation ?? args.path ?? ""), width);
    case "web_fetch":
      return truncate(str(args.url), width);
    case "web_search":
      return truncate(str(args.query ?? args.q), width);
    case "verify": case "diagnostics":
      return truncate(str(args.command ?? args.path ?? "auto"), width);
    case "task":
      return truncate(str(args.prompt), width);
    case "mcp_call":
      return truncate(`${str(args.server)}/${str(args.tool)}`, width);
    case "mcp_list":
      return truncate(str(args.server ?? "all"), width);
    case "memory":
      return truncate(str(args.query ?? args.text ?? args.action ?? args.scope ?? ""), width);
    case "skill": case "skills":
      return truncate(str(args.name ?? args.skill ?? args.action ?? ""), width);
    case "todo":
      return truncate(str(args.text ?? args.action ?? ""), width);
    case "checkpoint":
      return truncate(str(args.name ?? args.label ?? args.action ?? ""), width);
    default: {
      const vals = Object.entries(args).slice(0, 2).map(([k, v]) => `${k}=${truncate(str(v), 32)}`);
      return vals.length ? truncate(vals.join(", "), width) : "";
    }
  }
}

/** Human-friendly kind label — never invent a tool that doesn't exist. */
export function kindLabel(name: string): string {
  switch (name) {
    case "read": return "READ";
    case "write": return "WRITE";
    case "edit": case "multi_edit": return "EDIT";
    case "glob": case "grep": return "SEARCH";
    case "list": return "LIST";
    case "bash": return "RUN";
    case "verify": return "VERIFY";
    case "git": case "worktree": case "stash": return "GIT";
    case "web_fetch": case "web_search": return "WEB";
    case "task": return "TASK";
    case "mcp_call": case "mcp_list": return "MCP";
    case "memory": return "MEMORY";
    case "todo": return "TODO";
    case "skill": case "skills": return "SKILL";
    case "checkpoint": return "SAVE";
    case "diagnostics": return "DIAG";
    case "think": return "THINK";
    default:
      return name
        .replace(/_/g, " ")
        .split(" ")
        .map((w) => w.slice(0, 4).toUpperCase())
        .join(" ")
        .slice(0, 10);
  }
}

/** Parse `+N −M` header counts (edit/write tools) and unified diff line counts. */
export function diffCounts(text: string): { added: number; removed: number } | null {
  // the counts live in the result's first line ("Edited f.ts (1 replacement, +12 −4)")
  const firstLine = text.split("\n", 1)[0];
  const header = /\+(\d+)\s*[−-](\d+)/.exec(firstLine);
  if (header) return { added: Number(header[1]), removed: Number(header[2]) };
  if (!/^(@@|diff --git|\+\+\+ |--- )/m.test(text)) return null;
  let added = 0, removed = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Merge a tool result into a pending activity line. Never fabricates. */
export function completeActivity(
  activity: ActivityLine,
  isError: boolean,
  content: string,
  now = Date.now(),
): ActivityLine {
  const lines = content.split("\n");
  const firstLine = lines[0] ?? "";
  const totalLines = lines.length;
  const counts = diffCounts(content);
  let preview: string[] | undefined;
  let extraPreviewLines: number | undefined;
  if (counts) {
    const body = lines.slice(1).filter((l) => l.trim().length > 0);
    preview = body.slice(0, 8);
    if (body.length > 8) extraPreviewLines = body.length - 8;
  }
  return {
    ...activity,
    status: isError ? "err" : "ok",
    durationMs: now - activity.startedAt,
    detail: truncate(stripAnsi(firstLine), 120),
    extraLines: Math.max(0, totalLines - 1),
    ...(counts ? { added: counts.added, removed: counts.removed } : {}),
    ...(preview ? { preview, ...(extraPreviewLines ? { extraPreviewLines } : {}) } : {}),
  };
}

/** Render one activity line to styled ANSI text (no \n). */
export function renderActivity(a: ActivityLine, width: number): string {
  const icon = a.status === "pending" ? fgMuted("◌") : a.status === "ok" ? fgGreen("✓") : fgRed("✗");
  const kind = `${BOLD}${a.status === "err" ? fgRed(kindLabel(a.name)) : fgText(kindLabel(a.name))}${RESET}`;
  const target = toolTarget(a.name, a.argsRaw, Math.max(16, width - 22));
  const targetStyled = target ? ` ${fgText(target)}` : "";
  let suffix = "";
  if (a.status !== "pending") {
    const bits: string[] = [];
    if (a.added !== undefined || a.removed !== undefined) {
      bits.push(`${fgGreen(`+${a.added ?? 0}`)} ${fgRed(`−${a.removed ?? 0}`)}`);
    }
    if (a.durationMs !== undefined) bits.push(fgMuted(formatDuration(a.durationMs)));
    if (bits.length) suffix = `  ${bits.join(" ")}`;
  }
  const line = `${icon} ${kind}${targetStyled}${suffix}`;
  // hard clip — activity rows must never wrap the terminal
  if (visibleWidth(stripAnsi(line)) <= width) return line;
  return line; // caller clips with the ANSI-aware clip()
}
