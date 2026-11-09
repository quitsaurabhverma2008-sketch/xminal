const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;

async function loadOpenTui() {
  // @opentui/core is ESM-only and Bun-only for the native renderer.
  return dynamicImport("@opentui/core");
}
import path from "node:path";
import { Runtime } from "../runtime";
import { resolveModel } from "../config/config";
import { VERSION, TAGLINE } from "../version";
import { loadTodos, detectGitBranch, type TodoItem } from "./state";
import { loadToolUsage, formatTokens } from "../core/tool-usage";
import type { AgentCallbacks, AgentMode } from "../core/agent";
import { Renderer } from "../cli/render";

const T = {
  bg: "#1a1b26",
  surface: "#1e2030",
  panel: "#222436",
  element: "#292e42",
  border: "#3b4261",
  borderSubtle: "#3b4261",
  text: "#c8d3f5",
  muted: "#828bb8",
  accent: "#82aaff",
  accent2: "#86e1fc",
  violet: "#c099ff",
  green: "#c3e88d",
  yellow: "#ffc777",
  red: "#ff757f",
};

interface Cmd {
  name: string;
  desc: string;
}

const COMMANDS: Cmd[] = [
  { name: "/help", desc: "show commands" },
  { name: "/model", desc: "switch model" },
  { name: "/mode", desc: "switch plan/build/compose/review/yolo" },
  { name: "/undo", desc: "undo last edit" },
  { name: "/sessions", desc: "list sessions" },
  { name: "/cost", desc: "token usage" },
  { name: "/tools", desc: "tool usage" },
  { name: "/mcp", desc: "MCP servers" },
  { name: "/skills", desc: "list skills" },
  { name: "/doctor", desc: "environment check" },
];

