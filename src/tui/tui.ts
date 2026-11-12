import fs from "node:fs";
import path from "node:path";
import { Runtime } from "../runtime";
import { verifyAudit } from "../cli/audit";
import { loadConfig, resolveModel, addGlobalMcpServer } from "../config/config";
import { listEffectiveAliases, refreshModelsCatalog, effectiveModelMap, catalogMeta } from "../config/models-catalog";
import { loadMcpCatalog, searchMcpServers, mcpConfigSnippet, mcpServerConfig, type McpCatalogEntry } from "../mcp/catalog";
import { visibleWidth, graphemeSlice, stripAnsi as stripAnsiW, splitGraphemes, wrapAnsi } from "./width";
import { formatAssistantText, isLikelyDiff, tintDiffRow } from "./format";
import { renderMarkdown } from "./markdown";
import { redactSecrets } from "../util/redact";
import { logEvent } from "../util/log";
import { renderRepoMap, repoMapSummary, buildRepoMap } from "../core/repo-map";
import { renderFindings, reviewSummary } from "../core/review";
import { runVerify, renderVerifyResult } from "../core/verify-runner";
import type { ProviderConfig, ModelConfig } from "../config/types";
import { Renderer } from "../cli/render";
import { handleCommand } from "../cli/commands";
import { spawnSync } from "node:child_process";
import { T, rgb, bgRgb, RESET, BOLD, fgMuted, fgText, fgAccent, fgAmber, fgGreen, fgRed, fgCyan, fgYellow, modeColor } from "./theme";
import { makeActivity, completeActivity, renderActivity, spinnerFrame, toolTarget, SPINNER_FRAMES, type ActivityLine } from "./output/tool-activity";

function openExternal(url: string): boolean {
  const platform = process.platform;
  const candidates: Array<[string, string[]]> =
    platform === "darwin"
      ? [["open", [url]]]
      : platform === "win32"
        ? [["cmd", ["/c", "start", "", url]]]
        : [["termux-open-url", [url]], ["xdg-open", [url]], ["gio", ["open", url]]];
  for (const [bin, args] of candidates) {
    try {
      const r = spawnSync(bin, args, { stdio: "ignore" });
      if (r.status === 0) return true;
    } catch { /* try next */ }
  }
  return false;
}
import { loadTodos, detectGitBranch } from "./state";
import type { AgentCallbacks, AgentMode } from "../core/agent";

// ─── design tokens — single source: src/tui/theme.ts ───────────────
const C = T;
const bold = (t: string) => `${BOLD}${t}${RESET}`;
const stripAnsi = stripAnsiW;
const visible = visibleWidth;
const padRight = (s: string, w: number) => (visible(s) >= w ? s : s + " ".repeat(w - visible(s)));
/**
 * Re-apply a background after every reset.
 *
 * A bare ESC[0m clears the background too, so any styled text inside a
 * painted row (a panel, the composer, the sidebar) punched a hole in it.
 * This keeps the fill continuous.
 */
const keepBg = (bg: string, content: string): string =>
  content.includes(RESET) ? content.split(RESET).join(RESET + bg) : content;
const clip = (s: string, w: number): string => {
  if (visible(s) <= w) return s;
  let out = "";
  let cols = 0;
  let i = 0;
  while (i < s.length) {
    const esc = /^(\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07)/.exec(s.slice(i));
    if (esc) { out += esc[0]; i += esc[0].length; continue; }
    const ch = splitGraphemes(s.slice(i))[0];
    if (ch === undefined) break;
    const cw = visible(ch);
    if (cols + cw > w) break;
    out += ch; cols += cw; i += ch.length;
  }
  return out + RESET;
};

type LineKind = "user" | "assistant" | "reasoning" | "tool" | "ok" | "err" | "system";
interface Line {
  kind: LineKind;
  text: string;
  /** present when kind === "tool" — merged onToolCall → onToolResult */
  activity?: ActivityLine;
  /** memoized render rows per width/mode — the object itself is mutated in place, so cache by content below */
  rows?: Map<string, string[]>;
}

// ─── full command catalog (categories + fuzzy filter) ─────────────
interface Cmd {
  name: string;
  desc: string;
  group: string;
  action?: "provider" | "model" | "variant";
}
const COMMANDS: Cmd[] = [
  { name: "/new", desc: "start a new session", group: "Session" },
  { name: "/resume", desc: "resume previous session", group: "Session" },
  { name: "/sessions", desc: "list all sessions", group: "Session" },
  { name: "/rename", desc: "rename the current session", group: "Session" },
  { name: "/branch", desc: "branch session into alternate history", group: "Session" },
  { name: "/rewind", desc: "restore a checkpoint", group: "Session" },
  { name: "/checkpoints", desc: "list checkpoints", group: "Session" },
  { name: "/undo", desc: "undo last file edit", group: "Session" },

  { name: "/mode", desc: "switch plan/build/compose/review/yolo", group: "Agent" },
  { name: "/model", desc: "pick default model", group: "Agent" },
  { name: "/models", desc: "list all model aliases", group: "Agent" },
  { name: "/variant", desc: "set effort (low/medium/high/max)", group: "Agent" },
  { name: "/effort", desc: "alias for /variant", group: "Agent" },
  { name: "/reasoning", desc: "alias for /variant", group: "Agent" },

  { name: "/provider", desc: "pick provider → enter API key → save", group: "Providers", action: "provider" },
  { name: "/connect", desc: "connect a provider (same as /provider)", group: "Providers", action: "provider" },
  { name: "/set-key", desc: "set provider key interactively", group: "Providers", action: "provider" },
  { name: "/clear-key", desc: "clear a provider key", group: "Providers" },

  { name: "/map", desc: "ranked repository map (file signatures)", group: "Repo" },
  { name: "/add", desc: "add a file to the chat (editable)", group: "Repo" },
  { name: "/drop", desc: "drop a file from the chat", group: "Repo" },
  { name: "/ls", desc: "the chat working set + the repo map", group: "Repo" },
  { name: "/read", desc: "add a file as a read-only reference", group: "Repo" },
  { name: "/tokens", desc: "context window and cost", group: "Repo" },
  { name: "/traj", desc: "run statistics (trajectories)", group: "Repo" },
  { name: "/spec", desc: "the feature spec, plan and tasks", group: "Repo" },
  { name: "/constitution", desc: "the project's versioned rules", group: "Repo" },
  { name: "/state", desc: "the agent's run state", group: "Repo" },
  { name: "/architect", desc: "plan with one model, edit with another", group: "Agent" },
  { name: "/repo", desc: "alias for /map", group: "Repo" },
  { name: "/diff", desc: "show the working diff + its risk flags", group: "Repo" },
  { name: "/verify", desc: "run the project's verify command now", group: "Repo" },

  { name: "/tasks", desc: "the task list (.xminal/todos.json)", group: "Tasks" },
  { name: "/memory", desc: "memory list · add · search · forget", group: "Tasks" },
  { name: "/skills", desc: "list installed skills", group: "Skills" },
  { name: "/skill", desc: "print a skill by name", group: "Skills" },
  { name: "/skills --lock", desc: "lock current skills (.xminal/skills.lock.json)", group: "Skills" },
  { name: "/skills --verify", desc: "verify skills against the lockfile", group: "Skills" },
  { name: "/skill-search", desc: "search the skills.sh registry (live)", group: "Skills" },
  { name: "/skill-install", desc: "install a skill from the skills.sh registry", group: "Skills" },

  { name: "/mcp", desc: "list MCP servers + tools", group: "MCP" },

  { name: "/build", desc: "build mode (shorthand for /mode build)", group: "Agent" },
  { name: "/ralph", desc: "iterate impl until verify passes", group: "Dev" },

  { name: "/diff", desc: "git diff", group: "Git" },
  { name: "/git", desc: "run a git command", group: "Git" },
  { name: "/status", desc: "git status --short --branch", group: "Git" },
  { name: "/branch", desc: "git branch -vv", group: "Git" },

  { name: "/cost", desc: "token spend breakdown", group: "Usage" },
  { name: "/tools", desc: "per-tool token usage", group: "Usage" },

  { name: "/doctor", desc: "environment diagnostics", group: "Setup" },
  { name: "/init", desc: "create .xminal in this project", group: "Setup" },
  { name: "/permissions", desc: "review or change ask/auto/full", group: "Setup" },
  { name: "/compact", desc: "compact in-memory conversation", group: "Session" },

  { name: "/audit", desc: "verify hash-chained audit log", group: "Audit" },
  { name: "/docs", desc: "show docs/ROADMAP.md", group: "Docs" },

  { name: "/version", desc: "print xminal version", group: "System" },
  { name: "/help", desc: "this command list", group: "System" },
  { name: "/clear", desc: "clear the screen", group: "System" },
  { name: "/report", desc: "report a bug on GitHub", group: "System" },
  { name: "/issue", desc: "alias for /report", group: "System" },
  { name: "/exit", desc: "quit XMINAL", group: "System" },
];

// the canonical provider catalog lives in src/config/providers.ts — this is
// the same list the runtime seeds, the router ranks and the UI displays
import { PROVIDER_CATALOG } from "../config/providers";

type ProviderEntry = (typeof PROVIDER_CATALOG)[number];
const PROVIDERS: readonly ProviderEntry[] = PROVIDER_CATALOG;

