import { Runtime } from "../runtime";
import { loadConfig, resolveModel } from "../config/config";
import { listEffectiveAliases, refreshModelsCatalog, effectiveModelMap } from "../config/models-catalog";
import { visibleWidth, graphemeSlice, stripAnsi as stripAnsiW, splitGraphemes, wrapAnsi } from "./width";
import { formatAssistantText, isLikelyDiff, tintDiffRow } from "./format";
import { renderMarkdown } from "./markdown";
import type { ProviderConfig, ModelConfig } from "../config/types";
import { Renderer } from "../cli/render";
import { handleCommand } from "../cli/commands";
import { spawnSync } from "node:child_process";
import { T, rgb, bgRgb, RESET, BOLD, fgMuted, fgText, fgAccent, fgAmber, fgGreen, fgRed, fgCyan, modeColor } from "./theme";
import { makeActivity, completeActivity, renderActivity, spinnerFrame, type ActivityLine } from "./output/tool-activity";

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

type LineKind = "user" | "assistant" | "tool" | "ok" | "err" | "system";
interface Line {
  kind: LineKind;
  text: string;
  /** present when kind === "tool" — merged onToolCall → onToolResult */
  activity?: ActivityLine;
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
  { name: "/continue", desc: "continue with saved state", group: "Session" },
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

  { name: "/tasks", desc: "the task list (.xminal/todos.json)", group: "Tasks" },
  { name: "/todo", desc: "add a todo item", group: "Tasks" },
  { name: "/memory", desc: "memory list · add · search · forget", group: "Tasks" },
  { name: "/skills", desc: "list installed skills", group: "Skills" },
  { name: "/skill", desc: "print a skill by name", group: "Skills" },
  { name: "/skill-lock", desc: "lock current skills (.xminal/skills.lock.json)", group: "Skills" },
  { name: "/skill-verify", desc: "verify skills against lockfile", group: "Skills" },

  { name: "/mcp", desc: "list MCP servers + tools", group: "MCP" },
  { name: "/mcp-tools", desc: "list all MCP tool names", group: "MCP" },
  { name: "/mcp-call", desc: "call a tool on an MCP server", group: "MCP" },

  { name: "/verify", desc: "run project tests/lint/typecheck", group: "Dev" },
  { name: "/test", desc: "alias for /verify", group: "Dev" },
  { name: "/build", desc: "run project build", group: "Dev" },
  { name: "/lint", desc: "run project linter", group: "Dev" },
  { name: "/ralph", desc: "iterate impl until verify passes", group: "Dev" },
  { name: "/diagnose", desc: "run diagnostics tool", group: "Dev" },

  { name: "/diff", desc: "git diff", group: "Git" },
  { name: "/git", desc: "run a git command", group: "Git" },
  { name: "/status", desc: "git status --short --branch", group: "Git" },
  { name: "/log", desc: "git log --oneline -n 15", group: "Git" },
  { name: "/branch", desc: "git branch -vv", group: "Git" },
  { name: "/worktree", desc: "git worktree list / add / remove / merge", group: "Git" },
  { name: "/stash", desc: "git stash push / pop", group: "Git" },

  { name: "/cost", desc: "token spend breakdown", group: "Usage" },
  { name: "/usage", desc: "alias for /cost", group: "Usage" },
  { name: "/tools", desc: "per-tool token usage", group: "Usage" },
  { name: "/budget", desc: "set max cost per session", group: "Usage" },

  { name: "/doctor", desc: "environment diagnostics", group: "Setup" },
  { name: "/env", desc: "show env var names (masked)", group: "Setup" },
  { name: "/init", desc: "create .xminal in this project", group: "Setup" },
  { name: "/setup", desc: "guided first-run setup", group: "Setup" },
  { name: "/permissions", desc: "review or change ask/auto/full", group: "Setup" },
  { name: "/compact", desc: "compact in-memory conversation", group: "Session" },

  { name: "/audit", desc: "verify hash-chained audit log", group: "Audit" },
  { name: "/docs", desc: "show docs/ROADMAP.md", group: "Docs" },

