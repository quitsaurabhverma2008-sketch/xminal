/**
 * XMINAL — Ink frontend entry (the "opencode engine", XMINAL_TUI_ENGINE=ink)
 *
 * Renders XMINAL's runtime behind the actual OpenCode visual language:
 * gradient boot logo, raised user boxes with a mode-colored left border,
 * markdown-rendered assistant text, spinner-driven working line, sidebar,
 * alt-screen — all through Ink (React) with a WebAssembly yoga layout
 * engine. No native modules required; runs anywhere Node ≥ 22 + WASM runs.
 */
import React, { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Box, Text, useApp, useInput, useWindowSize, Spacer } from "ink";
import type { Runtime } from "../runtime";
import type { AgentMode } from "../core/agent";
import { createStore, type Line, type ActivityLine } from "./store";
import { C, modeColor } from "./theme";
import { renderMarkdown } from "../tui/markdown";
import { renderActivity, type ActivityLine as WireActivityLine } from "../tui/output/tool-activity";
import { wrapAnsi } from "../tui/width";
import { loadTodos, detectGitBranch } from "../tui/state";
import { VERSION } from "../version";

const GRADIENT: Array<[number, number, number]> = [
  [134, 225, 252],
  [115, 180, 255],
  [130, 170, 255],
  [139, 140, 247],
  [187, 154, 247],
  [192, 153, 255],
];
const LOGO = [
  "██╗  ██╗███╗   ███╗██╗███╗   ██╗ █████╗ ██╗     ",
  "╚██╗██╔╝████╗ ████║██║████╗  ██║██╔══██╗██║     ",
  " ╚███╔╝ ██╔████╔██║██║██╔██╗ ██║███████║██║     ",
  " ██╔██╗ ██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║     ",
  "██╔╝ ██╗██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗",
  "╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝ ╚═══╝╚═╝  ╚═╝╚══════╝",
];
const TAGLINE = "E V E R Y  C O D I N G  A G E N T .  O N E  T E R M I N A L .";
const PLACEHOLDERS = [
  'Ask anything…  "Fix a TODO in the codebase"',
  'Ask anything…  "What is the tech stack of this project?"',
  'Ask anything…  "Fix broken tests"',
];

function ctxLabel(n: number) {
  return n >= 1_000_000 ? `${(n / 1e6).toFixed(0)}M` : `${Math.round(n / 1000)}K`;
}
const COST_TOK = (n: number) => `${(n / 1000).toFixed(1)}K`;