export async function startTui(runtime: Runtime): Promise<void> {
  try {
    return await startTuiInner(runtime);
  } catch (error) {
    console.error("xminal TUI error:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    throw error;
  }
}

async function startTuiInner(runtime: Runtime): Promise<void> {
  const o = await loadOpenTui();
  const {
    createCliRenderer,
    BoxRenderable,
    TextRenderable,
    ScrollBoxRenderable,
    InputRenderable,
    InputRenderableEvents,
    TextAttributes,
  } = o;
  const cwd = runtime.cwd;
  const todos = loadTodos(cwd);
  const gitBranch = detectGitBranch(cwd);
  const mcpCount = runtime.mcp.listServerNames().length;
  const shortId = runtime.session.id.slice(0, 8);
  const sessionTitle = runtime.session.meta.title === "untitled" ? "new session" : runtime.session.meta.title;

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    backgroundColor: T.bg,
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try { renderer.destroy(); } catch { /* best effort */ }
    process.stdout.write("\x1b[?1049l\x1b[?25h\x1b[0m\n");
    runtime.close();
    process.exit(0);
  };

  // ---------- root layout ----------
  const width = renderer.terminalWidth;
  const height = renderer.terminalHeight;
  const sidebarWidth = 42;

  const root = new BoxRenderable(renderer, {
    flexDirection: "column",
    width,
    height,
    backgroundColor: T.bg,
  });

  const topRow = new BoxRenderable(renderer, {
    flexDirection: "row",
    flexGrow: 1,
    backgroundColor: T.bg,
  });

  const chatCol = new BoxRenderable(renderer, {
    flexDirection: "column",
    flexGrow: 1,
    backgroundColor: T.bg,
  });

  const header = new TextRenderable(renderer, {
    content: ` ${runtime.agent.modelSpec}  ·  mode ${runtime.agent.mode}  ·  $${runtime.agent.getCost().costUsd.toFixed(4)}`,
    fg: T.muted,
    height: 1,
  });
  chatCol.add(header);

  const scrollbox = new ScrollBoxRenderable(renderer, {
    flexGrow: 1,
    backgroundColor: T.bg,
    verticalScrollbarOptions: { visible: false },
    horizontalScrollbarOptions: { visible: false },
  });
  chatCol.add(scrollbox);

  const input = new InputRenderable(renderer, {
    id: "prompt",
    placeholder: "ask xminal…  (/ commands)",
    width: "100%",
    backgroundColor: T.surface,
    focusedBackgroundColor: T.panel,
    textColor: T.text,
    cursorColor: T.accent,
  });
  const promptBox = new BoxRenderable(renderer, {
    border: true,
    borderStyle: "rounded",
    borderColor: T.border,
    backgroundColor: T.surface,
    height: 3,
  });
  promptBox.add(input);
  chatCol.add(promptBox);

  // ---------- sidebar ----------
  const sidebar = new BoxRenderable(renderer, {
    width: sidebarWidth,
    height: "100%",
    flexDirection: "column",
    backgroundColor: T.surface,
    padding: 1,
    gap: 1,
  });

  const sessionNode = new TextRenderable(renderer, {
    content: `◆ ${sessionTitle}`,
    fg: T.text,
    attributes: TextAttributes.BOLD,
  });
  sidebar.add(sessionNode);

  const idNode = new TextRenderable(renderer, { content: shortId, fg: T.muted });
  sidebar.add(idNode);

  const locationNode = new TextRenderable(renderer, {
    content: `${path.basename(cwd)}${gitBranch ? `  ⎇ ${gitBranch}` : ""}`,
    fg: T.muted,
  });
  sidebar.add(locationNode);

  const todosNode = new TextRenderable(renderer, {
    content: renderTodos(todos),
    fg: T.text,
  });
  sidebar.add(todosNode);

  const mcpNode = new TextRenderable(renderer, {
    content: `MCP  ${mcpCount === 0 ? "(none)" : runtime.mcp.listServerNames().join(", ")}`,
    fg: T.muted,
  });
  sidebar.add(mcpNode);

  const countsNode = new TextRenderable(renderer, {
    content: `SKILLS  ${runtime.skills.list().length}   TOOLS  ${runtime.tools.names().length}`,
    fg: T.muted,
  });
  sidebar.add(countsNode);

  topRow.add(chatCol);
  topRow.add(sidebar);
  root.add(topRow);

  const footer = new TextRenderable(renderer, {
    content: " / commands · Tab mode · Ctrl+B sidebar · Ctrl+C quit",
    fg: T.muted,
    height: 1,
  });
  root.add(footer);

  renderer.root.add(root);

  // ---------- agent wiring ----------
  const pushLine = (kind: "user" | "assistant" | "tool" | "ok" | "err" | "system", text: string) => {
    if (closed) return;
    const fg =
      kind === "user" ? T.accent2
      : kind === "tool" ? T.yellow
      : kind === "ok" ? T.green
      : kind === "err" ? T.red
      : kind === "system" ? T.muted
      : T.text;
    scrollbox.add(new TextRenderable(renderer, { content: text, fg }));
    input.focus();
  };

  let streamingNode: any = null;
  const callbacks: AgentCallbacks = {
    onText: (text: string) => {
      if (closed) return;
      if (!streamingNode) {
        streamingNode = new TextRenderable(renderer, { content: "", fg: T.text });
        scrollbox.add(streamingNode);
      } else {
        streamingNode.content += text;
      }
    },
    onToolCall: (call) => pushLine("tool", `● ${call.name}(${call.arguments.slice(0, 60)})`),
    onToolResult: (_n, r) => pushLine(r.isError ? "err" : "ok", `${r.isError ? "✗" : "✓"} ${(r.content.split("\n")[0] ?? "").slice(0, 100)}`),
    onStatus: (m) => pushLine("system", `· ${m}`),
    onUsage: () => {
      if (closed) return;
      const cost = runtime.agent.getCost();
      header.content = ` ${runtime.agent.modelSpec}  ·  mode ${runtime.agent.mode}  ·  $${cost.costUsd.toFixed(4)}`;
    },
  };
  runtime.agent.setCallbacks?.(callbacks);

  // ---------- keyboard handling ----------
  const MODES: AgentMode[] = ["build", "plan", "compose", "review", "yolo"];
  renderer.keyInput.on("keypress", async (key: any) => {
    const k = key;
    if (k.name === "tab") {
      const idx = MODES.indexOf(runtime.agent.mode);
      const next = MODES[(idx + 1) % MODES.length];
      runtime.setMode(next);
      pushLine("system", `mode → ${next}`);
      header.content = ` ${runtime.agent.modelSpec}  ·  mode ${runtime.agent.mode}  ·  $${runtime.agent.getCost().costUsd.toFixed(4)}`;
      return;
    }
    if (k.ctrl && k.name === "b") {
      sidebar.destroy();
      return;
    }
    if (k.ctrl && k.name === "c") {
      close();
      return;
    }
    if (k.name === "pageup") {
      scrollbox.scrollBy(-Math.max(1, Math.floor((scrollbox.height as number) / 2)));
      return;
    }
    if (k.name === "pagedown") {
      scrollbox.scrollBy(Math.max(1, Math.floor((scrollbox.height as number) / 2)));
      return;
    }
  });

  input.on(InputRenderableEvents.ENTER, async (value: string) => {
    const text = value.trim();
    input.value = "";
    if (!text) return;
    if (text.startsWith("/")) {
      await handleSlash(text, runtime, renderer, close, pushLine);
      return;
    }
    pushLine("user", `you ▸ ${text}`);
    streamingNode = null;
    try {
      const result = await runtime.agent.run(text);
      streamingNode = null;
      if (result.stoppedReason !== "done") pushLine("err", `stopped: ${result.stoppedReason}`);
    } catch (error) {
      pushLine("err", (error as Error).message);
    }
  });

  // ---------- startup ----------
  const logo = [
    "███╗   ███╗██╗███╗   ██╗ █████╗ ██╗",
    "╚██╗██╔╝███╗ ████║██║██╔██╗ ██║██╔══██╗██║",
    " ╚███╔╝ ██╔████╔██║██║██╔██╗ ██║███████║██║",
    " ██╔██╗ ██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║",
    "██╔╝ ██╗██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗",
    "╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝",
  ].join("\n");
  pushLine("system", logo + "\n" + `xminal v${VERSION} — ${TAGLINE}`);
  pushLine("system", `session ${shortId} · model ${runtime.agent.modelSpec} · ${path.basename(cwd)}`);
  pushLine("system", "Tab switches plan/build/compose/review/yolo · Ctrl+B toggles sidebar · Ctrl+C quits · / commands");
  try {
    resolveModel(runtime.config, runtime.agent.modelSpec);
  } catch {
    pushLine("err", "no working provider — set OPENROUTER_API_KEY or run /doctor");
  }
  input.focus();

  await new Promise<void>((resolve) => {
    renderer.on("destroy", () => resolve());
  });
  runtime.close();
}