  { name: "/version", desc: "print xminal version", group: "System" },
  { name: "/about", desc: "about XMINAL", group: "System" },
  { name: "/help", desc: "this command list", group: "System" },
  { name: "/clear", desc: "clear the screen", group: "System" },
  { name: "/theme", desc: "toggle dark/light (light = coming)", group: "System" },
  { name: "/report", desc: "report a bug on GitHub", group: "System" },
  { name: "/issue", desc: "alias for /report", group: "System" },
  { name: "/exit", desc: "quit XMINAL", group: "System" },
];

// ─── provider catalog (all providers we ship) ──────────────────────
interface ProviderEntry {
  key: string;
  label: string;
  kind: "local" | "free" | "byok";
  env: string;      // env var name for the key (empty if keyless)
  baseUrl: string;  // default base URL for validation
  defaultModel: string;
}
const PROVIDERS: ProviderEntry[] = [
  { key: "opencode", label: "OpenCode (free)", kind: "free", env: "", baseUrl: "https://opencode.ai/inference/openai/v1", defaultModel: "inkling-2-small-free" },
  { key: "openrouter", label: "OpenRouter (free tier)", kind: "byok", env: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "nvidia/nemotron-3.5-super-vl:free" },
  { key: "ollama", label: "Ollama (local)", kind: "local", env: "", baseUrl: "http://localhost:11434/v1", defaultModel: "llama3.2" },
  { key: "lmstudio", label: "LM Studio (local)", kind: "local", env: "", baseUrl: "http://localhost:1234/v1", defaultModel: "qwen/qwen3-coder-30b" },
  { key: "vllm", label: "vLLM (local)", kind: "local", env: "", baseUrl: "http://localhost:8000/v1", defaultModel: "local-model" },
  { key: "llama_cpp", label: "llama.cpp (local)", kind: "local", env: "", baseUrl: "http://localhost:8080/v1", defaultModel: "local-model" },
  { key: "koboldcpp", label: "KoboldCpp (local)", kind: "local", env: "", baseUrl: "http://localhost:5001/v1", defaultModel: "koboldcpp" },
  { key: "textgen", label: "text-generation-webui", kind: "local", env: "", baseUrl: "http://localhost:5000/v1", defaultModel: "local-model" },
  { key: "gpt4all", label: "GPT4All (local)", kind: "local", env: "", baseUrl: "http://localhost:4891/v1", defaultModel: "local-model" },
  { key: "openwebui", label: "Open WebUI (local)", kind: "local", env: "", baseUrl: "http://localhost:3000/v1", defaultModel: "local-model" },
  { key: "openai", label: "OpenAI", kind: "byok", env: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" },
  { key: "anthropic", label: "Anthropic (Claude)", kind: "byok", env: "ANTHROPIC_API_KEY", baseUrl: "https://api.anthropic.com", defaultModel: "claude-sonnet-4-5" },
  { key: "gemini", label: "Google Gemini", kind: "byok", env: "GEMINI_API_KEY", baseUrl: "https://generativelanguage.googleapis.com", defaultModel: "gemini-3.8-flash" },
  { key: "groq", label: "Groq", kind: "byok", env: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "openai/gpt-oss-120b" },
  { key: "deepseek", label: "DeepSeek", kind: "byok", env: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-flash" },
  { key: "mistral", label: "Mistral", kind: "byok", env: "MISTRAL_API_KEY", baseUrl: "https://api.mistral.ai/v1", defaultModel: "labs-leanstral-1-5-1" },
  { key: "xai", label: "xAI (Grok)", kind: "byok", env: "XAI_API_KEY", baseUrl: "https://api.x.ai/v1", defaultModel: "grok-4.7" },
  { key: "cerebras", label: "Cerebras", kind: "byok", env: "CEREBRAS_API_KEY", baseUrl: "https://api.cerebras.ai/v1", defaultModel: "qwen-3.8-27b" },
  { key: "cohere", label: "Cohere", kind: "byok", env: "COHERE_API_KEY", baseUrl: "https://api.cohere.com/compatibility/v1", defaultModel: "north-mini-code-1-0" },
  { key: "togetherai", label: "Together AI", kind: "byok", env: "TOGETHER_API_KEY", baseUrl: "https://api.together.xyz/v1", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  { key: "fireworks", label: "Fireworks AI", kind: "byok", env: "FIREWORKS_API_KEY", baseUrl: "https://api.fireworks.ai/inference/v1", defaultModel: "accounts/fireworks/models/kimi-k3p1-pro" },
  { key: "perplexity", label: "Perplexity", kind: "byok", env: "PERPLEXITY_API_KEY", baseUrl: "https://api.perplexity.ai", defaultModel: "sonar-pro" },
  { key: "moonshotai", label: "Moonshot AI (Kimi)", kind: "byok", env: "MOONSHOT_API_KEY", baseUrl: "https://api.moonshot.ai/v1", defaultModel: "kimi-k3.1-pro" },
  { key: "huggingface", label: "Hugging Face", kind: "byok", env: "HF_TOKEN", baseUrl: "https://router.huggingface.co/v1", defaultModel: "zai-org/GLM-4.7-Flash" },
  { key: "github", label: "GitHub Models", kind: "byok", env: "GITHUB_TOKEN", baseUrl: "https://models.github.ai/inference", defaultModel: "openai/gpt-4o-mini" },
  { key: "nvidia", label: "NVIDIA NIM", kind: "byok", env: "NVIDIA_API_KEY", baseUrl: "https://integrate.api.nvidia.com/v1", defaultModel: "nvidia/nemotron-3.5-super-vl-120b-a12b" },
  { key: "deepinfra", label: "DeepInfra", kind: "byok", env: "DEEPINFRA_API_KEY", baseUrl: "https://api.deepinfra.com/v1/openai", defaultModel: "deepseek-ai/DeepSeek-V4.1-Flash-1017" },
  { key: "sambanova", label: "SambaNova", kind: "byok", env: "SAMBANOVA_API_KEY", baseUrl: "https://api.sambanova.ai/v1", defaultModel: "MiniMax-M3" },
  { key: "novita", label: "Novita AI", kind: "byok", env: "NOVITA_API_KEY", baseUrl: "https://api.novita.ai/openai", defaultModel: "tencent/hy4" },
  { key: "poe", label: "Poe", kind: "byok", env: "POE_API_KEY", baseUrl: "https://api.poe.com/v1", defaultModel: "google/gemini-3.8-flash" },
  { key: "zai", label: "Z.AI (GLM)", kind: "byok", env: "ZAI_API_KEY", baseUrl: "https://api.z.ai/api/paas/v4", defaultModel: "glm-4.7-flash" },
  { key: "zhipuai", label: "Zhipu AI (GLM)", kind: "byok", env: "ZHIPU_API_KEY", baseUrl: "https://open.bigmodel.cn/api/paas/v4", defaultModel: "glm-4.7-flash" },
  { key: "minimax", label: "MiniMax", kind: "byok", env: "MINIMAX_API_KEY", baseUrl: "https://api.minimax.chat/v1", defaultModel: "MiniMax-M3.1-Flash" },
  { key: "siliconflow", label: "SiliconFlow", kind: "byok", env: "SILICONFLOW_API_KEY", baseUrl: "https://api.siliconflow.cn/v1", defaultModel: "deepseek-ai/DeepSeek-V4-Flash-0731" },
  { key: "volcengine", label: "Volcengine (Doubao)", kind: "byok", env: "VOLCENGINE_API_KEY", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", defaultModel: "deepseek-v4-flash-ga-260731" },
  { key: "302ai", label: "302.AI", kind: "byok", env: "AI_302AI_API_KEY", baseUrl: "https://api.302.ai/v1", defaultModel: "gpt-4o" },
  { key: "venice", label: "Venice AI", kind: "byok", env: "VENICE_API_KEY", baseUrl: "https://api.venice.ai/api/v1", defaultModel: "deepseek-v4-1-flash-1017" },
  { key: "vercel", label: "Vercel AI Gateway", kind: "byok", env: "VERCEL_AI_GATEWAY_API_KEY", baseUrl: "https://ai-gateway.vercel.sh/v1", defaultModel: "reflection/beam-free" },
  { key: "alibaba", label: "Alibaba DashScope (Qwen)", kind: "byok", env: "DASHSCOPE_API_KEY", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", defaultModel: "qwen-plus" },
];

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
  | { kind: "variant"; index: number };

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
const ctxLabel = (n?: number): string => {
  if (!n || n <= 0) return "";
  if (n >= 1_000_000) return `${(n / 1e6).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  return `${Math.round(n / 1000)}K`;
};
const priceLabel = (cfg?: ModelConfig): string => {
  if (!cfg) return "";
  const inP = cfg.inputPricePerMTok, outP = cfg.outputPricePerMTok;
  if (inP === 0 && outP === 0) return "free";
  if (inP === undefined || outP === undefined) return "";
  return `$${inP}/${outP}`;
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
  `${bgRgb(bg)}${padRight(" " + content, width - 1)}${RESET}${rgb(C.border)}│${RESET}`;
const panelSide = (content: string, width: number, bg: readonly [number, number, number] = C.panel) =>
  `${rgb(C.border)}│${RESET}${bgRgb(bg)}${padRight(" " + content, width - 1)}${RESET}${rgb(C.border)}│${RESET}`;

const sectionLabel = (t: string) => fgMuted(t.toUpperCase());
const ok = (t: string) => fgGreen(t);
const warn = (t: string) => fgAmber(t);
const err = (t: string) => fgRed(t);

// ─── main entry ─────────────────────────────────────────────────────
export async function startTui(runtime: Runtime): Promise<void> {
  const cwd = runtime.cwd;
  const sessionTitle = runtime.session.meta.title === "untitled" ? "new session" : runtime.session.meta.title;
  const shortId = runtime.session.id.slice(0, 8);
  const todos = loadTodos(cwd);
  const branch = detectGitBranch(cwd);

  const mouseMode = !/^(0|off|false)$/i.test(process.env.XMINAL_MOUSE ?? "");
  let busy = false;
  let closed = false;
  let input = "";
  let cursor = 0;
  let scroll = 0;
  let overlay: Overlay = { kind: "none" };
  let paletteIndex = 0;
  let pendingPermission: { tool: string; reason: string; resolve: (allow: boolean) => void } | null = null;
  const lines: Line[] = [];

  const cols = () => Math.max(40, process.stdout.columns ?? (Number(process.env.COLUMNS) || 80));
  const rows = () => Math.max(16, process.stdout.rows ?? (Number(process.env.LINES) || 24));
  const sidebarWidth = () => (cols() >= 100 ? 30 : 0);
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

  const styledLine = (line: Line): string[] => {
    const w = Math.max(8, contentWidth() - 2);
    // ── tool activity — opencode-style single line + tinted diff preview
    if (line.kind === "tool" && line.activity) {
      const a = line.activity;
      const out: string[] = [` ${renderActivity(a, Math.max(8, w - 1))}`];
      if (a.preview && a.preview.length) {
        for (const row of a.preview) {
          out.push(`   ${tintDiffRow(row, () => row, fgMuted, fgAccent, fgGreen, fgRed)}`);
        }
        if (a.extraPreviewLines) out.push(`   ${fgMuted(`… ${a.extraPreviewLines} more diff lines`)}`);
      } else if (a.status === "err" && a.detail) {
        out.push(`   ${fgMuted(a.detail)}`);
      } else if (a.status === "ok" && (a.extraLines ?? 0) > 0) {
        out.push(`   ${fgMuted(`${a.extraLines} more line(s)`)}`);
      }
      return out;
    }
    // ── user — opencode: raised-bg box, left border in the mode/agent color
    if (line.kind === "user") {
      const bar = modeColor(runtime.agent.mode);
      const textW = Math.max(4, w - 4);
      const padRow = `${bgRgb(T.panel)} ${bar}▍${" ".repeat(w - 2)}${RESET}`;
      const bodyRows = wrap(line.text, textW).map(
        (part) => `${bgRgb(T.panel)} ${bar}▍ ${rgb(T.text)}${part}${" ".repeat(Math.max(0, w - 4 - visible(part)))}${RESET}`,
      );
      return [padRow, ...bodyRows, padRow];
    }
    // ── assistant — plain indent, markdown
    if (line.kind === "assistant") {
      const clean = formatMemo(line.text);
      const body = mdMemo(clean, Math.max(4, w - 3));
      return body.map((row) => `   ${row}`);
    }
    // ── everything else (ok/err/system) — quiet, indented
    const color = line.kind === "err" ? fgRed : line.kind === "ok" ? fgGreen : fgMuted;
    const out: string[] = [];
    for (const part of wrap(line.text, Math.max(4, w - 3))) {
      out.push(`   ${color(part)}`);
    }
    if ((line.kind === "ok" || line.kind === "err") && likelyDiff(line.text)) {
      return diffTint(out);
    }
    return out;
  };

  // ─── dynamic bottom layout — the input grows upward (max 4 lines) ───
  const inputBudget = () => Math.max(8, cols() - 4);
  /** hard-wrap the raw input for display (ANSI-free); caret lives on the last line */
  const inputVisualLines = (): string[] => {
    const out: string[] = [];
    const budget = inputBudget();
    for (const logical of input.split("\n")) {
      if (!logical) { out.push(""); continue; }
      let rest = logical;
      while (rest.length > 0) {
        const slice = graphemeSlice(rest, budget);
        if (slice.length === 0) break;
        out.push(slice);
        rest = rest.slice(slice.length);
      }
    }
    return out;
  };
  const inputH = () => Math.min(4, Math.max(1, inputVisualLines().length));
  const inputTop = () => Math.max(3, rows() - 2 - inputH());
  const statusRow = () => inputTop() + inputH();

  const ctxPct = (): number => {
    const spec = runtime.agent.modelSpec;
    if (ctxWindowMemo?.spec !== spec) {
      let value = 128000;
      try { value = resolveModel(runtime.config, spec).contextWindow ?? 128000; } catch { /* keep fallback */ }
      ctxWindowMemo = { spec, value };
    }
    const used = runtime.agent.getCost().inputTokens;
    return Math.min(100, Math.round((100 * used) / (ctxWindowMemo?.value ?? 128000)));
  };

  const clampScroll = (target: number) =>
    Math.min(Math.max(0, target), Math.max(0, renderChatLines().length - (inputTop() - 2)));

  const renderChatLines = (): string[] => {
    const out: string[] = [];
    for (const line of lines) out.push(...styledLine(line));
    return out;
  };

  // build base frame rows; overlay draws on top
  const renderRow = (row: number): string => {
    const w = cols();
    const top = inputTop();
    const iH = inputH();
    const sRow = statusRow();
    const bar = modeColor(runtime.agent.mode);
    // ── composer — decreased-raised fill, left border in the mode color
    if (row >= top && row < sRow) {
      const r = row - top;
      if (pendingPermission && row === sRow - 1) {
        const p = pendingPermission;
        const text = ` ${fgAmber("?")} allow ${p.tool}${p.reason ? fgMuted(" · " + p.reason) : ""} ${fgAccent("[y/N]")}`;
        return `${bgRgb(T.composer)}${bar}▍ ${padRight(text, w - 3)}${RESET}`;
      }
      if (input === "" && !pendingPermission) {
        if (r === 0) {
          const placeholder = fgMuted('Ask anything…  "fix the failing test"');
          return `${bgRgb(T.composer)}${bar}▍ ${placeholder}${" ".repeat(Math.max(0, w - visible(placeholder) - 3))}${RESET}`;
        }
        return `${bgRgb(T.composer)}${bar}▍${" ".repeat(w - 2)}${RESET}`;
      }
      const vis = inputVisualLines();
      const shown = vis.slice(Math.max(0, vis.length - iH));
      const isLastLine = r === iH - 1;
      const visLine = (shown[r] ?? "") + (isLastLine ? fgAccent("▌") : "");
      const plain = (shown[r] ?? "") + (isLastLine ? "▌" : "");
      return `${bgRgb(T.composer)}${bar}▍ ${rgb(T.text)}${visLine}${" ".repeat(Math.max(0, w - 3 - visible(plain)))}${RESET}`;
    }
    // ── metadata row — "╹" notch: mode/model (or spinner while busy) ← effort →
    if (row === sRow) {
      const notch = `${bar}╹${RESET}`;
      if (busy) {
        const left = `${fgCyan(spinnerFrame())} ${fgText("working")}  ${fgMuted("esc interrupt")}`;
        return `${bgRgb(T.bg)}${notch} ${left}${" ".repeat(Math.max(1, w - visible(left) - 2))}${RESET}`;
      }
      const model = (runtime.agent.modelSpec.split("/").pop() ?? runtime.agent.modelSpec).slice(0, Math.max(12, Math.floor(w / 2)));
      const mode = runtime.agent.mode;
      const left = `${modeColor(mode)}${BOLD}${mode}${RESET}${fgMuted(" · ")}${fgText(model)}`;
      const right = fgAmber(getEffort());
      const gap = Math.max(1, w - visible(left) - visible(right) - 2);
      return `${bgRgb(T.bg)}${notch} ${left}${" ".repeat(gap)}${right}${RESET}`;
    }
    // ── footer — opencode prompt hints left, real usage right
    if (row === rows() - 1) {
      const key = (k: string, label: string) => `${BOLD}${fgText(k)}${RESET} ${fgMuted(label)}`;
      const left = ` ${key("⇥", "agents")}${w >= 52 ? `  ${key("⌃j", "newline")}` : ""}`;
      const cost = runtime.agent.getCost();
      const usage = `${(cost.inputTokens / 1000).toFixed(1)}K ${ctxPct()}% · $${cost.costUsd.toFixed(4)}`;
      const right = w >= 74 ? `${fgMuted(usage)}  ${key("^p", "commands")}` : w >= 44 ? fgMuted(usage) : fgMuted("^p");
      const gap = Math.max(1, w - visible(left) - visible(right));
      return `${bgRgb(T.bg)}${left}${" ".repeat(gap)}${right}${RESET}`;
    }
    const chatLines = renderChatLines();
    const end = Math.max(0, chatLines.length - scroll);
    const start = Math.max(0, end - top);
    const line = chatLines[start + row] ?? "";
    if (sidebarWidth() > 0 && row < top) {
      const sideW = sidebarWidth();
      const sideX = cols() - sideW;
      const side = renderSidebarRow(row);
      const clipped = visible(line) > sideX ? padRight(clip(line, sideX), sideX) : padRight(line, sideX);
      return `${clipped}${side}`;
    }
    return padRight(line, w);
  };

  const todoMarker = (status: string): string =>
    status === "completed" ? fgGreen("✓") : status === "in_progress" ? fgAmber("◐") : status === "blocked" ? fgRed("✗") : fgMuted("○");

  const renderSidebarRow = (row: number): string => {
    const w = sidebarWidth();
    const line = (t: string) => `${bgRgb(T.panel)}${padRight(" " + t, w)}${RESET}`;
    const heading = (t: string) => line(`${BOLD}${fgText(t)}${RESET}`);
    switch (row) {
      case 0: return line(`${BOLD}${fgText(sessionTitle.slice(0, Math.max(4, w - 2)))}${RESET}`);
      case 1: return line(branch ? fgMuted(`⎇ ${branch}`) : "");
      case 3: return heading("Todo");
      case 4: case 5: case 6: case 7: case 8: case 9: {
        const i = row - 4;
        if (todos.length === 0) return row === 4 ? line(fgMuted("(none)")) : line("");
        const shown = todos.slice(0, 6);
        if (i < shown.length) {
          const t = shown[i];
          const text = t.text.length > w - 4 ? t.text.slice(0, Math.max(1, w - 5)) + "…" : t.text;
          const done = t.status === "completed";
          return line(`${todoMarker(t.status)} ${done ? fgMuted(text) : fgText(text)}`);
        }
        if (i === shown.length && todos.length > shown.length) return line(fgMuted(`… ${todos.length - shown.length} more`));
        return line("");
      }
      case 11: return heading("Context");
      case 12: {
        const cost = runtime.agent.getCost();
        return line(fgText(`${(cost.inputTokens / 1000).toFixed(1)}K (${ctxPct()}%)`));
      }
      case 13: return line(fgMuted(`$${runtime.agent.getCost().costUsd.toFixed(4)} spent`));
      case 15: return heading("Session");
      case 16: return line(fgMuted(`${shortId} · ${cwd.split("/").pop() ?? cwd}`));
      case 18: return heading("Skills & MCP");
      case 19: return line(fgText(`${runtime.skills.list().length} skills`) + fgMuted(" · ") + fgText(`${runtime.mcp.listServerNames().length} MCP`));
      default: return line("");
    }
  };

  const render = () => {
    const w = cols();
    const r = rows();
    const frame: string[] = [];
    for (let row = 0; row < r; row++) frame.push(renderRow(row));
    if (overlay.kind !== "none") drawOverlay(frame, overlay);
    process.stdout.write("\x1b[H");
    for (let i = 0; i < frame.length; i++) {
      process.stdout.write(clip(frame[i], w) + "\x1b[K\r\n");
    }
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
                const wide = cols() >= 96;
                const narrow = cols() < 72;
                const aliasW = narrow ? 14 : 26;
                const map = modelMap();
                return filteredModels(q).map((m) => {
                  const cfg = map[`${m.provider}/${m.model}`] ?? map[m.alias];
                  const left = `${fgAccent(m.alias.slice(0, aliasW).padEnd(aliasW + 1))}${m.free ? fgGreen("FREE ") : fgMuted("     ")}${wide && !narrow ? fgMuted(ctxLabel(cfg?.contextWindow).padEnd(6)) : ""}`;
                  const right = fgMuted(wide ? [priceLabel(cfg).padEnd(11), m.provider].join("").trim() : priceLabel(cfg));
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

    if (ov.kind === "variant") {
      const height = EFFORTS.length + 4;
      const { width, top, left } = centerPanel(r, w, height);
      const innerW = width - 2;
      const lines = [
        panelBorder("Effort", innerW),
        panelSide(`${fgMuted("Set reasoning effort for this session:")}`, innerW, C.panel),
      ];
      EFFORTS.forEach((effort, i) => {
        const selected = i === ov.index;
        const marker = selected ? `${bgRgb(C.panel3)}${fgAccent(BOLD + " › " + effort.padEnd(8))}${RESET}` : `   ${fgText(effort)}`;
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
  const pendingToolIdx: number[] = [];
  const pushLine = (kind: LineKind, text: string) => {
    lines.push({ kind, text });
    scroll = 0;
    render();
  };
  const appendAssistant = (text: string) => {
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
    onToolCall: (call) => {
      const activity = makeActivity(call.name, call.arguments);
      lines.push({ kind: "tool", text: "", activity });
      pendingToolIdx.push(lines.length - 1);
      scroll = 0;
      render();
    },
    onToolResult: (name, r) => {
      // pair with the oldest pending call of the same name (FIFO)
      let slot = pendingToolIdx.findIndex((i) => lines[i].activity?.name === name);
      if (slot === -1) slot = 0;
      const at = pendingToolIdx.splice(slot, 1)[0];
      const target = at !== undefined ? lines[at] : undefined;
      if (target?.activity) {
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

  // current defaultEffort from global config if any (persisted across sessions)
  let defaultEffort = "max";
  try {
    const raw = process.env.XMINAL_DEFAULT_EFFORT;
    if (raw && ["low", "medium", "high", "max"].includes(raw)) defaultEffort = raw;
  } catch { /* ignore */ }
  const getEffort = () => defaultEffort;

  const setEffort = (effort: string) => {
    defaultEffort = effort;
    pushLine("ok", `effort → ${effort} (this session)`);
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
    if (name === "/variant" || name === "/effort" || name === "/reasoning") { overlay = { kind: "variant", index: 3 }; input = ""; cursor = 0; render(); return true; }
    return false;
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

    scroll = 0;
    pushLine("user", text);
    busy = true;
    render();
    void (async () => {
      try {
        await runtime.agent.run(text);
      } catch (error) {
        pushLine("err", (error as Error).message);
      } finally {
        busy = false;
        flushRender();
        render();
      }
    })();
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

  const overlayUp = () => { if (overlay.kind === "palette" || overlay.kind === "model") { paletteIndex = Math.max(0, paletteIndex - 1); } else if (overlay.kind === "provider") { overlay.index = Math.max(0, overlay.index - 1); } else if (overlay.kind === "variant") { overlay.index = Math.max(0, overlay.index - 1); } };
  const overlayDown = () => {
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
        runCommandLine(cmd.name);
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
    if (overlay.kind === "variant") {
      const effort = EFFORTS[overlay.index];
      setEffort(effort);
      overlay = { kind: "none" };
      render();
      return true;
    }
    return false;
  };

  const onData = (chunk: Buffer) => {
    const s = chunk.toString("utf8");

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
    if (s === "\x0c") { render(); return; }
    if (s === "\x1b[5~") { scroll = clampScroll(scroll + 8); render(); return; }
    if (s === "\x1b[6~") { scroll = clampScroll(scroll - 8); render(); return; }
    const wheel = /^(?:\x1b\[<(\d+);\d+;\d+[Mm])$/.exec(s);
    if (wheel) {
      const button = Number(wheel[1]);
      if (button === 64 || button === 65) {
        if (overlay.kind === "palette" || overlay.kind === "model" || overlay.kind === "provider" || overlay.kind === "variant") {
          for (let i = 0; i < 4; i++) { if (button === 64) overlayUp(); else overlayDown(); }
        } else {
          scroll = clampScroll(scroll + (button === 64 ? 4 : -4));
        }
        render();
        return;
      }
    }
    if (s === "\x1b") { // Esc
      if (overlay.kind !== "none") { overlay = { kind: "none" }; render(); return; }
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
    if (s === "\x7f" || s === "\b") {
      if (cursor > 0) {
        if (overlay.kind === "provider-key") { overlay.input = overlay.input.slice(0, overlay.input.length - 1); render(); return; }
        if (overlay.kind === "model") { overlay.query = overlay.query.slice(0, overlay.query.length - 1); paletteIndex = 0; render(); return; }
        input = input.slice(0, cursor - 1) + input.slice(cursor);
        cursor -= 1;
        if (overlay.kind === "palette" && !input.startsWith("/")) overlay = { kind: "none" };
        render();
      }
      return;
    }
    if (s === "\x1b[A") { if (!moveMultilineCursor(-1)) overlayUp(); render(); return; }
    if (s === "\x1b[B") { if (!moveMultilineCursor(1)) overlayDown(); render(); return; }
    if (s === "\x10") { overlay = overlay.kind === "palette" ? { kind: "none" } : { kind: "palette", index: 0 }; render(); return; }

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
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("data", onData);
  render();

  if (!process.env.XMINAL_MODELS_OFFLINE) { // refresh catalog from models.dev in the background when stale
    void (async () => {
      try {
        const result = await refreshModelsCatalog({ force: false });
        if (result.source === "fresh" && !closed) {
          pushLine("system", fgMuted(`model catalog refreshed · ${result.modelCount} models · ${result.freeCount} free`));
          render();
        } else if (!result.ok && !closed) {
          pushLine("system", fgMuted(`model catalog refresh failed (${result.error ?? "unknown"}) — using bundled/cached catalog`));
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