const formatDuration = (ms: number) =>
  ms < 1000 ? `${ms}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

/* ─────────────────────────────────────────── components ── */

function useStore(store: ReturnType<typeof createStore>) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

function GradientLine({ text, row }: { text: string; row: number }) {
  const [r, g, b] = GRADIENT[Math.min(row, GRADIENT.length - 1)];
  return (
    <Text color={`rgb(${r},${g},${b})`} wrap="truncate">
      {text}
    </Text>
  );
}

function HomeRow({ frame, width }: { frame: number; width: number }) {
  const total = LOGO.length + 2;
  const visible = Math.ceil(frame * (total + 1));
  const start = Math.max(0, Math.floor((24 - total) / 2)); // rows are aspirational; Ink centers vertically later anyway
  const block: React.ReactNode[] = [];
  for (let i = 0; i < total && i < visible; i++) {
    const lineIndex = i - 1; // LOGO starts after one spacer row
    if (lineIndex >= 0 && lineIndex < LOGO.length) {
      block.push(<GradientLine key={i} text={LOGO[lineIndex]} row={lineIndex} />);
    } else if (lineIndex === LOGO.length) {
      block.push(<Text key={i}> </Text>);
    } else {
      block.push(<Text key={i}> </Text>);
    }
  }
  return (
    <Box flexDirection="column" alignItems="center" marginTop={2}>
      {block}
      {frame > 0.8 ? <Text color={C.muted}>{TAGLINE}</Text> : null}
    </Box>
  );
}

function UserRow({ line, width, mode }: { line: Line; width: number; mode: AgentMode }) {
  if (line.text === "") return null;
  const color = modeColor(mode);
  const chunks = wrapAnsi(line.text, Math.max(8, width - 4));
  return (
    <Box borderStyle="single" borderLeft={true} borderTop={false} borderRight={false} borderBottom={false} borderColor={color} backgroundColor={C.panel} paddingX={1} marginBottom={1}>
      <Box flexDirection="column">
        {chunks.map((c, i) => (
          <Text key={i} color={C.text}>
            {c}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

function AssistantRow({ text, width }: { text: string; width: number }) {
  const rows = renderMarkdown(text, { width: Math.max(8, width - 3) });
  return (
    <Box flexDirection="column" paddingLeft={3} marginBottom={1}>
      {rows.map((r, i) => (
        <Text key={i}>{r}</Text>
      ))}
    </Box>
  );
}

function ToolRow({ line, width }: { line: Line; width: number }) {
  const a = line.activity!;
  const rows = renderActivity(a as unknown as WireActivityLine, Math.max(8, width - 1));
  return (
    <Box flexDirection="column" paddingLeft={1} marginBottom={1}>
      {rows.map((r, i) => (
        <Text key={i}>{r}</Text>
      ))}
    </Box>
  );
}

function Transcript({ s, width }: { s: ReturnType<typeof useStore>; width: number }) {
  if (s.lines.length === 0 && !s.busy) {
    return <HomeRow frame={1} width={width} />;
  }
  const rows = s.lines.map((line, i) => {
    if (line.kind === "user") return <UserRow key={i} line={line} width={width} mode={s.mode} />;
    if (line.kind === "assistant") return <AssistantRow key={i} text={line.text} width={width} />;
    if (line.kind === "tool" && line.activity) return <ToolRow key={i} line={line} width={width} />;
    if (line.kind === "err")
      return (
        <Box key={i} paddingLeft={3} marginBottom={1}>
          <Text color={C.red}>✗ {line.text}</Text>
        </Box>
      );
    if (line.kind === "ok")
      return (
        <Box key={i} paddingLeft={3} marginBottom={1}>
          <Text color={C.green}>✓ {line.text}</Text>
        </Box>
      );
    return (
      <Box key={i} paddingLeft={3} marginBottom={1}>
        <Text color={C.muted}>{line.text}</Text>
      </Box>
    );
  });
  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      {rows}
    </Box>
  );
}

function Sidebar({ s, width }: { s: ReturnType<typeof useStore>; width: number }) {
  const todoDone = s.todos.filter((t) => t.status === "completed").length;
  const todos = s.todos.slice(0, 5);
  const pct = Math.min(100, Math.round((100 * s.inputTokens) / s.ctxWindow));
  const line = (node: React.ReactNode, key?: string) => (
    <Box key={key}>
      <Text color={C.muted}> </Text>
      {node}
    </Box>
  );
  return (
    <Box width={width} flexDirection="column" backgroundColor={C.panel} paddingX={2} paddingTop={1}>
      <Text bold color={C.text}>
        {s.sessionTitle.slice(0, width - 4)}
      </Text>
      {s.branch ? <Text color={C.muted}>{"⎇ " + s.branch}</Text> : <Text color={C.muted}>directory</Text>}
      <Box height={1} />
      {todos.length > 0 ? (
        <>
          <Text bold color={C.text}>
            Todo
          </Text>
          {todos.map((t, i) => (
            <Text key={i} color={t.status === "completed" ? C.muted : t.status === "in_progress" ? C.yellow : C.text}>
              {t.status === "completed" ? "✓" : t.status === "in_progress" ? "◐" : "○"} {t.text.length > width - 5 ? t.text.slice(0, Math.max(1, width - 6)) + "…" : t.text}
            </Text>
          ))}
          <Box height={1} />
        </>
      ) : null}
      <Text bold color={C.text}>
        Context
      </Text>
      <Text color={C.text}>
        {COST_TOK(s.inputTokens)} ({pct}%)
      </Text>
      <Text color={C.muted}>${s.costUsd.toFixed(4)} spent</Text>
      <Box height={1} />
      <Text bold color={C.text}>
        Session
      </Text>
      <Text color={C.muted}>{s.sessionShortId} · {s.projectName}</Text>
      <Box height={1} />
      <Text bold color={C.text}>
        Skills & MCP
      </Text>
      <Text color={C.text}>{s.skillsCount} skills · {s.mcpCount} MCP</Text>
    </Box>
  );
}


function Composer({
  store,
  s,
  width,
}: {
  store: ReturnType<typeof createStore>;
  s: TState;
  width: number;
}) {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [caretOn, setCaretOn] = useState(true);

  useEffect(() => {
    if (s.input !== "") return;
    const t = setInterval(() => setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length), 4000);
    return () => clearInterval(t);
  }, [s.input]);

  useEffect(() => {
    const t = setInterval(() => setCaretOn((v) => !v), 530);
    return () => clearInterval(t);
  }, []);

  const lines = s.input.split("\n");
  const caret = caretOn ? "▌" : " ";
  return (
    <Box flexDirection="column">
      {s.pendingPermission ? (
        <Box paddingLeft={2} marginBottom={1}>
          <Text color={C.yellow} bold>{"? "}{s.pendingPermission.tool}</Text>
          <Text color={C.muted}>{s.pendingPermission.reason ? ` · ${s.pendingPermission.reason} ` : " "}[y/N]</Text>
        </Box>
      ) : null}
      {/* opencode: ┃ rule + raised panel, the metadata row lives inside */}
      <Box flexDirection="row">
        <Box width={1} flexShrink={0}>
          <Text color={modeColor(s.mode)}>{"┃"}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} backgroundColor={C.panel2} paddingX={2} paddingTop={1}>
          {s.input === "" ? (
            <Text color={C.muted}>{PLACEHOLDERS[placeholderIndex]}{caret}</Text>
          ) : (
            lines.map((line, i) => (
              <Text key={i} color={C.text}>{line}{i === lines.length - 1 ? caret : ""}</Text>
            ))
          )}
          <Box paddingTop={1} flexDirection="row">
            <Text color={modeColor(s.mode)} bold>{s.mode[0].toUpperCase() + s.mode.slice(1)}</Text>
            <Text color={C.muted}>{" · "}</Text>
            <Text color={C.text}>{s.model.split("/").pop() ?? s.model}</Text>
            <Text color={C.muted}>{" " + (s.model.split("/")[0] ?? "")}</Text>
            <Text color={C.muted}>{" · "}</Text>
            <Text color={C.yellow} bold>{s.effort}</Text>
          </Box>
        </Box>
      </Box>
      {/* the ╹ / ▀ strip that closes the composer */}
      <Box flexDirection="row">
        <Box width={1} flexShrink={0}>
          <Text color={modeColor(s.mode)}>{"╹"}</Text>
        </Box>
        <Box flexGrow={1}>
          <Text color={C.panel2}>{"▀".repeat(Math.max(1, width - 1))}</Text>
        </Box>
      </Box>
    </Box>
  );
}

function WorkingRow({ s }: { s: TState }) {
  if (!s.busy) return null;
  return (
    <Box paddingLeft={2} marginTop={0}>
      <Dots />
      <Text color={C.cyan}> working</Text>
      <Text color={C.muted}> — esc to interrupt</Text>
    </Box>
  );
}

/**
 * A local spinner — the same "dots" animation @inkjs/ui ships, without the
 * dependency (and its prototype-pollution advisory).
 */
const DOT_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function Dots() {
  const [frame, setFrame] = React.useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((n) => (n + 1) % DOT_FRAMES.length), 80);
    return () => clearInterval(timer);
  }, []);
  return <Text color={C.cyan}>{DOT_FRAMES[frame]}</Text>;
}

function QueueRow({ s }: { s: TState }) {
  if (s.queue.length === 0) return null;
  return (
    <Box paddingLeft={2}>
      <Text color={C.yellow}>⇧{s.queue.length} queued</Text>
    </Box>
  );
}

function Footer({ s, width }: { s: TState; width: number }) {
  const pct = Math.min(100, Math.round((100 * s.inputTokens) / s.ctxWindow));
  // opencode: workspace + branch left, context usage + hints right
  const usage = `${COST_TOK(s.inputTokens)} (${pct}%) · $${s.costUsd.toFixed(4)}`;
  const cwd = s.cwd ? s.cwd.replace(process.env.HOME ?? "~", "~") : "";
  const left = s.branch ? `${cwd}:${s.branch}` : cwd;
  return (
    <Box flexDirection="row" width={width}>
      <Text color={C.muted}>{left}</Text>
      <Spacer />
      {width >= 44 ? <Text color={C.muted}>{usage}{"  "}</Text> : null}
      {width >= 64 ? (
        <>
          <Text color={C.text} bold>shift+tab</Text>
          <Text color={C.muted}> agents</Text>
          <Text color={C.text}>{"  "}</Text>
        </>
      ) : null}
      <Text color={C.text} bold>ctrl+p</Text>
      <Text color={C.muted}> commands</Text>
    </Box>
  );
}

type TState = ReturnType<ReturnType<typeof createStore>["get"]>;

export function App({
  store,
  runtime,
  onExit,
}: {
  store: ReturnType<typeof createStore>;
  runtime: Runtime;
  onExit: () => void;
}) {
  const s = useStore(store);
  const { columns, rows } = useWindowSize();
  const width = Math.max(40, columns ?? 80);
  const sidebarWidth = width >= 120 ? 42 : 0;
  const chatWidth = width - sidebarWidth;
  const showHome = s.lines.length === 0 && !s.busy;

  const submit = (raw: string) => {
    const text = raw.trim();
    store.set({ input: "" });
    if (!text) return;
    if (text === "/exit" || text === "/quit") { onExit(); return; }
    if (text.startsWith("/")) {
      if (text.startsWith("/mode")) {
        const MODES: AgentMode[] = ["build", "plan", "compose", "review", "yolo"];
        const idx = MODES.indexOf(runtime.agent.mode);
        const next = MODES[(idx + 1) % MODES.length];
        runtime.setMode(next);
        store.set({ mode: next });
        store.pushLine("system", `mode → ${next}`);
        return;
      }
      if (text.startsWith("/clear")) { store.reset(); return; }
      store.pushLine("system", `command not available in this build: ${text.split(" ")[0]}`);
      return;
    }
    if (store.get().busy) {
      store.set((st) => ({ queue: [...st.queue, text] }));
      store.pushLine("system", `queued: ${text.slice(0, 60)}`);
      return;
    }
    void (async () => {
      const startedAt = Date.now();
      store.set({ busy: true, turnStartedAt: startedAt });
      store.pushLine("user", text);
      try {
        await runtime.agent.run(text);
      } catch (error) {
        store.pushLine("err", (error as Error).message);
      } finally {
        store.set({ busy: false });
        store.pushLine("system", `${BOLD}${runtime.agent.mode === "build" ? "Build" : runtime.agent.mode}${RESET} · ${(runtime.agent.modelSpec.split("/").pop() ?? runtime.agent.modelSpec).slice(0, 40)} · ${formatDuration(Date.now() - startedAt)}`);
        const next = store.get().queue[0];
        if (next !== undefined) {
          store.set((st) => ({ queue: st.queue.slice(1) }));
          // submit() reads from store at call time, so queue order is preserved
          submit(next);
        }
      }
    })();
  };

  useInput((input, key) => {
    // permission prompt takes over the keyboard
    if (s.pendingPermission) {
      const answer = input === "y" || input === "Y" ? "once" : input === "a" || input === "A" ? "always" : input === "n" || input === "N" || key.escape ? "reject" : undefined;
      if (answer !== undefined) {
        const resolve = store.get().permissionResolve;
        store.set({ pendingPermission: undefined, permissionResolve: undefined });
        resolve?.(answer !== "reject");
      }
      return;
    }
    if (key.ctrl && input === "c") { onExit(); return; }
    if (key.escape) {
      if (s.busy) { runtime.agent.abort(); store.pushLine("system", "interrupted"); }
      return;
    }
    if (key.tab) {
      const MODES: AgentMode[] = ["build", "plan", "compose", "review", "yolo"];
      const idx = MODES.indexOf(runtime.agent.mode);
      const next = MODES[(idx + 1) % MODES.length];
      runtime.setMode(next);
      store.set({ mode: next });
      store.pushLine("system", `mode → ${next}`);
      return;
    }
    if (input === "\n" || (key.ctrl && input === "j")) {
      store.set((st) => ({ input: st.input + "\n" }));
      return;
    }
    if (key.return) {
      submit(store.get().input);
      return;
    }
    if (input === "\x7f" || key.backspace) {
      store.set((st) => ({ input: st.input.slice(0, -1) }));
      return;
    }
    if (input) {
      // insert raw characters at the end (caret is always pinned to end)
      store.set((st) => ({ input: st.input + input }));
    }
  });

  return (
    <Box flexDirection="column" width={width} height={rows}>
      {showHome ? (
        <HomeRow frame={1} width={chatWidth} />
      ) : (
        <Box flexDirection="row" flexGrow={1}>
          <Transcript s={s} width={chatWidth} />
          {sidebarWidth > 0 ? <Sidebar s={s} width={sidebarWidth} /> : null}
        </Box>
      )}
      <WorkingRow s={s} />
      <Composer store={store} s={s} width={chatWidth} />
      <QueueRow s={s} />
      <Footer s={s} width={width} />
    </Box>
  );
}

export interface InkTuiOptions {
  cwd: string;
  onExit?: () => void;
}

export async function startInkTui(runtime: Runtime, options: InkTuiOptions): Promise<void> {
  const { cwd } = options;
  const branch = detectGitBranch(cwd);
  const todos = loadTodos(cwd);
  const shortId = runtime.session.id.slice(0, 8);
  const sessionTitle = runtime.session.meta?.title ?? "new session";
  const modelSpec = runtime.agent.modelSpec ?? "opencode/inkling-2-small-free";

  const store = createStore({
    mode: runtime.agent.mode ?? "build",
    model: modelSpec,
    cwd,
    projectName: cwd.split("/").pop() ?? cwd,
    branch,
    sessionTitle,
    sessionShortId: shortId,
    skillsCount: runtime.skills?.list?.()?.length ?? 0,
    mcpCount: runtime.mcp?.listServerNames?.()?.length ?? 0,
    inputTokens: runtime.agent.getCost().inputTokens,
    outputTokens: runtime.agent.getCost().outputTokens,
    costUsd: runtime.agent.getCost().costUsd,
    ctxWindow: 128_000,
    todos: todos.map((t) => ({ id: t.id, text: t.text, status: t.status })),
  });

  // ask-permission → inline [y/N] bar
  runtime.setAskHandler((tool: string, reason?: string) =>
    new Promise<boolean>((resolve) => {
      store.set({ pendingPermission: { tool, reason }, permissionResolve: resolve });
    }),
  );

  // bridge agent callbacks → store mutations
  const callbacks = {
    onText: (chunk: string) => {
      const st = store.get();
      const last = st.lines[st.lines.length - 1];
      if (last && last.kind === "assistant" && last.activity === undefined) {
        store.set((prev) => {
          const lines = [...prev.lines];
          lines[lines.length - 1] = { ...last, text: last.text + chunk };
          return { lines };
        });
      } else {
        store.pushLine("assistant", chunk);
      }
    },
    onReasoning: (chunk: string) => {
      const st = store.get();
      const last = st.lines[st.lines.length - 1];
      if (last && last.kind === "system" && last.text.startsWith("· ")) {
        store.set((prev) => {
          const lines = [...prev.lines];
          lines[lines.length - 1] = { ...last, text: last.text + chunk };
          return { lines };
        });
      } else {
        store.pushLine("system", "· " + chunk);
      }
    },
    onToolCall: (call: { id: string; name: string; arguments?: string }) => {
      store.pushLine("tool", "", {
        id: call.id,
        name: call.name,
        argsRaw: call.arguments ?? "{}",
        startedAt: Date.now(),
        status: "pending",
      });
    },
    onToolResult: (name: string, result: { isError?: boolean; content?: string }) => {
      const st = store.get();
      let idx = -1;
      for (let i = st.lines.length - 1; i >= 0; i--) {
        const l = st.lines[i];
        if (l.kind === "tool" && l.activity?.status === "pending" && l.activity.name === name) { idx = i; break; }
      }
      if (idx === -1) {
        store.pushLine(result.isError ? "err" : "ok", (result.content ?? "").split("\n")[0]?.slice(0, 140) ?? "");
        return;
      }
      store.completeToolAt(idx, (a) => {
        const content = String(result.content ?? "");
        const firstLine = content.split("\n")[0] ?? "";
        const totalLines = content.split("\n").length;
        const counts = (() => {
          const m = /\(\+(\d+)\s*[−-](\d+)/.exec(content);
          return m ? { added: Number(m[1]), removed: Number(m[2]) } : {};
        })();
        return {
          ...a,
          status: result.isError ? "err" : "ok",
          durationMs: Date.now() - a.startedAt,
          detail: firstLine.slice(0, 140),
          extraLines: Math.max(0, totalLines - 1),
          ...counts,
        };
      });
    },
    onStatus: (_m: string) => {},
    onUsage: () => {
      const c = runtime.agent.getCost();
      store.set({ inputTokens: c.inputTokens, outputTokens: c.outputTokens, costUsd: c.costUsd });
    },
  };
  runtime.agent.setCallbacks?.(callbacks as any);

  const { render } = await import("ink");
  const { waitUntilExit } = render(
    <App store={store} runtime={runtime} onExit={options.onExit ?? (() => process.exit(0))} />,
    {
      alternateScreen: true,
      exitOnCtrlC: false,
      patchConsole: false,
      incrementalRendering: true,
    },
  );
  await waitUntilExit();
}