function renderTodos(todos: TodoItem[]): string {
  if (todos.length === 0) return "TODOS  (none)";
  const done = todos.filter((t) => t.status === "completed").length;
  const lines = todos.slice(0, 8).map((t) => {
    const box = t.status === "completed" ? "✓" : t.status === "in_progress" ? "▸" : "○";
    return `${box} ${t.text.slice(0, 34)}`;
  });
  return `TODOS  ${done}/${todos.length}\n${lines.join("\n")}`;
}

async function handleSlash(
  input: string,
  runtime: Runtime,
  renderer: any,
  close: () => void,
  pushLine: (kind: "user" | "assistant" | "tool" | "ok" | "err" | "system", text: string) => void,
): Promise<void> {
  const cmd = input.trim();
  if (cmd === "/exit" || cmd === "/quit") {
    close();
    return;
  }
  if (cmd === "/doctor" || cmd === "/help" || cmd === "/model" || cmd === "/mcp" || cmd === "/skills" || cmd === "/cost" || cmd === "/tools" || cmd === "/sessions") {
    const { handleCommand } = await import("../cli/commands");
    const cliRenderer = new Renderer();
    // leave alternate screen temporarily
    process.stdout.write("\x1b[?1049l\x1b[?25h\n");
    const ctx = {
      runtime,
      renderer: cliRenderer,
      cwd: runtime.cwd,
      exit: () => process.exit(0),
      restart: () => undefined,
      ask: async () => null,
    };
    try {
      await handleCommand(cmd, ctx as Parameters<typeof handleCommand>[1]);
    } catch (error) {
      cliRenderer.error((error as Error).message);
    }
    process.stdout.write("\npress Enter to return to XMINAL…\n");
    await new Promise<void>((resolve) => {
      const onData = () => { process.stdin.removeListener("data", onData); resolve(); };
      process.stdin.once("data", onData);
    });
    process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
    return;
  }
  pushLine("system", `unknown command: ${cmd}`);
}
