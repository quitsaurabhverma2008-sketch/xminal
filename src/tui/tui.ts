import { Runtime } from "../runtime";
import { resolveModel } from "../config/config";
import path from "node:path";
import { visibleLength, pad, truncate } from "../util/ansi";
import { VERSION, TAGLINE } from "../version";
import { theme, reset, rule, box, tag, statusPill, formatCost, modeColor, bgFill } from "./engine";
import { loadTodos, detectGitBranch, type TodoItem } from "./state";
import { matchCommands, wrapText } from "./layout";
import type { AgentCallbacks, AgentMode } from "../core/agent";
import { Renderer } from "../cli/render";
import { Renderer as ClassicRenderer } from "../cli/render";

const LOGO = [
  "███╗   ███╗██╗███╗   ██╗ █████╗ ██╗     ",
  "████╗ ████║██║████╗  ██║██╔══██╗██║     ",
  "██╔████╔██║██║██╔██╗ ██║███████║██║     ",
  "██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║     ",
  "██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗",
  "╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝",
];

const COMMANDS: Array<{ name: string; desc: string }> = [
  { name: "/help", desc: "show all commands" },
  { name: "/model", desc: "show or switch model (provider/model)" },
  { name: "/models", desc: "list providers and aliases" },
  { name: "/mode", desc: "switch plan/build/compose/review/yolo" },
  { name: "/permissions", desc: "show or set ask/auto/full" },
  { name: "/status", desc: "session and agent status" },
  { name: "/cost", desc: "token usage and spend" },
  { name: "/tools", desc: "per-tool token usage" },
  { name: "/sessions", desc: "list sessions" },
  { name: "/new", desc: "start a new session" },
  { name: "/resume", desc: "resume a session (latest)" },
  { name: "/undo", desc: "undo last checkpoint" },
  { name: "/rewind", desc: "restore a checkpoint" },
  { name: "/checkpoints", desc: "list checkpoints" },
  { name: "/compact", desc: "compact conversation" },
  { name: "/memory", desc: "memory list/add/search/forget" },
  { name: "/skills", desc: "list skills; --lock/--verify to trust" },
  { name: "/mcp", desc: "list MCP servers + per-tool usage" },
  { name: "/audit", desc: "verify hash-chained audit log" },
  { name: "/doctor", desc: "environment diagnostics" },
  { name: "/verify", desc: "run project verification" },
  { name: "/ralph", desc: "iterate until verify passes" },
  { name: "/tasks", desc: "show the task list" },
  { name: "/diff", desc: "git diff" },
  { name: "/git", desc: "run a git command" },
  { name: "/init", desc: "initialize .xminal in this project" },
  { name: "/brain", desc: "show BRAIN.md" },
  { name: "/features", desc: "show the feature matrix" },
  { name: "/clear", desc: "clear this screen" },
  { name: "/exit", desc: "quit XMINAL" },
];

type LineKind = "user" | "assistant" | "system" | "tool" | "ok" | "err";
interface TuiLine { kind: LineKind; text: string }
interface PermissionAsk { tool: string; reason: string; resolve: (allow: boolean) => void }