function providerKeyEnv(key: string): string {
  return PROVIDERS.find((p) => p.key === key)?.env ?? "";
}
function providerIsReady(key: string, saved?: Record<string, { apiKey?: string } | undefined>): boolean {
  const env = providerKeyEnv(key);
  if (!env) return true; // keyless (local / free)
  return Boolean(process.env[env]) || Boolean(saved?.[key]?.apiKey);
}
function kindLabel(kind: ProviderEntry["kind"]): string {
  return kind === "local" ? "LOCAL" : kind === "free" ? "FREE" : "BYOK";
}
async function validateKey(entry: ProviderEntry, key: string): Promise<string> {
  const cleaned = sanitizeKey(key);
  if (!keyCharsetOk(cleaned)) return "bad_chars";
  key = cleaned;
  if (entry.key === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${entry.defaultModel}:generateContent`;
    const body = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      generationConfig: { maxOutputTokens: 1 },
    });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return "ok";
      const text = await res.text();
      if (/insufficient|quota|credit|billing|resource_exhausted/i.test(text)) return "insufficient_funds";
      if (res.status === 401 || res.status === 403) return "invalid_key";
      return `http_${res.status}`;
    } catch (error) {
      return (error as Error).message?.includes("Timeout") ? "timeout" : "network_error";
    }
  }
  if (entry.key === "anthropic") {
    const body = JSON.stringify({
      model: entry.defaultModel,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return "ok";
      const text = await res.text();
      if (/insufficient|quota|credit|billing/i.test(text)) return "insufficient_funds";
      if (res.status === 401 || res.status === 403) return "invalid_key";
      return `http_${res.status}`;
    } catch (error) {
      return (error as Error).message?.includes("Timeout") ? "timeout" : "network_error";
    }
  }
  const url = entry.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const body = JSON.stringify({
    model: entry.defaultModel,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
    stream: false,
  });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return "ok";
    const text = await res.text();
    if (/insufficient|quota|credit|billing/i.test(text)) return "insufficient_funds";
    if (res.status === 401 || res.status === 403) return "invalid_key";
    return `http_${res.status}`;
  } catch (error) {
    return (error as Error).message?.includes("Timeout") ? "timeout" : "network_error";
  }
}

// ─── overlay system ─────────────────────────────────────────────────
type Overlay =
  | { kind: "none" }
  | { kind: "palette"; index: number }
  | { kind: "provider"; index: number }
  | { kind: "provider-key"; entry: ProviderEntry; input: string }
  | { kind: "provider-test"; entry: ProviderEntry; status: "working" | "ok" | "fail"; message: string }
  | { kind: "model"; query: string; index: number }
  | { kind: "variant"; index: number }
  | { kind: "mcp"; query: string; index: number }
  | { kind: "sessions"; query: string; index: number }
  | { kind: "mode"; index: number };

const EFFORTS = ["low", "medium", "high", "max"];
const modelAliases = (): Array<{ alias: string; provider: string; model: string; free: boolean }> => {
  try {
    const { config } = loadConfig(process.cwd());
    return listEffectiveAliases(config.models);
  } catch {
    return [];
  }
};
type ModelAliasItem = ReturnType<typeof modelAliases>[number];
let modelScope: string | null = null;
const modelScopeOfSpec = (spec: string): string | null => {
  const slash = spec.indexOf("/");
  return slash > 0 ? spec.slice(0, slash) : null;
};
let modelMapCache: Record<string, ModelConfig> | null = null;
const modelMap = (): Record<string, ModelConfig> => {
  if (modelMapCache) return modelMapCache;
  try {
    const { config } = loadConfig(process.cwd());
    modelMapCache = effectiveModelMap(config.models).models;
  } catch {
    modelMapCache = {};
  }
  return modelMapCache;
};
/**
 * Context-window label.
 *
 * It is labelled "ctx" on purpose: the number is how many tokens fit in one
 * request, NOT the provider's daily free allowance. Showing a bare "1.0M"
 * next to "FREE" is exactly what makes people think it is the daily quota.
 */
const ctxLabel = (n?: number): string => {
  if (!n || n <= 0) return "";
  const value = n >= 1_000_000 ? `${(n / 1e6).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M` : `${Math.round(n / 1000)}K`;
  return `ctx ${value}`;
};
const priceLabel = (cfg?: ModelConfig): string => {
  if (!cfg) return "";
  const inP = cfg.inputPricePerMTok, outP = cfg.outputPricePerMTok;
  if (inP === undefined || outP === undefined) return "—"; // price unknown — never claim "free"
  if (inP === 0 && outP === 0) return "";
  return `$${inP}/$${outP}`;
};
const filteredModels = (query = ""): ModelAliasItem[] => {
  const aliases = modelAliases();
  const scoped = modelScope ? aliases.filter((m) => m.provider === modelScope) : aliases;
  const q = query.toLowerCase();
  const list = q ? scoped.filter((m) => m.alias.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q) || m.model.toLowerCase().includes(q)) : scoped;
  return [...list].sort((a, b) => (Number(b.free) - Number(a.free)) || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));
};

// ─── utility ────────────────────────────────────────────────────────
const sanitizeKey = (raw: string): string => raw.replace(/[^\x21-\x7E]/g, "").trim();
const keyCharsetOk = (key: string): boolean => key.length > 0 && /^[\x21-\x7E]+$/.test(key);
const friendlyValidateError = (code: string): string => {
  switch (code) {
    case "bad_chars": return "key contains invalid characters — copy it exactly (no smart quotes, no stray symbols)";
    case "invalid_key": return "invalid API key (401/403 from provider)";
    case "insufficient_funds": return "insufficient funds / quota exhausted";
    case "timeout": return "request timed out — check network / base URL";
    case "network_error": return "network error — check connection";
    default:
      if (code.startsWith("http_404")) return "model not found on provider — wrong catalog entry";
      if (code.startsWith("http_429")) return "rate limit reached";
      if (code.startsWith("http_")) return `provider rejected request (${code})`;
      return code;
  }
};

const maskKey = (key: string) => {
  if (key.length <= 4) return "•".repeat(key.length);
  return "•".repeat(key.length - 4) + key.slice(-4);
};

const centerPanel = (rows: number, cols: number, height: number) => {
  const width = Math.min(cols - 4, 82);
  const top = Math.max(2, Math.floor((rows - height) / 2));
  const left = Math.max(0, Math.floor((cols - width) / 2));
  return { width, top, left, height };
};

const panelBorder = (title: string, width: number) => {
  const label = ` ${title} `;
  const left = "+-";
  const mid = label + "-".repeat(Math.max(0, width - left.length - label.length - 1));
  return `${rgb(C.border)}${left}${BOLD}${fgAccent(label)}${rgb(C.border)}${"-".repeat(Math.max(0, width - left.length - label.length - 1))}+${RESET}`;
};
const panelBottom = (width: number) => `${rgb(C.border)}+${"-".repeat(width - 2)}+${RESET}`;
const panelRow = (content: string, width: number, bg: readonly [number, number, number] = C.panel) =>
  `${bgRgb(bg)}${keepBg(bgRgb(bg), padRight(" " + content, width - 1))}${RESET}${rgb(C.border)}│${RESET}`;
const panelSide = (content: string, width: number, bg: readonly [number, number, number] = C.panel) =>
  `${rgb(C.border)}│${RESET}${bgRgb(bg)}${keepBg(bgRgb(bg), padRight(" " + content, width - 1))}${RESET}${rgb(C.border)}│${RESET}`;

const sectionLabel = (t: string) => fgMuted(t.toUpperCase());
const ok = (t: string) => fgGreen(t);
const warn = (t: string) => fgAmber(t);
const err = (t: string) => fgRed(t);

// ─── main entry ─────────────────────────────────────────────────────
export async function startTui(initialRuntime: Runtime): Promise<void> {
  let runtime = initialRuntime;
  const cwd = runtime.cwd;
  let sessionTitle = runtime.session.meta.title === "untitled" ? "new session" : runtime.session.meta.title;
  let shortId = runtime.session.id.slice(0, 8);
  let todos = loadTodos(cwd);
  const branch = detectGitBranch(cwd);

interface SessionRow {
  id: string;
  title: string;
  updated: string;
  count: number;
  isNew?: boolean;
}

/** "just now" / "5m ago" / "3d ago" — friendlier than a raw timestamp */
function relativeTime(when?: Date): string {
  if (!when) return "";
  const seconds = Math.max(0, Math.round((Date.now() - when.getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** Session list for the /sessions overlay — searchable by title, id or date. */
const sessionRows = (query: string): SessionRow[] => {
  const metas = runtime.sessionSummaries();
  const q = query.trim().toLowerCase();
  const rows: SessionRow[] = [];
  for (const meta of metas) {
    const title = meta.title === "untitled" ? "new session" : meta.title;
    const updated = meta.updatedAt ? new Date(meta.updatedAt) : undefined;
    if (q) {
      const haystack = `${title} ${meta.id} ${updated ? updated.toISOString() : ""}`.toLowerCase();
      if (!haystack.includes(q)) continue;
    }
    rows.push({
      id: meta.id,
      title,
      updated: relativeTime(updated),
      count: meta.messageCount ?? 0,
    });
  }
  rows.sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
  return [{ id: "", title: "new session", updated: "", count: 0, isNew: true }, ...rows];
};


  // mouse reporting breaks tap-to-scroll on Android terminals (Termux, etc.):
  // default OFF there unless explicitly enabled
  const mouseMode =
    process.platform === "android"
      ? /^(1|on|true|yes)$/i.test(process.env.XMINAL_MOUSE ?? "")
      : !/^(0|off|false)$/i.test(process.env.XMINAL_MOUSE ?? "");
  // opencode's own placeholder samples (routes/home.tsx)
  const PLACEHOLDERS = [
    'Ask anything…  "Fix a TODO in the codebase"',
    'Ask anything…  "What is the tech stack of this project?"',
    'Ask anything…  "Fix broken tests"',
  ];
  let placeholderIdx = 0;
  let placeholderAt = 0;
  const bootStart = Date.now();
  let busy = false;
  let closed = false;
  let input = "";
  let cursor = 0;
  let scroll = 0;
  let overlay: Overlay = { kind: "none" };
  let paletteIndex = 0;
  let pendingPermission: { tool: string; reason: string; resolve: (allow: boolean) => void } | null = null;
  const lines: Line[] = [];

  // The frame is drawn exactly once per terminal row/column, so the size we
  // use must be the real one: drawing more lines than the screen has makes
  // the terminal scroll (the UI then vibrates). The minimums only guard
  // against a 0/undefined size when stdout is not a terminal.
  const cols = () => Math.max(20, process.stdout.columns || Number(process.env.COLUMNS) || 80);
  const rows = () => Math.max(8, process.stdout.rows || Number(process.env.LINES) || 24);
  const sidebarWidth = () => (cols() > 120 ? 42 : 0); // opencode SESSION_SIDEBAR_WIDTH, auto >120 cols
  const contentWidth = () => cols() - sidebarWidth();
  let ctxWindowMemo: { spec: string; value: number } | null = null;

  const wrap = (text: string, width: number): string[] => wrapAnsi(text, width);

  const formatCache = new Map<string, string>();
  const formatMemo = (text: string): string => {
    const hit = formatCache.get(text);
    if (hit !== undefined) return hit;
    const out = formatAssistantText(text);
    if (formatCache.size > 512) formatCache.clear();
    formatCache.set(text, out);
    return out;
  };
  const mdCache = new Map<string, string[]>();
  const mdMemo = (text: string, width: number): string[] => {
    const key = `${width}:${text}`;
    const hit = mdCache.get(key);
    if (hit) return hit;
    const out = renderMarkdown(text, { width: Math.max(4, width) });
    if (mdCache.size > 512) mdCache.clear();
    mdCache.set(key, out);
    return out;
  };
  const diffTint = (rows: string[]): string[] =>
    rows.map((row) => tintDiffRow(row, () => row, fgMuted, fgAccent, fgGreen, fgRed));
  const likelyDiff = isLikelyDiff;

  const styledLineFast = (line: Line): string[] => {
    const w = Math.max(8, contentWidth() - 2);
    const key = `${w}:${runtime.agent.mode}:${line.text}:${line.activity ? JSON.stringify(line.activity) : ""}`;
    const cached = line.rows?.get(key);
    if (cached) return cached;
    const out = renderStyledLine(line, w);
    (line.rows ??= new Map()).set(key, out);
    return out;
  };

  const renderStyledLine = (line: Line, w: number): string[] => {
    // ── tool activity — opencode: inline row (glyph col 3, label col 5) or a block card
    if (line.kind === "tool" && line.activity) {
      const a = line.activity;
      const block = a.name === "bash" || a.name === "git" || a.name === "worktree";
      if (block && a.status !== "pending" && a.output && a.output.length) {
        // opencode block tool: ┃ rule at content col 0, raised panel, text at col 3
        const cardW = Math.max(8, w);
        const cmd = toolTarget(a.name, a.argsRaw, cardW - 4);
        const rule = `${rgb(T.bg)}┃${RESET}`;
        const fill = bgRgb(T.panel);
        const card = (body: string) =>
          `${rule}${fill}  ${keepBg(fill, body)}${" ".repeat(Math.max(0, cardW - 4 - visible(body)))}${RESET}`;
        const rows: string[] = [];
        rows.push(`${rule}${fill}  ${fgText("$")} ${fgText(cmd)}${" ".repeat(Math.max(0, cardW - 4 - visible(cmd) - 2))}${RESET}`);
        for (const outLine of a.output.slice(0, 10)) {
          rows.push(card(a.status === "err" ? fgRed(outLine) : fgMuted(outLine)));
        }
        if (a.extraLines && a.extraLines > a.output.length - 1) {
          rows.push(card(fgMuted(`… ${a.extraLines - (a.output.length - 1)} more lines`)));
        }
        return rows;
      }
      // opencode: an edit/write diff is a block card (rule + raised panel)
      if (a.preview && a.preview.length) {
        const cardW = Math.max(8, w);
        const rule = `${rgb(T.bg)}┃${RESET}`;
        const fill = bgRgb(T.panel);
        const rows: string[] = [];
        for (const row of a.preview) {
          const tinted = tintDiffRow(row, () => row, fgMuted, fgAccent, fgGreen, fgRed);
          rows.push(`${rule}${fill} ${keepBg(fill, tinted)}${" ".repeat(Math.max(0, cardW - 2 - visible(tinted)))}${RESET}`);
        }
        if (a.extraPreviewLines) {
          rows.push(`${rule}${fill} ${fgMuted(`… ${a.extraPreviewLines} more diff lines`)}${" ".repeat(Math.max(0, cardW - 2 - 30))}${RESET}`);
        }
        return rows;
      }
      const out: string[] = renderActivity(a, Math.max(8, w - 5)).map((row) => `   ${row}`);
      if (a.status === "err" && a.detail) {
        out.push(`     ${fgMuted(redactSecrets(a.detail).text)}`);
      }
      return out;
    }
    // ── user — opencode: ┃ rule in the agent colour, raised fill, 2 col padding
    if (line.kind === "user") {
      const bar = modeColor(runtime.agent.mode);
      const inner = Math.max(4, w - 1);
      const textW = Math.max(4, inner - 4);
      const fill = bgRgb(T.panel);
      const padRow = `${bar}┃${fill}${" ".repeat(inner)}${RESET}`;
      const bodyRows = wrap(line.text, textW).map(
        (part) => `${bar}┃${fill}  ${rgb(T.text)}${part}${" ".repeat(Math.max(0, inner - 4 - visible(part)))}${RESET}`,
      );
      return [padRow, ...bodyRows, padRow];
    }
    // ── assistant — opencode: plain text at content col 3, markdown
    if (line.kind === "assistant") {
      const clean = formatMemo(line.text);
      const body = mdMemo(clean, Math.max(4, w - 3));
      return body.map((row) => `   ${row}`);
    }
    // ── reasoning — opencode: ┃ rule at col 3, body at col 5
    if (line.kind === "reasoning") {
      const inner = Math.max(4, w - 6);
      const rows = wrap(line.text, Math.max(4, inner));
      // opencode: the reasoning rule uses the warning colour
      return rows.map((part) => `   ${fgAmber("┃")} ${fgMuted(part)}`);
    }
    // ── everything else (ok/err/system) — quiet, indented at col 3
    const color = line.kind === "err" ? fgRed : line.kind === "ok" ? fgGreen : fgMuted;
    const safe = redactSecrets(line.text).text;
    const out: string[] = [];
    for (const part of wrap(safe, Math.max(4, w - 3))) {
      out.push(`   ${color(part)}`);
    }
    if ((line.kind === "ok" || line.kind === "err") && likelyDiff(line.text)) {
      return diffTint(out);
    }
    return out;
  };

  // ─── dynamic bottom layout — the input grows upward (max 4 lines) ───
  const inputBudget = () => Math.max(8, contentWidth() - 4);
  /** hard-wrap the raw input for display (ANSI-free); caret lives on the last line */
  const inputVisualLines = (): string[] => {
    const out: string[] = [];
    const budget = inputBudget();
    for (const logical of input.split("\n")) {
      if (!logical) { out.push(""); continue; }
      let rest = logical;
      while (rest.length > 0) {
        const slice = graphemeSlice(rest, budget);
        if (slice.columns === 0) break;
        out.push(slice.text);
        rest = rest.slice(slice.consumed);
      }
    }
    return out;
  };
  const inputH = () => Math.min(4, Math.max(1, inputVisualLines().length));
  // opencode frame (top → bottom): session tab rail · conversation ·
  // composer band (pad + textarea + pad + metadata) · ╹/▀ strip · footer line
  const composerHeight = () => inputH() + 3;
  const composerTop = () => Math.max(1, rows() - composerHeight() - 2);
  const stripRow = () => composerTop() + composerHeight();
  const footerRow = () => rows() - 1;
  const tabRow = () => 0;
  // opencode pads the session column by 2 (1 on narrow terminals)
  const padCols = () => (cols() < 44 ? 1 : 2);
  const mainW = () => Math.max(20, contentWidth() - padCols());
  /** ~/dir style path for the footer, like opencode shows it */
  const shortCwd = (): string => {
    const home = process.env.HOME ?? "";
    if (home && cwd.startsWith(home)) return "~" + cwd.slice(home.length);
    return cwd;
  };

  const ctxPct = (): number => {
    const spec = runtime.agent.modelSpec;
    if (ctxWindowMemo?.spec !== spec) {
      let value = 128000;
      try { value = resolveModel(runtime.config, spec).contextWindow ?? 128000; } catch { /* keep fallback */ }
      ctxWindowMemo = { spec, value };
    }
    const used = runtime.agent.getContextTokens();
    return Math.min(100, Math.round((100 * used) / (ctxWindowMemo?.value ?? 128000)));
  };

  const styledLine = styledLineFast;
  const clampScroll = (target: number) =>
    Math.min(Math.max(0, target), Math.max(0, renderChatLines().length - composerTop() + 1));

  let lineVersion = 0;
  let chatCache: { version: number; rows: string[] } = { version: -1, rows: [] };
  const renderChatLines = (): string[] => {
    if (chatCache.version === lineVersion) return chatCache.rows;
    const out: string[] = [];
    for (const line of lines) out.push(...styledLine(line));
    chatCache = { version: lineVersion, rows: out };
    return out;
  };

  // ── opencode home — gradient logo + tagline when the chat is empty ──
  const GRADIENT: ReadonlyArray<readonly [number, number, number]> = [
    [134, 225, 252], [115, 180, 255], [130, 170, 255],
    [139, 140, 247], [187, 154, 247], [192, 153, 255],
  ];
  const LOGO = [
    "██╗  ██╗███╗   ███╗██╗███╗   ██╗ █████╗ ██╗     ",
    "╚██╗██╔╝████╗ ████║██║████╗  ██║██╔══██╗██║     ",
    " ╚███╔╝ ██╔████╔██║██║██╔██╗ ██║███████║██║     ",
    " ██╔██╗ ██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║     ",
    "██╔╝ ██╗██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗",
    "╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝ ╚═══╝╚═╝  ╚═╝╚══════╝",
  ];
  const homeLines = (): string[] => {
    const cw = contentWidth();
    if (cw < 60) {
      return [`${fgAccent(BOLD + "xminal" + RESET)}  ${fgMuted("every coding agent")}`];
    }
    return [...LOGO.map((l, i) => `${rgb(GRADIENT[i])}${l}${RESET}`), "", fgMuted("E V E R Y  C O D I N G  A G E N T .  O N E  T E R M I N A L .")];
  };
  const renderHomeRow = (row: number, limit: number): string => {
    const cw = contentWidth();
    const block = homeLines();
    const bootT = Math.min(1, (Date.now() - bootStart) / 1200);
    const visibleRows = Math.ceil(bootT * block.length);
    const startRow = Math.max(0, Math.floor((limit - block.length) / 2));
    const idx = row - startRow;
    if (idx < 0 || idx >= block.length) return `${bgRgb(T.bg)}${" ".repeat(cw)}${RESET}`;
    if (idx >= visibleRows) return `${bgRgb(T.bg)}${" ".repeat(cw)}${RESET}`; // reveal animates downward
    const line = block[idx];
    const left = Math.floor(Math.max(0, (cw - visible(line)) / 2));
    return `${bgRgb(T.bg)}${" ".repeat(left)}${line}${bgRgb(T.bg)}${" ".repeat(Math.max(0, cw - left - visible(line)))}${RESET}`;
  };

  // build base frame rows; overlay draws on top
  const renderRow = (row: number): string => {
    const cw = contentWidth();
    const pad = padCols();
    const mw = mainW();
    const chatLinesPreview = renderChatLines();
    const homeMode = chatLinesPreview.length === 0 && !busy;
    // every main-column row starts after opencode's scroll padding
    // every cell of the session column is painted with the theme background
    const withSide = (inner: string): string => {
      const painted = `${bgRgb(T.bg)}${" ".repeat(pad)}${inner}${bgRgb(T.bg)}${" ".repeat(Math.max(0, cw - pad - visible(inner)))}${RESET}`;
      if (homeMode || sidebarWidth() === 0) return painted;
      return painted + renderSidebarRow(row);
    };
    const top = composerTop();
    const cH = composerHeight();
    const iH = inputH();
    const inner = Math.max(4, mw - 1);          // after the left rule
    const agent = modeColor(runtime.agent.mode);
    // ── session tab rail (opencode): the session name as a tab, then "+"
    if (row === tabRow()) {
      const title = sessionTitle.slice(0, Math.max(8, Math.floor(mw / 3)));
      const tab = ` ${title} `;
      const rest = Math.max(0, mw - visible(tab) - 2);
      return withSide(`${bgRgb(T.panel2)}${BOLD}${fgText(tab)}${RESET}${fgMuted(" +")}${bgRgb(T.bg)}${" ".repeat(rest)}${RESET}`);
    }
    // ── composer band — opencode: ┃ rule, raised fill, textarea, metadata row
    if (row >= top && row < top + cH) {
      const rel = row - top;
      const rule = `${agent}┃${RESET}`;
      const fill = bgRgb(T.composer);
      const blank = `${rule}${fill}${" ".repeat(inner)}${RESET}`;
      const compLine = (body: string) =>
        `${rule}${fill}  ${keepBg(fill, body)}${" ".repeat(Math.max(0, inner - 2 - visible(body)))}${RESET}`;
      if (rel === 0) return withSide(blank);                      // paddingTop
      if (rel === cH - 1) {
        // metadata row — agent · model · provider · variant (opencode order)
        const mode = runtime.agent.mode;
        const label = mode.charAt(0).toUpperCase() + mode.slice(1);
        const model = (runtime.agent.modelSpec.split("/").pop() ?? runtime.agent.modelSpec).slice(0, Math.max(12, Math.floor(mw / 2)));
        const provider = runtime.agent.modelSpec.split("/")[0] ?? "";
        const variant = getEffort();
        const tokens = [
          `${agent}${BOLD}${label}${RESET}`,
          `${fgMuted(" · ")}${fgText(model)}${provider ? ` ${fgMuted(provider)}` : ""}`,
          variant ? `${fgMuted(" · ")}${fgYellow(BOLD + variant + RESET)}` : "",
        ].join("");
        const right = queue.length > 0 ? fgAmber(`⇧${queue.length} queued`) : "";
        const gap = Math.max(1, inner - 2 - visible(tokens) - visible(right));
        return withSide(`${rule}${fill}  ${keepBg(fill, tokens)}${" ".repeat(gap)}${keepBg(fill, right)}${RESET}`);
      }
      if (pendingPermission && rel === cH - 2) {
        const p = pendingPermission;
        const text = `${fgAmber("?")} allow ${p.tool}${p.reason ? fgMuted(" · " + p.reason) : ""} ${fgAccent("[y/N]")}`;
        return withSide(compLine(text));
      }
      if (input === "" && !pendingPermission) {
        if (rel === 1) {
          const nowTs = Date.now();
          if (nowTs - placeholderAt > 4000) {
            placeholderAt = nowTs;
            placeholderIdx = (placeholderIdx + 1) % PLACEHOLDERS.length;
          }
          return withSide(compLine(fgMuted(PLACEHOLDERS[placeholderIdx])));
        }
        return withSide(blank);
      }
      const vis = inputVisualLines();
      const shown = vis.slice(Math.max(0, vis.length - iH));
      const r = rel - 1;
      const isLastLine = r === iH - 1;
      const visLine = (shown[r] ?? "") + (isLastLine ? fgAccent("▌") : "");
      return withSide(compLine(`${rgb(T.text)}${visLine}`));
    }
    // ── the row that closes the composer — opencode draws a blank row here
    //    (its ╹/▀ notch only appears with a translucent prompt background)
    if (row === stripRow()) {
      return withSide(`${bgRgb(T.bg)}${" ".repeat(mw)}${RESET}`);
    }
    // ── footer — opencode: workspace + branch left, usage + hints right
    if (row === footerRow()) {
      const cost = runtime.agent.getCost();
      const usage = `${(runtime.agent.getContextTokens() / 1000).toFixed(1)}K (${ctxPct()}%)`;
      const left = busy
        ? `${fgCyan(SPINNER_FRAMES[spinnerTick % SPINNER_FRAMES.length])} ${fgText("esc")} ${fgMuted("interrupt")}`
        : scroll > 0
          ? fgAmber(`▲ ${scroll} lines up — PgDn to tail`)
          : fgMuted(`${shortCwd()}${branch ? `:${branch}` : ""}`);
      const hint = (k: string, label: string) => `${BOLD}${fgText(k)}${RESET} ${fgMuted(label)}`;
      const hints = cw >= 64 ? `${hint("shift+tab", "agents")}  ${hint("ctrl+p", "commands")}` : cw >= 44 ? hint("ctrl+p", "commands") : "";
      const usageText = `${fgMuted(usage)} · ${fgMuted(`$${cost.costUsd.toFixed(4)}`)}`;
      const right = cw >= 44 ? `${usageText}  ${hints}` : cw >= 28 ? usageText : "";
      const gap = Math.max(1, mw - visible(left) - visible(right));
      return withSide(`${left}${" ".repeat(gap)}${right}`);
    }
    // ── chat area (or opencode home) — sits under the tab rail
    const chatTop = tabRow() + 1;
    const chatH = Math.max(1, top - chatTop);
    if (row < chatTop) return withSide(`${bgRgb(T.bg)}${" ".repeat(mw)}${RESET}`);
    if (homeMode) {
      return withSide(renderHomeRow(row - chatTop, chatH));
    }
    const end = Math.max(0, chatLinesPreview.length - scroll);
    const start = Math.max(0, end - chatH);
    const line = chatLinesPreview[start + (row - chatTop)] ?? "";
    return withSide(line);
  };

  const todoMarker = (status: string): string =>
    status === "completed" ? fgGreen("✓") : status === "in_progress" ? fgAmber("◐") : status === "blocked" ? fgRed("✗") : fgMuted("○");

  const renderSidebarRow = (row: number): string => {
    const w = sidebarWidth();
    const line = (t: string) => `${bgRgb(T.panel)}${keepBg(bgRgb(T.panel), padRight(" " + t, w))}${RESET}`;
    const heading = (t: string) => line(`${BOLD}${fgText(t)}${RESET}`);
    switch (row) {
      case 0: return line(`${BOLD}${fgText(sessionTitle.slice(0, Math.max(4, w - 2)))}${RESET}`);
      case 1: return line(branch ? fgMuted(`⎇ ${branch}`) : "");
      // opencode shows the context window first
      case 3: return heading("Context");
      case 4: return line(fgText(`${runtime.agent.getContextTokens().toLocaleString("en-US")} tokens in prompt`));
      case 5: return line(fgMuted(`${ctxPct()}% of the window`));
      case 6: return line(fgMuted(`$${runtime.agent.getCost().costUsd.toFixed(4)} spent this session`));
      case 8: return heading("Todo");
      case 9: case 10: case 11: case 12: case 13: case 14: {
        const i = row - 9;
        if (todos.length === 0) return row === 9 ? line(fgMuted("(none)")) : line("");
        const shown = todos.slice(0, 6);
        if (i < shown.length) {
          const t = shown[i];
          const text = t.text.length > w - 4 ? t.text.slice(0, Math.max(1, w - 5)) + "…" : t.text;
          const done = t.status === "completed";
          return line(`${todoMarker(t.status)} ${done ? fgMuted(text) : fgText(text)}`);
        }
        if (i === shown.length && shown.length < todos.length) return line(fgMuted(`… ${todos.length - shown.length} more`));
        return line("");
      }
      case 16: return heading("Session");
      case 17: return line(fgMuted(`${shortId} · ${cwd.split("/").pop() ?? cwd}`));
      case 19: return heading("Skills & MCP");
      case 20: return line(fgText(`${runtime.skills.list().length} skills`) + fgMuted(" · ") + fgText(`${runtime.mcp.listServerNames().length} MCP`));
      default: return line("");
    }
  };

  const render = () => {
    const w = cols();
    const r = rows();
    const frame: string[] = [];
    for (let row = 0; row < r; row++) frame.push(renderRow(row));
    if (overlay.kind !== "none") drawOverlay(frame, overlay);
    // One write, and no newline after the last row.
    //
    // A frame that ends with a newline on the bottom row makes the terminal
    // scroll by one line — the whole screen then shifts up on every repaint,
    // which reads as a vibration/flicker. Ending the frame on the last row
    // keeps it exactly screen-height: the UI is locked to the viewport.
    let out = "\x1b[H";
    for (let i = 0; i < frame.length; i++) {
      out += clip(frame[i], w) + "\x1b[K";
      if (i < frame.length - 1) out += "\r\n";
    }
    process.stdout.write(out);
  };

  // coalesce a burst of streaming tokens into a single frame — avoids repaint storms on slow terminals
  let renderTimer: ReturnType<typeof setTimeout> | null = null;
  let renderPending = false;
  const requestRender = () => {
    if (renderTimer) { renderPending = true; return; }
    renderTimer = setTimeout(() => {
      renderTimer = null;
      renderPending = false;
      render();
    }, 30);
  };
  const flushRender = () => {
    if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
    if (renderPending) { renderPending = false; render(); }
  };

  // ─── overlay rendering ────────────────────────────────────────────
  const drawOverlay = (frame: string[], ov: Overlay) => {
    const r = rows(), w = cols();
    const dim = (s: string) => `${rgb(C.muted)}${s}${RESET}`;
    const blankRow = (y: number, innerW: number) => {
      if (y < 0 || y >= r) return;
      frame[y] = `${rgb(C.border)}│${RESET}${bgRgb(C.panel)}${" ".repeat(innerW)}${RESET}${rgb(C.border)}│${RESET}`;
    };

    if (ov.kind === "palette" || ov.kind === "model" || ov.kind === "provider") {
      const title = ov.kind === "palette" ? "Commands" : ov.kind === "model" ? `Models${modelScope ? ` — ${modelScope}` : " — all providers"}` : "Providers";
      const pBottom = ov.kind === "palette"
        ? `${fgMuted("↑↓ select  ·  type to filter  ·  PgUp/PgDn scroll  ·  Enter run  ·  Esc close")}`
        : ov.kind === "model"
          ? `${fgMuted("↑↓ select  ·  type to filter  ·  PgUp/PgDn scroll  ·  Enter choose  ·  Ctrl+S toggle scope  ·  Esc close")}`
          : `${fgMuted("↑↓ select  ·  PgUp/PgDn scroll  ·  Enter choose  ·  Esc close")}`;
      const q = input.toLowerCase();
      const items: Array<{ a: string; b: string }> =
        ov.kind === "palette"
          ? COMMANDS.filter((c) => c.name.startsWith(q) || (q.length > 1 && c.name.includes(q)))
              .map((c) => ({ a: `${fgAmber(c.name.padEnd(14))}`, b: `${sectionLabel(c.group)}  ${c.desc}` }))
            : ov.kind === "model"
            ? (() => {
                const q = (ov.query ?? "").toLowerCase();
                const map = modelMap();
                const inner = Math.max(20, Math.min(cols() - 6, 82) - 2);
                return filteredModels(q).map((m) => {
                  const cfg = map[`${m.provider}/${m.model}`] ?? map[m.alias];
                  // the alias always gets the room it needs — optional tags drop
                  // from the right (provider → context → price) before it is cut
                  const freeTag = m.free ? " FREE" : "";
                  const ctxTag = ctxLabel(cfg?.contextWindow) ? ` ${ctxLabel(cfg?.contextWindow)}` : "";
                  const priceTag = priceLabel(cfg) ? ` ${priceLabel(cfg)}` : "";
                  const provTag = ` ${m.provider}`;
                  let alias = m.alias;
                  let tail = ctxTag + priceTag + provTag;
                  if (alias.length + freeTag.length + tail.length > inner) tail = ctxTag + priceTag;
                  if (alias.length + freeTag.length + tail.length > inner) tail = priceTag;
                  if (alias.length + freeTag.length + tail.length > inner) tail = "";
                  if (alias.length + freeTag.length + tail.length > inner) {
                    const room = Math.max(10, inner - freeTag.length - 1);
                    if (alias.length > room) alias = alias.slice(0, room - 1) + "…";
                  }
                  const left = `${fgAccent(alias)}${m.free ? fgGreen(freeTag) : ""}`;
                  const right = fgMuted(tail);
                  return { a: left, b: right };
                });
              })()
            : PROVIDERS.map((p) => {
                const ready = providerIsReady(p.key, runtime.config.providers);
                const dot = ready ? fgGreen("+") : fgMuted("-");
                const tag = `${kindLabel(p.kind).padEnd(5)}`;
                return { a: `${dot} ${fgText(p.label.padEnd(28))}`, b: `${fgMuted(tag)}  ${ready ? fgGreen("ready") : p.env ? fgMuted(p.env) : fgGreen("no key needed")}` };
              });
      if (items.length === 0) {
        items.push({ a: fgMuted(`no matches${input ? ` for "${input.slice(0, 40)}"` : ""}`), b: "" });
      }
      const height = Math.min(r - 4, 18);
      const { width, top, left, height: h } = centerPanel(r, w, height);
      const innerW = width - 2;
      const titleRow = panelBorder(title, width - 2);
      const visibleItems = h - 3;
      const maxIndex = Math.max(0, items.length - 1);
      const ovIndex = Math.min(ov.kind === "model" || ov.kind === "palette" ? paletteIndex : ov.index, maxIndex);
      const startIdx = Math.max(0, Math.min(Math.max(0, items.length - visibleItems), ovIndex - Math.floor(visibleItems / 2)));

      const lines: string[] = [];
      lines.push(titleRow);
      for (let i = startIdx; i < Math.min(items.length, startIdx + visibleItems); i++) {
        const selected = i === ovIndex;
        const row = `${selected ? bgRgb(C.panel3) : ""}${items[i].a}${selected ? " " : ""}${items[i].b}`;
        const cleaned = selected ? `${bgRgb(C.panel3)}${BOLD}${stripAnsi(items[i].a)} ${stripAnsi(items[i].b)}${RESET}` : row;
        lines.push(panelSide(cleaned, innerW, C.panel));
      }
      for (let i = startIdx + visibleItems; i < startIdx + visibleItems; i++) blankRow(0, innerW);
      while (lines.length < h - 1) lines.push(panelSide("", innerW, C.panel));
      lines.push(panelSide(pBottom, innerW, C.panel));
      if (lines.length > h) lines.length = h;

      for (let i = 0; i < lines.length; i++) {
        const y = top + i;
        frame[y] = overlayDim(lines[i], y, r, left, width, ov);
      }
      return;
    }

    if (ov.kind === "sessions") {
      const rows = sessionRows(ov.query);
      const { width, top, left } = centerPanel(r, w, Math.min(r - 4, 18));
      const innerW = width - 2;
      const lines: string[] = [];
      lines.push(panelBorder(`Sessions${ov.query ? ` — ${ov.query}` : ""}`, innerW));
      lines.push(panelSide(`${fgMuted(`${Math.max(0, rows.length - 1)} saved · type to search · Enter to switch`)}`, innerW, C.panel));
      const visible = Math.max(1, Math.min(12, r - 8));
      const maxIndex = Math.max(0, rows.length - 1);
      const index = Math.min(paletteIndex, maxIndex);
      ov.index = index;
      const start = Math.max(0, Math.min(Math.max(0, rows.length - visible), index - Math.floor(visible / 2)));
      for (let i = start; i < Math.min(rows.length, start + visible); i++) {
        const row = rows[i];
        const selected = i === index;
        const title = row.title.length > 28 ? row.title.slice(0, 27) + "…" : row.title;
        const line = row.isNew
          ? `${fgGreen("+")}  ${fgAccent("new session")}`
          : `${fgText(title.padEnd(28))}${fgMuted(row.id.slice(-6))}  ${fgMuted(row.updated.padEnd(9))}${fgMuted(`  ${row.count} msg`)}`;
        lines.push(panelSide(selected ? `${bgRgb(C.panel3)}${line}${RESET}` : line, innerW, C.panel));
      }
      if (rows.length <= 1) lines.push(panelSide(`${fgMuted("no sessions yet")}`, innerW, C.panel));
      lines.push(panelSide(`${fgMuted("↑↓ select · type to search · Enter open · Esc close")}`, innerW, C.panel));
      lines.push(panelBottom(width));
      for (let i = 0; i < lines.length; i++) {
        const y = top + i;
        if (y < 0 || y >= r) continue;
        frame[y] = lines[i];
      }
      return;
    }

    if (ov.kind === "mcp") {
      const catalog = loadMcpCatalog();
      const hits = searchMcpServers(ov.query, { limit: 300 });
      const { width, top, left } = centerPanel(r, w, Math.min(r - 4, 18));
      const innerW = width - 2;
      const lines: string[] = [];
      lines.push(panelBorder(`MCP catalog${ov.query ? ` — ${ov.query}` : ""}`, innerW));
      if (!catalog) {
        lines.push(panelSide(`${fgMuted("catalog missing — run scripts/fetch-mcp-catalog.py")}`, innerW, C.panel));
      } else {
        lines.push(panelSide(`${fgMuted(`${catalog.count} servers · search by name, work or platform`)}`, innerW, C.panel));
        const visible = Math.max(1, Math.min(12, r - 8));
        const maxIndex = Math.max(0, hits.length - 1);
        const index = Math.min(paletteIndex, maxIndex);
        ov.index = index;
        const start = Math.max(0, Math.min(Math.max(0, hits.length - visible), index - Math.floor(visible / 2)));
        const workW = Math.max(10, innerW - 44);
        for (let i = start; i < Math.min(hits.length, start + visible); i++) {
          const entry = hits[i];
          const selected = i === index;
          const name = entry.name.length > 26 ? entry.name.slice(0, 25) + "…" : entry.name;
          const platforms = entry.platforms.map((p) => p.toUpperCase()).join("/");
          const work = entry.work.length > workW ? entry.work.slice(0, workW - 1) + "…" : entry.work;
          const row = `${fgAccent(name.padEnd(26))}${fgMuted(work.padEnd(workW))}  ${fgCyan(platforms)}`;
          lines.push(panelSide(selected ? `${bgRgb(C.panel3)}${row}${RESET}` : row, innerW, C.panel));
        }
        if (hits.length === 0) lines.push(panelSide(`${fgMuted("no matches")}`, innerW, C.panel));
      }
      lines.push(panelSide(`${fgMuted("↑↓ select · type to filter · Enter details · Ctrl+A add to config · Esc close")}`, innerW, C.panel));
      lines.push(panelBottom(width));
      for (let i = 0; i < lines.length; i++) {
        const y = top + i;
        if (y < 0 || y >= r) continue;
        frame[y] = lines[i];
      }
      return;
    }

    if (ov.kind === "provider-key") {
      const entry = ov.entry;
      const height = 8;
      const { width, top, left } = centerPanel(r, w, height);
      const innerW = width - 2;
      const lines: string[] = [];
      lines.push(panelBorder(`Connect ${entry.label}`, width - 2));
      lines.push(panelSide(sectionLabel("API key"), innerW, C.panel));
      const visibleKey = ov.input.length > (innerW - 6) ? maskKey(ov.input).slice(-(innerW - 6)) : maskKey(ov.input);
      lines.push(panelSide(`${fgAccent("│")} ${padRight(fgText(visibleKey), innerW - 4)}${RESET}`, innerW, C.panel));
      lines.push(panelSide("", innerW, C.panel));
      lines.push(panelSide(`${fgMuted("Get your key:")} ${fgAccent(entry.baseUrl)}`, innerW, C.panel));
      lines.push(panelSide("", innerW, C.panel));
      lines.push(panelSide(`${fgMuted("Enter = validate & save  ·  Esc = back")}`, innerW, C.panel));
      lines.push(panelBottom(width));
      for (let i = 0; i < lines.length; i++) {
        frame[top + i] = overlayDim(lines[i], top + i, r, left, width, ov);
      }
      return;
    }

    if (ov.kind === "provider-test") {
      const height = 7;
      const { width, top, left } = centerPanel(r, w, height);
      const innerW = width - 2;
      const statusLine =
        ov.status === "working" ? `${warn("* validating...")} ${fgMuted("(pinging " + ov.entry.baseUrl + ")")}`
        : ov.status === "ok" ? `${ok("✓ key saved")} ${fgMuted("· default model " + ov.entry.defaultModel)}`
        : `${err("✗ " + friendlyValidateError(ov.message))}`;
      const lines = [
        panelBorder(`Connect ${ov.entry.label}`, width - 2),
        panelSide("", innerW, C.panel),
        panelSide(statusLine, innerW, C.panel),
        panelSide("", innerW, C.panel),
        panelSide(`${fgMuted(ov.status === "ok" ? "Enter to continue  ·  Esc to stay" : "Esc to go back")}`, innerW, C.panel),
        panelSide("", innerW, C.panel),
        panelBottom(width),
      ];
      for (let i = 0; i < lines.length; i++) {
        frame[top + i] = overlayDim(lines[i], top + i, r, left, width, ov);
      }
      return;
    }

    if (ov.kind === "mode") {
      const modes: AgentMode[] = ["build", "plan", "compose", "review", "yolo"];
      const height = modes.length + 4;
      const { width, top, left } = centerPanel(r, w, height);
      const innerW = width - 2;
      const lines = [
        panelBorder("Agent mode", innerW),
        panelSide(`${fgMuted("Pick the agent mode for this session:")}`, innerW, C.panel),
      ];
      modes.forEach((mode, i) => {
        const selected = i === ov.index;
        const current = mode === runtime.agent.mode;
        const label = current ? `${mode}  (current)` : mode;
        const marker = selected ? `${bgRgb(C.panel3)}${fgAccent(BOLD + " › " + label.padEnd(18))}${RESET}` : `   ${fgText(label)}`;
        lines.push(panelSide(marker, innerW, C.panel));
      });
      lines.push(panelSide("", innerW, C.panel));
      lines.push(panelSide(`${fgMuted("↑↓ select  ·  Enter set  ·  Esc cancel  ·  Tab cycles")}`, innerW, C.panel));
      lines.push(panelBottom(width));
      for (let i = 0; i < lines.length; i++) {
        frame[top + i] = overlayDim(lines[i], top + i, r, left, width, ov);
      }
      return;
    }

    if (ov.kind === "variant") {
      const height = EFFORTS.length + 4;
      const { width, top, left } = centerPanel(r, w, height);
      const innerW = width - 2;
      const lines = [
        panelBorder("Effort", innerW),
        panelSide(`${fgMuted("Max output tokens per turn (reasoning budget):")}`, innerW, C.panel),
      ];
      const labels = ["low    · 1024", "medium · 4096", "high   · 16384", "max    · full"];
      EFFORTS.forEach((effort, i) => {
        const selected = i === ov.index;
        const marker = selected ? `${bgRgb(C.panel3)}${fgAccent(BOLD + " › " + labels[i].padEnd(16))}${RESET}` : `   ${fgText(labels[i])}`;
        lines.push(panelSide(marker, innerW, C.panel));
      });
      lines.push(panelSide("", innerW, C.panel));
      lines.push(panelSide(`${fgMuted("↑↓ select  ·  Enter set  ·  Esc cancel")}`, innerW, C.panel));
      lines.push(panelBottom(width));
      for (let i = 0; i < lines.length; i++) {
        frame[top + i] = overlayDim(lines[i], top + i, r, left, width, ov);
      }
      return;
    }
  };

  // Panel lines are written over the base frame; the base frame is already fully rendered.
  const overlayDim = (line: string, _y: number, _rows: number, _left: number, _width: number, _ov: Overlay): string => line;

  // ─── agent plumbing ──────────────────────────────────────────────
  const firstLine = (t: string) => t.split("\n")[0] ?? "";
  // pending prompts typed while the agent is busy — drained FIFO after each run
  const queue: string[] = [];
  let spinnerTimer: ReturnType<typeof setInterval> | null = null;
  let spinnerTick = 0;
  const startSpinner = () => {
    if (spinnerTimer) return;
    spinnerTimer = setInterval(() => {
      spinnerTick++;
      if (busy) render();
      else {
        if (spinnerTimer) clearInterval(spinnerTimer);
        spinnerTimer = null;
      }
    }, 90);
  };
  const stopSpinner = () => {
    if (spinnerTimer) clearInterval(spinnerTimer);
    spinnerTimer = null;
    spinnerTick = 0;
  };
  const pendingToolIdx: number[] = [];
  const pushLine = (kind: LineKind, text: string) => {
    lineVersion++;
    lines.push({ kind, text });
    // keep the user's anchor while they are scrolled up — the viewport must
    // not jump to the bottom just because a tool printed something
    if (scroll > 0) scroll += 1;
    if (kind === "err") logEvent("error", stripAnsiW(text));
    render();
  };
  const appendAssistant = (text: string) => {
    lineVersion++;
    const last = lines[lines.length - 1];
    if (last && last.kind === "assistant") {
      last.text += text;
      requestRender();
    } else {
      pushLine("assistant", text);
    }
  };

  const callbacks: AgentCallbacks = {
    onText: (t) => appendAssistant(t),
    onReasoning: (t) => {
      const last = lines[lines.length - 1];
      if (last && last.kind === "reasoning") {
        lines[lines.length - 1] = { ...last, text: last.text + t };
        lineVersion++;
        requestRender();
        return;
      }
      pushLine("reasoning", t);
    },
    onToolCall: (call) => {
      const activity = makeActivity(call.name, call.arguments);
      lineVersion++;
      lines.push({ kind: "tool", text: "", activity });
      pendingToolIdx.push(lines.length - 1);
      if (scroll > 0) scroll += 1;
      render();
    },
    onToolResult: (name, r) => {
      // pair with the oldest pending call of the same name (FIFO)
      let slot = pendingToolIdx.findIndex((i) => lines[i].activity?.name === name);
      if (slot === -1) slot = 0;
      const at = pendingToolIdx.splice(slot, 1)[0];
      const target = at !== undefined ? lines[at] : undefined;
      if (target?.activity) {
        lineVersion++;
        target.activity = completeActivity(target.activity, Boolean(r.isError), String(r.content ?? ""));
        render();
        return;
      }
      pushLine(r.isError ? "err" : "ok", firstLine(String(r.content ?? "")).slice(0, 160));
    },
    onStatus: (m) => pushLine("system", m),
    onUsage: () => requestRender(),
  };
  runtime.agent.setCallbacks?.(callbacks);

  const close = () => {
    if (closed) return;
    closed = true;
    process.stdout.write((mouseMode ? "\x1b[?1000l\x1b[?1006l" : "") + "\x1b[?1049l\x1b[?25h\x1b[0m\n");
    runtime.close();
    process.exit(0);
  };

  const askPermission = (tool: string, reason?: string): Promise<boolean> =>
    new Promise((resolve) => {
      pendingPermission = { tool, reason: reason ?? "", resolve };
      render();
    });
  runtime.setAskHandler(askPermission);

  // effort level — drives the per-turn output budget (low/medium/high/max)
  // default from XMINAL_DEFAULT_EFFORT or the agent's own default ("max")
  const normalizeEffort = (value: string): "low" | "medium" | "high" | "max" =>
    ["low", "medium", "high", "max"].includes(value as "low" | "medium" | "high" | "max") ? (value as "low" | "medium" | "high" | "max") : "max";
  try {
    const raw = process.env.XMINAL_DEFAULT_EFFORT;
    if (raw) runtime.agent.setEffort(normalizeEffort(raw));
  } catch { /* ignore */ }
  const getEffort = () => runtime.agent.effort;

  const setEffort = (effort: string) => {
    runtime.setEffort(normalizeEffort(effort));
    pushLine("ok", `effort → ${effort} (max ${["1024","4096","16384","∞"][["low","medium","high","max"].indexOf(effort)] ?? ""} output tokens this turn)`);
  };

  // ─── session switching ────────────────────────────────────────────
  const switchSession = (options: { sessionId?: string; newSession?: boolean }): void => {
    const previous = runtime;
    const next = new Runtime(
      previous.cwd,
      {
        mode: previous.agent.mode,
        model: previous.agent.modelSpec,
        sessionId: options.sessionId,
        newSession: options.newSession,
        callbacks,
        askHandler: undefined,
      },
    );
    next.setAskHandler(askPermission);
    runtime = next;
    sessionTitle = next.session.meta.title === "untitled" ? "new session" : next.session.meta.title;
    shortId = next.session.id.slice(0, 8);
    todos = loadTodos(cwd);
    previous.close();
  };

  // ─── classic commands, rendered into the TUI transcript ──────────
  const tuiRenderer = {
    banner: () => undefined,
    userPrompt: () => undefined,
    assistantStart: () => undefined,
    text: (chunk: string) => pushLine("system", chunk),
    reasoning: (chunk: string) => pushLine("reasoning", chunk),
    toolCall: (call: { name: string; arguments: string }) => pushLine("system", `${fgMuted(`→ ${call.name}`)}`),
    toolResult: (name: string, result: { isError?: boolean; content?: string }) =>
      pushLine(result.isError ? "err" : "ok", `${name}: ${firstLine(String(result.content ?? ""))}`),
    usage: () => undefined,
    status: (message: string) => pushLine("system", fgMuted(message)),
    info: (message: string) => pushLine("system", message),
    success: (message: string) => pushLine("ok", message),
    warn: (message: string) => pushLine("system", fgAmber(message)),
    error: (message: string) => pushLine("err", message),
    costLine: () => "",
    flush: () => undefined,
  } as unknown as Renderer;

  /** Run a classic slash command inside the TUI (no alternate-screen exit). */
  const runClassicInTui = async (cmdLine: string): Promise<void> => {
    try {
      await handleCommand(cmdLine, {
        runtime,
        renderer: tuiRenderer,
        cwd,
        exit: () => close(),
        restart: (options) => {
          switchSession(options ?? {});
          lines.length = 0;
          pushLine("system", `${fgGreen("session switched")} ${fgMuted(`· ${shortId}`)}`);
          render();
        },
        ask: async (question: string) => {
          pushLine("system", fgMuted(`? ${question}`));
          return "";
        },
      });
    } catch (error) {
      pushLine("err", (error as Error).message);
    }
    render();
  };

  // ─── command execution ───────────────────────────────────────────
  const runCommandLine = (cmdLine: string): boolean => {
    const parts = cmdLine.trim().split(/\s+/);
    const name = parts[0].toLowerCase();
    if (name === "/exit" || name === "/quit") { close(); return true; }
    if (name === "/report" || name === "/issue") {
      const url = "https://github.com/quitsaurabhverma2008-sketch/xminal/issues/new";
      pushLine("system", `report bugs: ${url}`);
      openExternal(url);
      return true;
    }
    if (name === "/clear") { lines.length = 0; input = ""; cursor = 0; render(); return true; }
    if (name === "/help" || name === "/?") { overlay = { kind: "palette", index: 0 }; paletteIndex = 0; input = ""; cursor = 0; render(); return true; }
    if (name === "/model") { modelScope = modelScopeOfSpec(runtime.agent.modelSpec); overlay = { kind: "model", query: "", index: 0 }; paletteIndex = 0; input = ""; cursor = 0; render(); return true; }
    if (name === "/provider" || name === "/connect" || name === "/set-key") { overlay = { kind: "provider", index: 0 }; input = ""; cursor = 0; render(); return true; }
    if (name === "/mode") {
      const modes: AgentMode[] = ["build", "plan", "compose", "review", "yolo"];
      const current = modes.indexOf(runtime.agent.mode);
      overlay = { kind: "mode", index: current < 0 ? 0 : current };
      paletteIndex = overlay.index;
      input = "";
      cursor = 0;
      render();
      return true;
    }
    if (name === "/variant" || name == "/effort" || name === "/reasoning") { overlay = { kind: "variant", index: 3 }; input = ""; cursor = 0; render(); return true; }
    if (name === "/mcp") { overlay = { kind: "mcp", query: "", index: 0 }; input = ""; cursor = 0; render(); return true; }
    if (name === "/new") {
      switchSession({ newSession: true });
      lines.length = 0;
      pushLine("system", `${fgGreen("new session")} ${fgMuted(`· ${shortId.slice(-6)}`)}`);
      render();
      return true;
    }
    if (name === "/rename") {
      const title = parts.slice(1).join(" ").trim();
      if (!title) { pushLine("system", fgMuted("usage: /rename <new title>")); render(); return true; }
      runtime.session.setTitle(title);
      sessionTitle = title;
      pushLine("system", `${fgGreen("renamed")} ${fgMuted(`· ${title}`)}`);
      render();
      return true;
    }
    if (name === "/undo") {
      const undone = runtime.session.undoLast();
      pushLine("system", undone ? `${fgGreen("undone")} ${fgMuted(`${undone.id} · ${undone.restored} file(s) restored`)}` : fgMuted("no checkpoints to undo"));
      render();
      return true;
    }
    if (name === "/checkpoints") {
      const points = runtime.session.listCheckpoints();
      if (points.length === 0) pushLine("system", fgMuted("no checkpoints"));
      else for (const point of points.slice(-8)) {
        pushLine("system", `${fgAccent(point.id)} ${fgMuted(`· ${point.ts.slice(0, 19)} · ${point.label} · ${point.files.length} file(s)`)}`);
      }
      render();
      return true;
    }
    if (name === "/rewind") {
      const target = parts.slice(1).join(" ").trim();
      if (!target) { pushLine("system", fgMuted("usage: /rewind <checkpoint-id>")); render(); return true; }
      try {
        const restored = runtime.session.restoreCheckpoint(target);
        pushLine("system", `${fgGreen("restored")} ${fgMuted(`${target} · ${restored} file(s)`)}`);
      } catch (error) {
        pushLine("err", (error as Error).message);
      }
      render();
      return true;
    }
    if (name === "/compact") {
      const removed = runtime.agent.compactHistory();
      pushLine("system", removed ? `${fgGreen("compacted")} ${fgMuted(`${removed} message(s)`)}` : fgMuted("nothing to compact"));
      render();
      return true;
    }
    if (name === "/branch") {
      const title = parts.slice(1).join(" ").trim() || undefined;
      const branched = runtime.session.branch(title);
      switchSession({ sessionId: branched.id });
      lines.length = 0;
      pushLine("system", `${fgGreen("branched")} ${fgMuted(`· ${branched.id.slice(-6)} · ${branched.meta.title}`)}`);
      render();
      return true;
    }
    if (name === "/docs") {
      try {
        const doc = fs.readFileSync(path.join(cwd, "docs", "ROADMAP.md"), "utf8");
        for (const line of doc.split("\n").slice(0, 40)) pushLine("system", fgMuted(line));
      } catch {
        pushLine("system", fgMuted("docs/ROADMAP.md not found (run from a checkout)"));
      }
      render();
      return true;
    }
    if (name === "/map" || name === "/repo") {
      // the ranked repository map: what exists, without loading the repo
      const query = parts.slice(1).join(" ").trim();
      const map = query ? buildRepoMap(cwd, query) : runtime.agent.repoMap();
      pushLine("system", `${fgAccent("repository map")} ${fgMuted(repoMapSummary(map))}`);
      const rendered = renderRepoMap(map, { maxChars: 4000 });
      if (!rendered) pushLine("system", fgMuted("(no files found)"));
      else for (const row of rendered.split("\n")) pushLine("system", fgMuted(row));
      render();
      return true;
    }
    if (name === "/diff") {
      // the actual change plus the computed risk flags
      const diff = runtime.agent.workingDiff(8000);
      const analysis = runtime.agent.analyzeCurrentDiff();
      pushLine("system", `${fgAccent("diff")} ${fgMuted(reviewSummary(analysis))}`);
      if (!diff) pushLine("system", fgMuted("(no changes in the working tree)"));
      else for (const row of diff.split("\n").slice(0, 60)) pushLine("system", fgMuted(row));
      const findings = renderFindings(analysis);
      if (analysis.findings.length) {
        pushLine("system", fgMuted("risk flags:"));
        for (const row of findings.split("\n").slice(1)) pushLine("system", fgMuted(row));
      }
      render();
      return true;
    }
    if (name === "/verify") {
      // run the project's verify command right now and show the real result
      const command = runtime.agent.verifyCommand();
      if (!command) {
        pushLine("system", fgMuted("no verify command detected for this project (set verifyCommand in the config)"));
        render();
        return true;
      }
      pushLine("system", `${fgAccent("verify")} ${fgMuted(`· ${command} …`)}`);
      const result = runVerify(cwd, command, { timeoutMs: 120_000 });
      for (const row of renderVerifyResult(result).split("\n")) {
        pushLine(result.passed ? "ok" : "err", fgMuted(row));
      }
      render();
      return true;
    }
    if (name === "/clear-key") {
      // remove the stored key for a provider
      const target = parts.slice(1).join(" ").trim();
      const key = PROVIDERS.find((entry) => entry.key === target || entry.label.toLowerCase() === target.toLowerCase())?.key;
      if (!key) { pushLine("system", fgMuted(`usage: /clear-key <${PROVIDERS.map((p) => p.key).join("|")}>`)); render(); return true; }
      try {
        runtime.clearProviderKey(key);
        pushLine("ok", `cleared the key for ${key}`);
      } catch (error) {
        pushLine("err", (error as Error).message);
      }
      render();
      return true;
    }
    if (name === "/cost") {
      const cost = runtime.agent.getCost();
      pushLine("system", `${fgAccent("cost")} ${fgMuted(`· ${cost.inputTokens} in / ${cost.outputTokens} out · $${cost.costUsd.toFixed(4)}`)}`);
      render();
      return true;
    }
    if (name === "/audit") {
      const result = verifyAudit(cwd);
      pushLine("system", result.valid ? `${fgGreen("audit ok")} ${fgMuted(`${result.entries} entries · chain verified`)}` : fgRed(`audit failed: ${result.reason ?? "chain mismatch"}`));
      render();
      return true;
    }
    if (name === "/permissions") {
      pushLine("system", `${fgAccent("permissions")} ${fgMuted(`· ${runtime.config.permissions.mode} · protected ${runtime.config.permissions.protectedPaths.join(", ")}`)}`);
      render();
      return true;
    }
    if (name === "/status") {
      const cost = runtime.agent.getCost();
      pushLine("system", `${fgAccent(runtime.agent.mode)} ${fgMuted(`· ${runtime.agent.modelSpec} · ${cost.turns} turns · ${cost.inputTokens} in / ${cost.outputTokens} out`)}`);
      pushLine("system", fgMuted(`· ${cwd}`));
      render();
      return true;
    }
    if (name === "/sessions" || name === "/resume") {
      overlay = { kind: "sessions", query: "", index: 0 };
      paletteIndex = 0;
      input = "";
      cursor = 0;
      render();
      return true;
    }
    return false;
  };

  const fmtTurnDuration = (ms: number): string => {
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const rem = Math.floor(s % 60);
    if (m < 60) return `${m}m ${rem}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };
  let turnStartedAt = 0;
  const submitText = (text: string) => {
    scroll = 0;
    pushLine("user", text);
    busy = true;
    turnStartedAt = Date.now();
    startSpinner();
    render();
    void (async () => {
      try {
        await runtime.agent.run(text);
      } catch (error) {
        pushLine("err", (error as Error).message);
      } finally {
        busy = false;
        stopSpinner();
        flushRender();
        const turnMs = Date.now() - turnStartedAt;
        const title = runtime.agent.mode.charAt(0).toUpperCase() + runtime.agent.mode.slice(1);
        const modelShort = (runtime.agent.modelSpec.split("/").pop() ?? runtime.agent.modelSpec).slice(0, 40);
        // opencode's assistant footer: Agent · model · duration · tok/s
        const spent = runtime.agent.getCost();
        const rate = turnMs > 0 ? spent.totalTokens / (turnMs / 1000) : 0;
        const rateText = rate >= 1 ? ` · ${rate.toFixed(1)} tok/s` : "";
        // opencode's assistant footer + the honest verification state
        const verifyText = runtime.agent.verifyStatus();
        pushLine(
          "system",
          `${modeColor(runtime.agent.mode)}${BOLD}${title}${RESET}${fgMuted(` · ${modelShort} · ${fmtTurnDuration(turnMs)}${rateText}`)}${verifyText ? fgMuted(` · ${verifyText}`) : ""}`,
        );
        render();
        // agent is free — drain the queue in FIFO order, one turn at a time
        const next = queue.shift();
        if (next) submitText(next);
      }
    })();
  };

  const submitInput = () => {
    const text = input.trim();
    input = "";
    cursor = 0;
    overlay = { kind: "none" };
    if (!text) { render(); return; }

    // wizard-aware commands first
    if (text.startsWith("/")) {
      if (runCommandLine(text)) return;
      // fall through to the classic command handler
      void classicCommand(text);
      return;
    }

    if (busy) {
      queue.push(text);
      pushLine("system", `queued (${queue.length}): ${text.length > 60 ? text.slice(0, 59) + "…" : text}`);
      render();
      return;
    }
    submitText(text);
  };

  const classicCommand = async (cmdLine: string) => {
    // commands that live outside the wizard render via the classic renderer
    process.stdout.write("\x1b[?1049l\x1b[?25h\n");
    const cliRenderer = new Renderer();
    const ctx = {
      runtime,
      renderer: cliRenderer,
      cwd,
      exit: () => process.exit(0),
      restart: () => undefined,
      ask: async () => null,
    };
    try {
      await handleCommand(cmdLine, ctx as Parameters<typeof handleCommand>[1]);
    } catch (error) {
      cliRenderer.error((error as Error).message);
    }
    process.stdout.write("\npress any key to return…\n");
    await new Promise<void>((resolve) => {
      const onData = () => {
        process.stdin.removeListener("data", onData);
        resolve();
      };
      process.stdin.once("data", onData);
    });
    process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
    render();
  };

  // ─── input handling (key-by-key) ────────────────────────────────
  const appendText = (text: string) => {
    for (const ch of text) {
      if (ch >= " " && ch !== "\x7f") {
        input = input.slice(0, cursor) + ch + input.slice(cursor);
        cursor += 1;
      }
    }
    if (input.startsWith("/")) {
      overlay = { kind: "palette", index: 0 };
      paletteIndex = 0;
    } else if (overlay.kind === "palette") {
      overlay = { kind: "none" };
    }
  };

  // ─── multiline cursor movement (Ctrl+J inserts \n) ──────────────
  const lineInfo = (idx: number) => {
    const starts: number[] = [0];
    for (let i = 0; i < input.length; i++) if (input[i] === "\n") starts.push(i + 1);
    let curLine = 0;
    for (let i = 0; i < starts.length; i++) if (idx >= starts[i]) curLine = i;
    return { starts, curLine, col: idx - starts[curLine] };
  };
  const moveMultilineCursor = (dir: -1 | 1): boolean => {
    if (!input.includes("\n")) return false;
    const { starts, curLine, col } = lineInfo(cursor);
    const target = curLine + dir;
    if (target < 0 || target >= starts.length) return false;
    const nextStart = starts[target];
    const nextEnd = target + 1 < starts.length ? starts[target + 1] - 1 : input.length;
    cursor = nextStart + Math.min(col, Math.max(0, nextEnd - nextStart));
    return true;
  };
  const insertNewline = () => {
    input = input.slice(0, cursor) + "\n" + input.slice(cursor);
    cursor += 1;
    if (overlay.kind === "palette") overlay = { kind: "none" };
    render();
  };

  const overlayUp = () => { if (overlay.kind === "palette" || overlay.kind === "model" || overlay.kind === "mcp" || overlay.kind === "sessions" || overlay.kind === "mode") { paletteIndex = Math.max(0, paletteIndex - 1); } else if (overlay.kind === "provider") { overlay.index = Math.max(0, overlay.index - 1); } else if (overlay.kind === "variant") { overlay.index = Math.max(0, overlay.index - 1); } };
  const overlayDown = () => {
    if (overlay.kind === "mode") {
      paletteIndex = Math.min(4, paletteIndex + 1);
      return;
    }
    if (overlay.kind === "sessions") {
      const count = sessionRows(overlay.query).length;
      paletteIndex = Math.min(Math.max(0, count - 1), paletteIndex + 1);
      return;
    }
    if (overlay.kind === "mcp") {
      const count = searchMcpServers(overlay.query, { limit: 300 }).length;
      paletteIndex = Math.min(Math.max(0, count - 1), paletteIndex + 1);
      return;
    }
    if (overlay.kind === "palette" || overlay.kind === "model") {
      const count = overlay.kind === "palette"
        ? COMMANDS.filter((c) => c.name.startsWith(input.toLowerCase())).length
        : filteredModels(overlay.kind === "model" ? overlay.query.toLowerCase() : "").length;
      paletteIndex = Math.min(Math.max(0, count - 1), paletteIndex + 1);
    } else if (overlay.kind === "provider") {
      overlay.index = Math.min(PROVIDERS.length - 1, overlay.index + 1);
    } else if (overlay.kind === "variant") {
      overlay.index = Math.min(EFFORTS.length - 1, overlay.index + 1);
    }
  };

  const selectOverlay = (): boolean => {
    if (overlay.kind === "palette" || overlay.kind === "model") {
      const filtered = overlay.kind === "palette"
        ? COMMANDS.filter((c) => c.name.startsWith(input.toLowerCase()))
        : filteredModels(overlay.kind === "model" ? overlay.query.toLowerCase() : "");
      const item = filtered[Math.min(paletteIndex, Math.max(0, filtered.length - 1))];
      if (!item) { overlay = { kind: "none" }; render(); return true; }
      if (overlay.kind === "palette") {
        const cmd = item as (typeof COMMANDS)[number];
        if (cmd.action === "provider") { overlay = { kind: "provider", index: 0 }; render(); return true; }
        overlay = { kind: "none" };
        if (runCommandLine(cmd.name)) { render(); return true; }
        // not native in the TUI — run the classic command here, inside the TUI
        void runClassicInTui(cmd.name);
        return true;
      }
      // model picked — apply it as the new default model for this session
      const picked = item as ModelAliasItem;
      runtime.agent.setModel(`${picked.provider}/${picked.model}`);
      pushLine("ok", `model → ${picked.provider}/${picked.model}`);
      overlay = { kind: "none" };
      render();
      return true;
    }
    if (overlay.kind === "provider") {
      const entry = PROVIDERS[Math.min(overlay.index, PROVIDERS.length - 1)];
      if (!providerIsReady(entry.key, runtime.config.providers) && entry.env) {
        overlay = { kind: "provider-key", entry, input: "" };
      } else {
        runtime.agent.setModel(`${entry.key}/${entry.defaultModel}`);
        pushLine("ok", `provider → ${entry.label} (default model ${entry.defaultModel})`);
        overlay = { kind: "none" };
      }
      render();
      return true;
    }
    if (overlay.kind === "provider-key") {
      const { entry, input: key } = overlay;
      const cleaned = sanitizeKey(key);
      if (cleaned.length === 0) { pushLine("err", "API key cannot be empty"); render(); return true; }
      if (!keyCharsetOk(cleaned)) {
        overlay = { kind: "provider-test", entry, status: "fail", message: "bad_chars" };
        render();
        return true;
      }
      overlay = { kind: "provider-test", entry, status: "working", message: "" };
      render();
      void (async () => {
        const result = await validateKey(entry, cleaned);
        if (result === "ok") {
          try {
            runtime.setProviderKey(entry.key, cleaned);
          } catch { /* best effort */ }
          overlay = { kind: "provider-test", entry, status: "ok", message: "saved" };
        } else {
          overlay = { kind: "provider-test", entry, status: "fail", message: result };
        }
        render();
      })();
      return true;
    }
    if (overlay.kind === "provider-test") {
      if (overlay.status === "ok") {
        runtime.agent.setModel(`${overlay.entry.key}/${overlay.entry.defaultModel}`);
        pushLine("ok", `${overlay.entry.label} connected — default model ${overlay.entry.defaultModel}`);
      } else {
        pushLine("err", `could not validate ${overlay.entry.label}: ${friendlyValidateError(overlay.message)}`);
      }
      overlay = { kind: "none" };
      render();
      return true;
    }
    if (overlay.kind === "mode") {
      const modes: AgentMode[] = ["build", "plan", "compose", "review", "yolo"];
      const mode = modes[Math.min(overlay.index, modes.length - 1)];
      runtime.setMode(mode);
      pushLine("system", `${fgGreen("mode")} ${fgMuted(`→ ${mode}`)}`);
      overlay = { kind: "none" };
      render();
      return true;
    }
    if (overlay.kind === "variant") {
      const effort = EFFORTS[overlay.index];
      setEffort(effort);
      overlay = { kind: "none" };
      render();
      return true;
    }
    if (overlay.kind === "sessions") {
      const rows = sessionRows(overlay.query);
      const row = rows[Math.min(paletteIndex, Math.max(0, rows.length - 1))];
      overlay = { kind: "none" };
      if (row?.isNew) {
        switchSession({ newSession: true });
        lines.length = 0;
        pushLine("system", `${fgGreen("new session")} ${fgMuted(`· ${shortId}`)}`);
      } else if (row) {
        try {
          switchSession({ sessionId: row.id });
          lines.length = 0;
          pushLine("system", `${fgGreen("resumed")} ${fgMuted(`${row.id.slice(-6)} · ${row.title}`)}`);
        } catch (error) {
          pushLine("err", (error as Error).message);
        }
      }
      render();
      return true;
    }
    if (overlay.kind === "mcp") {
      const hits = searchMcpServers(overlay.query, { limit: 300 });
      const entry = hits[Math.min(paletteIndex, Math.max(0, hits.length - 1))];
      overlay = { kind: "none" };
      if (entry) {
        pushLine("system", `${fgAccent(entry.name)} — ${fgMuted(entry.work)}`);
        pushLine("system", `${fgMuted(`${entry.id} · ${entry.platforms.join("/").toUpperCase()}${entry.remote ? " · HOSTED" : ""} · ${entry.url}`)}`);
        pushLine("system", fgMuted("add to ~/.xminal/config.json →"));
        for (const row of mcpConfigSnippet(entry).split("\n")) pushLine("system", fgMuted(row));
      }
      render();
      return true;
    }
    return false;
  };

  // ─── input parsing (one owner) ─────────────────────────────────────
  // A single normalization pass strips every CSI sequence the terminal emits.
  // Mouse reports are counted (wheel scrolls), never typed. A trailing
  // incomplete escape sequence is held for the next chunk so it can never
  // leak into the composer. Anything left after extraction is plain text.
  let inputBuffer = "";
  const MOUSE_RE = /\x1b\[<[\d;]+[Mm]/g;
  const CSI_RE = /\x1b\[[0-9;?]*[A-Za-z~]/g;
  const PARTIAL_RE = /(\x1b\[[<0-9;?]*)$/;

  const onData = (raw: Buffer) => {
    let s = inputBuffer + raw.toString("utf8");
    inputBuffer = "";
    // hold back a trailing incomplete escape sequence for the next chunk
    const partial = PARTIAL_RE.exec(s);
    if (partial) {
      inputBuffer = partial[0];
      s = s.slice(0, s.length - partial[0].length);
    }

    if (pendingPermission) {
      const ch = s.trim().toLowerCase()[0];
      const allow = ch === "y";
      const ask = pendingPermission;
      pendingPermission = null;
      pushLine(allow ? "ok" : "err", allow ? `allowed ${ask.tool}` : `denied ${ask.tool}`);
      ask.resolve(allow);
      return;
    }
    if (s === "\x03") { close(); return; }
    if (s === "\x0c") { render(); return; } // Ctrl+L redraw
    if (s === "\x1b[5~") { scroll = clampScroll(scroll + 8); render(); return; }
    if (s === "\x1b[6~") { scroll = clampScroll(scroll - 8); render(); return; }

    // mouse: count wheel events (scroll / overlay), drop everything else
    const wheel = (s.match(MOUSE_RE) ?? []).map((m) => Number(/\[<(\d+)/.exec(m)?.[1] ?? -1));
    s = s.replace(MOUSE_RE, "");
    for (const button of wheel) {
      if (overlay.kind !== "none") {
        // inside any overlay the wheel moves the selection, never the chat
        if (button === 64) overlayUp();
        else if (button === 65) overlayDown();
      } else {
        if (button === 64) scroll = clampScroll(scroll + 4);
        else if (button === 65) scroll = clampScroll(scroll - 4);
      }
    }

    // arrows may arrive batched — consume them as counts
    const del = (s.match(/\x1b\[3~/g) ?? []).length;
    const up = (s.match(/\x1b\[A/g) ?? []).length;
    const down = (s.match(/\x1b\[B/g) ?? []).length;
    const left = (s.match(/\x1b\[D/g) ?? []).length;
    const right = (s.match(/\x1b\[C/g) ?? []).length;
    s = s.replace(CSI_RE, "");
    for (let i = 0; i < up; i++) if (!moveMultilineCursor(-1)) overlayUp();
    for (let i = 0; i < down; i++) if (!moveMultilineCursor(1)) overlayDown();
    if (overlay.kind === "none") {
      if (left) cursor = Math.max(0, cursor - left);
      if (right) cursor = Math.min(input.length, cursor + right);
      for (let i = 0; i < del; i++) {
        if (cursor < input.length) input = input.slice(0, cursor) + input.slice(cursor + 1);
      }
    }
    if (wheel.length || up || down || left || right || del) { render(); }

    if (s === "\x1b") { // Esc alone
      if (overlay.kind !== "none") { overlay = { kind: "none" }; render(); return; }
      if (busy) { runtime.agent.abort(); pushLine("system", "interrupted"); render(); return; }
      if (queue.length > 0) {
        pushLine("system", `cleared ${queue.length} queued message${queue.length === 1 ? "" : "s"}`);
        queue.length = 0;
        render();
        return;
      }
      return;
    }
    if (s === "\x0a" || s === "\x1b[13;2u" || s === "\x1b[27;2;13~") { insertNewline(); return; } // Ctrl+J / Shift+Enter
    if (s === "\t") { cycleMode(); return; }
    if (s === "\x13" && overlay.kind === "model") { // Ctrl+S: toggle provider scope / all providers
      modelScope = modelScope
        ? null
        : (modelScopeOfSpec(runtime.agent.modelSpec) ?? modelScopeOfSpec(runtime.config.defaultModel));
      paletteIndex = 0;
      render();
      return;
    }
    if (s === "\x7f" || s === "\b") { // Backspace
      if (cursor > 0) {
        if (overlay.kind === "provider-key") { overlay.input = overlay.input.slice(0, overlay.input.length - 1); render(); return; }
        if (overlay.kind === "model") { overlay.query = overlay.query.slice(0, overlay.query.length - 1); paletteIndex = 0; render(); return; }
        if (overlay.kind === "mcp") { overlay.query = overlay.query.slice(0, overlay.query.length - 1); paletteIndex = 0; render(); return; }
        if (overlay.kind === "sessions") { overlay.query = overlay.query.slice(0, overlay.query.length - 1); paletteIndex = 0; render(); return; }
        input = input.slice(0, cursor - 1) + input.slice(cursor);
        cursor -= 1;
        if (overlay.kind === "palette" && !input.startsWith("/")) overlay = { kind: "none" };
        render();
      }
      return;
    }
    if (s === "\x10") { overlay = overlay.kind === "palette" ? { kind: "none" } : { kind: "palette", index: 0 }; render(); return; } // Ctrl+P
    if (s === "\x01" && overlay.kind === "mcp") {
      // Ctrl+A: add the highlighted catalog entry to ~/.xminal/config.json
      const hits = searchMcpServers(overlay.query, { limit: 300 });
      const entry = hits[Math.min(paletteIndex, Math.max(0, hits.length - 1))];
      if (!entry) { pushLine("system", fgMuted("nothing to add")); render(); return; }
      const key = entry.id.replace(/[^a-zA-Z0-9_-]/g, "-");
      try {
        const saved = addGlobalMcpServer(key, mcpServerConfig(entry));
        pushLine("system", `${fgGreen("added")} ${fgMuted(`${key} → ${saved.path}${saved.backup ? ` (backup: ${saved.backup})` : ""}`)}`);
        pushLine("system", fgMuted("disabled on purpose — copy the run command from the README, then set \"enabled\": true"));
      } catch (error) {
        pushLine("err", (error as Error).message);
      }
      render();
      return;
    }

    // split embedded newlines and dispatch each segment
    let rest = s;
    for (;;) {
      const idx2 = rest.search(/[\r\n]/);
      if (idx2 === -1) {
        if (rest) {
          if (overlay.kind === "provider-key") {
            for (const ch of rest) if (ch >= " " && ch !== "\x7f") overlay.input += ch;
            render();
            return;
          }
          if (overlay.kind === "model") {
            for (const ch of rest) if (ch >= " " && ch !== "\x7f") { overlay.query += ch; paletteIndex = 0; }
            render();
            return;
          }
          if (overlay.kind === "mcp") {
            for (const ch of rest) if (ch >= " " && ch !== "\x7f") { overlay.query += ch; paletteIndex = 0; }
            render();
            return;
          }
          if (overlay.kind === "sessions") {
            for (const ch of rest) if (ch >= " " && ch !== "\x7f") { overlay.query += ch; paletteIndex = 0; }
            render();
            return;
          }
          for (const ch of rest) {
            if (ch === "\x1b") continue;
            if (ch >= " " && ch !== "\x7f") {
              if (overlay.kind === "palette") { input += ch; paletteIndex = 0; continue; }
              input = input.slice(0, cursor) + ch + input.slice(cursor);
              cursor += 1;
            }
          }
          if (input.startsWith("/")) overlay = { kind: "palette", index: 0 };
          else if (overlay.kind === "palette") overlay = { kind: "none" };
          render();
        }
        return;
      }
      const head2 = rest.slice(0, idx2);
      if (head2) {
        if (overlay.kind === "provider-key") {
          for (const ch of head2) if (ch >= " " && ch !== "\x7f") overlay.input += ch;
        } else if (overlay.kind === "model") {
          for (const ch of head2) if (ch >= " " && ch !== "\x7f") { overlay.query += ch; paletteIndex = 0; }
        } else {
          for (const ch of head2) {
            if (ch === "\x1b") continue;
            if (ch >= " " && ch !== "\x7f") {
              if (overlay.kind === "palette") { input += ch; paletteIndex = 0; continue; }
              input = input.slice(0, cursor) + ch + input.slice(cursor);
              cursor += 1;
            }
          }
        }
      }
      rest = rest.slice(idx2 + 1);
      const handled = selectOverlay();
      if (handled) { render(); return; }
      submitInput();
      if (closed) return;
    }
  };

  const cycleMode = () => {
    const MODES: AgentMode[] = ["build", "plan", "compose", "review", "yolo"];
    const idx = MODES.indexOf(runtime.agent.mode);
    runtime.setMode(MODES[(idx + 1) % MODES.length]);
    pushLine("system", `mode → ${MODES[(idx + 1) % MODES.length]}`);
  };

  process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l\x1b[48;2;26;27;38m\x1b[38;2;200;211;245m" + (mouseMode ? "\x1b[?1000h\x1b[?1006h" : ""));
  process.stdout.on("resize", render);
  // Android and other hosts can kill the app without asking: restore the
  // terminal and flush the session so the user is not left with a black
  // screen and a half-written transcript
  const onSignal = (signal: string) => {
    process.stderr.write(`\n[xminal: received ${signal} — restoring the terminal and saving the session]\n`);
    try {
      close();
    } catch {
      process.stdout.write("\x1b[?1049l\x1b[?25h\x1b[0m\n");
      process.exit(130);
    }
  };
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGHUP", () => onSignal("SIGHUP"));
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("uncaughtException", (error) => {
    process.stdout.write(`\x1b[?1049l\x1b[?25h\x1b[0m\n[xminal: unexpected error — the terminal was restored]\n${error?.stack ?? error}\n`);
    try {
      runtime.close();
    } catch {
      /* session flush is best-effort here */
    }
    process.exit(1);
  });
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("data", onData);
  render();
  if (lines.length === 0) {
    const bootTimer = setInterval(() => {
      if (Date.now() - bootStart > 1400) { clearInterval(bootTimer); return; }
      render();
    }, 60);
  }

  if (!process.env.XMINAL_MODELS_OFFLINE) { // refresh catalog from models.dev in the background when stale
    const meta = catalogMeta();
    const fetchedAt = meta.fetchedAt ? Date.parse(meta.fetchedAt) : 0;
    const ttlHours = Number(process.env.XMINAL_MODELS_TTL_HOURS ?? "24");
    const stale = !fetchedAt || Date.now() - fetchedAt > Math.max(0, ttlHours) * 3600_000;
    if (stale) {
      // first run / stale catalog — say so, the user should know we are working
      pushLine("system", fgMuted("updating model catalog — first run downloads the live models.dev list…"));
      render();
    }
    void (async () => {
      try {
        const result = await refreshModelsCatalog({ force: false });
        if (result.source === "fresh" && !closed) {
          pushLine("system", fgMuted(`model catalog updated · ${result.modelCount} models · ${result.freeCount} free`));
          render();
        } else if (!result.ok && !closed) {
          pushLine("system", fgMuted(`model catalog update failed (${result.error ?? "unknown"}) — using bundled/cached catalog`));
          render();
        }
      } catch { /* best effort */ }
    })();
  }

  await new Promise<void>((resolve) => {
    const check = () => (closed ? resolve() : setTimeout(check, 200));
    check();
  });
}