export async function startTui(runtime: Runtime): Promise<void> {
  const cwd = runtime.cwd;
  let closed = false;
  let busy = false;
  let scroll = 0;
  let statusHint = "";
  let panelMode: "chat" | "sessions" | "help" = "chat";
  let sidebarVisible = (process.stdout.columns ?? 80) >= 100;
  let paletteOpen = false;
  let paletteIndex = 0;
  let todos = loadTodos(cwd);
  const gitBranch = detectGitBranch(cwd);
  let mcpSummary: Array<{ server: string; tools: number | "?" }> = runtime.mcp
    .listServerNames()
    .map((server) => ({ server, tools: "?" }));

  const lines: TuiLine[] = [];
  let input = "";
  let cursor = 0;
  let pendingPermission: PermissionAsk | null = null;
  let inCodeBlock = false;

  const cols = () => Math.max(40, process.stdout.columns ?? 80);
  const rows = () => Math.max(16, process.stdout.rows ?? 24);
  const sidebarWidth = () => (sidebarVisible ? 44 : 0);
  const chatWidth = () => Math.max(20, cols() - sidebarWidth());
  const sbHeight = () => Math.max(4, rows() - 5);

  const sessionTitle = runtime.session.meta.title === "untitled" ? "new session" : runtime.session.meta.title;
  const shortId = runtime.session.id.slice(0, 8);

  // ---------- rendering helpers ----------
  const wrapKindPrefix = (kind: LineKind): { prefix: string; body: number } => {
    const w = chatWidth();
    switch (kind) {
      case "user": return { prefix: theme.cyan + "you ▸ " + reset, body: w - 6 };
      case "assistant": return { prefix: theme.accent + "xminal ▸ " + reset, body: w - 9 };
      case "tool": return { prefix: theme.yellow + " ● " + reset, body: w - 3 };
      case "ok": return { prefix: theme.green + " ✓ " + reset, body: w - 3 };
      case "err": return { prefix: theme.red + " ✗ " + reset, body: w - 3 };
      default: return { prefix: theme.muted + " · " + reset, body: w - 3 };
    }
  };

  const renderLines = (): string[] => {
    const out: string[] = [];
    for (const line of lines) {
      const { prefix, body } = wrapKindPrefix(line.kind);
      const parts = wrapText(line.text, Math.max(4, body));
      for (let i = 0; i < parts.length; i++) {
        out.push((i === 0 ? prefix : " ".repeat(2)) + parts[i]);
      }
    }
    return out;
  };

  const fgClip = (line: string, width: number, bg: [number, number, number]): string => {
    // Fill a line with the raised background and clip inner resets to foreground-only.
    const safe = line.replace(/\x1b\[0m/g, "\x1b[39m");
    const visible = visibleLength(safe);
    const fill = Math.max(0, width - visible);
    return `\x1b[48;2;${bg[0]};${bg[1]};${bg[2]}m${safe}${" ".repeat(fill)}${reset}`;
  };

  const renderSidebar = (x: number, y: number, width: number, height: number): string[] => {
    const inner = width;
    const raised = theme.raisedRgb;
    const line = (content: string) => fgClip(content, inner, raised);
    const blank = () => bgFill(raised, inner);
    const out: string[] = [];
    out.push(line(`${theme.accent}◆${reset} ${theme.text}${truncate(sessionTitle, inner - 4)}`));
    out.push(line(`${theme.muted}${shortId}`));

    out.push(blank());
    out.push(line(`${theme.muted}LOCATION`));
    out.push(line(`${theme.text}${path.basename(cwd)}`));
    if (gitBranch) out.push(line(`${theme.muted}⎇ ${theme.accent2}${truncate(gitBranch, inner - 4)}`));

    out.push(blank());
    const done = todos.filter((t) => t.status === "completed").length;
    out.push(line(`${theme.muted}TODOS${reset} ${theme.muted}${done}/${todos.length}`));
    if (todos.length === 0) {
      out.push(line(`${theme.muted}(no tasks)`));
    } else {
      for (const todo of todos.slice(0, 9)) {
        out.push(line(`${statusPill(todo.status)}${theme.text}${truncate(todo.text, inner - 4)}`));
      }
      if (todos.length > 9) out.push(line(`${theme.muted}… +${todos.length - 9} more`));
    }

    out.push(blank());
    out.push(line(`${theme.muted}MCP`));
    if (mcpSummary.length === 0) {
      out.push(line(`${theme.muted}(none)`));
    } else {
      for (const { server, tools } of mcpSummary) {
        out.push(line(`${theme.green}●${reset} ${theme.text}${truncate(server, inner - 8)} ${theme.muted}${tools}t`));
      }
    }

    out.push(blank());
    out.push(line(`${theme.muted}SKILLS${reset} ${theme.text}${runtime.skills.list().length}`));
    out.push(line(`${theme.muted}TOOLS${reset} ${theme.text}${runtime.tools.names().length}`));
    while (out.length < height) out.push(blank());
    return out.slice(0, height);
  };

  const renderHeader = (): string[] => {
    const w = cols();
    const cost = runtime.agent.getCost();
    const logo = theme.accent + LOGO[0] + reset;
    const titleRight = theme.muted + (sessionTitle === "new session" ? "new session" : sessionTitle) + reset;
    const line0 = theme.accent + logo + " " + reset + titleRight;
    const metaLeft = `${theme.accent}${runtime.agent.modelSpec}${reset} ${theme.muted}·${reset} ${modeColor(runtime.agent.mode)}${runtime.agent.mode}${reset} ${theme.muted}·${reset} ${theme.yellow}${runtime.permissions.mode}${reset}`;
    const metaRight = `${theme.muted}${formatCost(cost.costUsd)} · ${cost.turns} turns${reset}`;
    const line1 = truncate(metaLeft, Math.max(10, w - visibleLength(metaRight) - 2)) +
      " ".repeat(Math.max(1, w - visibleLength(metaLeft) - visibleLength(metaRight) - 1)) + metaRight;
    return [pad(truncate(line0, w), w), pad(truncate(line1, w), w), rule(w)];
  };

  const renderInput = (): string[] => {
    const w = chatWidth();
    const out: string[] = [];
    const border = theme.border;
    const line = `${border}│${reset} `;
    out.push(border + "┌" + "─".repeat(Math.max(0, w - 2)) + "┐" + reset);
    if (pendingPermission) {
      const ask = pendingPermission;
      const prompt = `${theme.yellow}? allow ${ask.tool}${reset} ${theme.muted}(${truncate(ask.reason, w - 20)})${reset} ${theme.cyan}[y/N]${reset}`;
      out.push(line + pad(truncate(prompt, w - 3), w - 3) + border + "│" + reset);
    } else {
      const placeholder = input === "" ? `${theme.muted}ask anything…  ( / for commands )${reset}` : "";
      out.push(line + pad(truncate(theme.accent + "› " + reset + input + placeholder, w - 3), w - 3) + border + "│" + reset);
    }
    out.push(border + "└" + "─".repeat(Math.max(0, w - 2)) + "┘" + reset);
    return out;
  };

  const renderPalette = (): string[] => {
    if (!paletteOpen) return [];
    const w = Math.min(64, cols() - 8);
    const q = input.toLowerCase();
    const items = COMMANDS.filter((c) => c.name.startsWith(q));
    const shown = items.slice(0, 8);
    const out: string[] = [];
    out.push(theme.border + "┌─ " + theme.accent + "COMMANDS" + theme.muted + `  ${items.length} match${items.length === 1 ? "" : "es"}` + theme.border + " " + "─".repeat(Math.max(0, w - 22)) + "┐" + reset);
    if (shown.length === 0) {
      out.push(theme.border + "│ " + theme.muted + "no matches" + reset + pad("", w - 13) + theme.border + "│" + reset);
    } else {
      shown.forEach((item, i) => {
        const selected = i === paletteIndex;
        const marker = selected ? theme.accent + "› " + reset : "  ";
        const text = `${marker}${theme.text}${item.name}${reset} ${theme.muted}— ${item.desc}${reset}`;
        out.push(theme.border + "│ " + reset + pad(truncate(text, w - 3), w - 3) + theme.border + "│" + reset);
      });
    }
    out.push(theme.border + "└" + "─".repeat(Math.max(0, w - 2)) + "┘" + reset);
    return out;
  };

  const renderFooter = (): string[] => {
    const w = cols();
    const left = ` ${theme.muted}/${reset} ${theme.text}commands${reset}   ${theme.muted}Tab${reset} ${theme.text}mode${reset}   ${theme.muted}Ctrl+B${reset} ${theme.text}sidebar${reset}   ${theme.muted}Ctrl+C${reset} ${theme.text}${busy ? "abort" : "quit"}${reset}   ${theme.muted}Esc${reset} ${theme.text}back${reset}`;
    return [rule(w), pad(truncate(left, w), w)];
  };

  const render = () => {
    const w = cols();
    const messageLines = renderLines();
    const end = Math.max(0, messageLines.length - scroll);
    const view = messageLines.slice(Math.max(0, end - sbHeight()), end);
    const out: string[] = [];
    out.push(...renderHeader());
    const palette = paletteOpen ? renderPalette() : [];
    const effSb = Math.max(2, sbHeight() - palette.length);
    for (let row = 0; row < effSb; row++) {
      const line = view[row] ?? "";
      const chatCol = pad(truncate(line, chatWidth()), chatWidth());
      if (sidebarVisible) {
        const sidebar = renderSidebar(0, row, sidebarWidth(), effSb);
        const sideCol = sidebar[row] ?? " ".repeat(sidebarWidth());
        out.push(chatCol + sideCol);
      } else {
        out.push(chatCol);
      }
    }
    if (palette.length) {
      for (const p of palette) out.push(pad(truncate(p, w), w));
    }
    out.push(rule(w));
    out.push(...renderInput());
    out.push(...renderFooter());
    process.stdout.write("\x1b[H" + out.map((l) => l + "\x1b[K").join("\n"));
  };

  // ---------- runtime plumbing ----------
  const push = (kind: LineKind, text: string) => {
    lines.push({ kind, text });
    scroll = 0;
    render();
  };
  const appendAssistant = (text: string) => {
    inCodeBlock = text.includes("```") ? !inCodeBlock : inCodeBlock;
    const last = lines[lines.length - 1];
    if (last && last.kind === "assistant") {
      last.text += text;
      scroll = 0;
      render();
    } else {
      push("assistant", text);
    }
  };

  const callbacks: AgentCallbacks = {
    onText: (t) => appendAssistant(t),
    onToolCall: (call) => push("tool", `${call.name}(${truncate(call.arguments, 100)})`),
    onToolResult: (_name, result) => push(result.isError ? "err" : "ok", (result.content.split("\n")[0] ?? "").slice(0, 200)),
    onStatus: (m) => push("system", m),
    onUsage: () => render(),
  };
  runtime.agent.setCallbacks?.(callbacks);

  const askPermission = (tool: string, reason?: string): Promise<boolean> =>
    new Promise((resolve) => {
      pendingPermission = { tool, reason: reason ?? "needs approval", resolve };
      render();
    });
  runtime.setAskHandler(askPermission);

  const runAgent = async (text: string) => {
    busy = true;
    statusHint = "working…";
    push("user", text);
    try {
      const result = await runtime.agent.run(text);
      if (result.stoppedReason !== "done") push("err", `stopped: ${result.stoppedReason}`);
    } catch (error) {
      push("err", (error as Error).message);
    } finally {
      busy = false;
      statusHint = "";
      render();
    }
  };

  const refreshTodos = () => {
    todos = loadTodos(cwd);
    render();
  };

  const close = () => {
    if (closed) return;
    closed = true;
    process.stdout.write("\x1b[?1049l\x1b[?25h\x1b[0m\n");
    runtime.close();
    process.exit(0);
  };

  // MCP summary (async, best effort)
  void (async () => {
    try {
      const tools = await Promise.race([
        runtime.mcp.listAllTools(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15_000)),
      ]);
      const counts = new Map<string, number>();
      for (const { server } of tools) counts.set(server, (counts.get(server) ?? 0) + 1);
      mcpSummary = runtime.mcp.listServerNames().map((server) => ({ server, tools: counts.get(server) ?? 0 }));
    } catch {
      mcpSummary = runtime.mcp.listServerNames().map((server) => ({ server, tools: 0 }));
    }
    render();
  })();

  // ---------- raw key handling ----------
  const submitInput = () => {
    const text = input.trim();
    input = "";
    cursor = 0;
    paletteOpen = false;
    if (!text) { render(); return; }
    if (text.startsWith("/")) {
      const cmd = text;
      if (cmd === "/exit" || cmd === "/quit") { if (busy) runtime.agent.abort(); close(); return; }
      if (cmd === "/clear") { lines.length = 0; render(); return; }
      return classicCommand(cmd);
    }
    scroll = 0;
    render();
    void runAgent(text);
  };

  const classicCommand = async (cmdLine: string) => {
    process.stdout.write("\x1b[?1049l\x1b[?25h\n");
    const { handleCommand } = await import("../cli/commands");
    const cliRenderer = new ClassicRenderer();
    const ctx = {
      runtime,
      renderer: cliRenderer,
      cwd,
      exit: () => { closed = true; },
      restart: () => undefined,
      ask: async () => null,
    };
    try {
      await handleCommand(cmdLine, ctx as Parameters<typeof handleCommand>[1]);
    } catch (error) {
      cliRenderer.error((error as Error).message);
    }
    refreshTodos();
    process.stdout.write("\npress any key to return…\n");
    await new Promise<void>((resolve) => {
      const onData = () => { process.stdin.removeListener("data", onData); resolve(); };
      process.stdin.once("data", onData);
    });
    process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
    render();
  };

  const cycleMode = () => {
    const modes: AgentMode[] = ["build", "plan", "compose", "review", "yolo"];
    const index = modes.indexOf(runtime.agent.mode);
    const next = modes[(index + 1) % modes.length];
    runtime.setMode(next);
    push("system", `mode → ${next}`);
  };

  const submitLine = () => submitInput();

  const onData = (chunk: Buffer) => {
    const s = chunk.toString("utf8");
    if (pendingPermission) {
      const ch = s.trim().toLowerCase()[0];
      const allow = ch === "y";
      const prompt = pendingPermission;
      pendingPermission = null;
      push(allow ? "ok" : "err", allow ? `allowed ${prompt.tool}` : `denied ${prompt.tool}`);
      prompt.resolve(allow);
      return;
    }
    if (s === "\x03") {
      if (busy) {
        runtime.agent.abort();
        push("err", "aborted current turn");
      } else {
        close();
      }
      return;
    }
    if (s === "\x0c") { render(); return; } // Ctrl+L
    if (s === "\x1b[5~") { scroll = Math.min(scroll + Math.floor(sbHeight() / 2), Math.max(0, renderLines().length - sbHeight())); render(); return; } // PgUp
    if (s === "\x1b[6~") { scroll = Math.max(0, scroll - Math.floor(sbHeight() / 2)); render(); return; } // PgDn
    if (s === "\x1b[H" || s === "\x1b[1~") { scroll = Math.max(0, renderLines().length - sbHeight()); render(); return; } // Home
    if (s === "\x1b[F" || s === "\x1b[4~") { scroll = 0; render(); return; } // End
    if (s === "\x1b") { paletteOpen = false; render(); return; } // Esc
    if (s === "\t") {
      if (paletteOpen) {
        const items = COMMANDS.filter((c) => c.name.startsWith(input.toLowerCase()));
        if (items.length > 0) {
          input = items[paletteIndex % items.length].name + " ";
          cursor = input.length;
          paletteOpen = false;
          render();
        }
        return;
      }
      cycleMode();
      return;
    }
    if (s === "\x1b[B" || s === "\x1b[A") { // down/up in palette
      if (paletteOpen) {
        const items = COMMANDS.filter((c) => c.name.startsWith(input.toLowerCase()));
        paletteIndex = Math.max(0, Math.min(items.length - 1, paletteIndex + (s === "\x1b[B" ? 1 : -1)));
        render();
        return;
      }
    }
    if (s === "\x02") { sidebarVisible = !sidebarVisible; render(); return; } // Ctrl+B sidebar
    if (s === "\r" || s === "\n") { submitInput(); return; }
    if (s === "\x7f" || s === "\b") {
      if (cursor > 0) {
        input = input.slice(0, cursor - 1) + input.slice(cursor);
        cursor -= 1;
        if (!input.startsWith("/")) paletteOpen = false;
        render();
      }
      return;
    }
    if (s === "\x1b[D") { cursor = Math.max(0, cursor - 1); render(); return; }
    if (s === "\x1b[C") { cursor = Math.min(input.length, cursor + 1); render(); return; }

    // split embedded newlines: text before each newline is submitted
    let rest = s;
    for (;;) {
      const idx = rest.search(/[\r\n]/);
      if (idx === -1) {
        if (rest) {
          for (const ch of rest) {
            if (ch === "\x1b") continue;
            if (ch >= " " && ch !== "\x7f") {
              input = input.slice(0, cursor) + ch + input.slice(cursor);
              cursor += 1;
            }
          }
          if (input.startsWith("/")) {
            paletteOpen = true;
            paletteIndex = 0;
          } else if (paletteOpen && !input.startsWith("/")) {
            paletteOpen = false;
          }
        }
        break;
      }
      const head = rest.slice(0, idx);
      for (const ch of head) {
        if (ch === "\x1b") continue;
        if (ch >= " " && ch !== "\x7f") {
          input = input.slice(0, cursor) + ch + input.slice(cursor);
          cursor += 1;
        }
      }
      submitLine();
      rest = rest.slice(idx + 1);
      if (closed) return;
    }
    render();
  };

  // ---------- enter alternate screen ----------
  process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
  process.stdout.on("resize", render);
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("data", onData);

  push("system", `xminal v${VERSION} — ${TAGLINE}`);
  push("system", `session ${shortId} · model ${runtime.agent.modelSpec} · folder ${path.basename(cwd)}`);
  try {
    resolveModel(runtime.config, runtime.agent.modelSpec);
  } catch {
    push("err", "no working provider yet — run /doctor or set OPENROUTER_API_KEY / ANTHROPIC_API_KEY");
  }

  await new Promise<void>((resolve) => {
    const check = () => (closed ? resolve() : setTimeout(check, 200));
    check();
  });
}
