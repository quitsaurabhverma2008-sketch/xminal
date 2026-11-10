/**
 * Transcript + session state for the Ink TUI. A tiny external store consumed
 * by components through useSyncExternalStore — the XMINAL agent callbacks
 * mutate it from outside React, components subscribe via subscribe().
 */
import { EventEmitter } from "node:events";
import type { AgentMode } from "../core/agent";

export type LineKind = "user" | "assistant" | "tool" | "ok" | "err" | "system";

export interface ActivityLine {
  /** opencode-style id for correlation; stable across completion updates */
  id: string;
  name: string;
  argsRaw: string;
  startedAt: number;
  status: "pending" | "ok" | "err";
  durationMs?: number;
  detail?: string;
  preview?: string[];
  extraPreviewLines?: number;
  added?: number;
  removed?: number;
  extraLines?: number;
}

export interface Line {
  kind: LineKind;
  text: string;
  activity?: ActivityLine;
}

export interface InkTuiState {
  lines: Line[];
  busy: boolean;
  mode: AgentMode;
  model: string;
  effort: string;
  cwd: string;
  projectName: string;
  branch?: string;
  sessionTitle: string;
  sessionShortId: string;
  skillsCount: number;
  mcpCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  turnStartedAt: number;
  pendingPermission?: { tool: string; reason?: string };
  permissionResolve?: (allow: boolean) => void;
  input: string;
  queue: string[];
  todos: Array<{ id: string; text: string; status: string }>;
  scrollOffset: number;
  ctxWindow: number;
  closed: boolean;
}

class Store {
  private emitter = new EventEmitter();
  private snapshot: InkTuiState;

  constructor(init: InkTuiState) {
    this.snapshot = init;
    this.emitter.setMaxListeners(50);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.emitter.on("change", listener);
    return () => {
      this.emitter.off("change", listener);
    };
  };

  getSnapshot = (): InkTuiState => this.snapshot;

  get = (): InkTuiState => this.snapshot;

  set(patch: Partial<InkTuiState> | ((s: InkTuiState) => Partial<InkTuiState>)): void {
    const entry = typeof patch === "function" ? patch(this.snapshot) : patch;
    this.snapshot = { ...this.snapshot, ...entry };
    this.emitter.emit("change");
  }

  pushLine(kind: LineKind, text: string, activity?: ActivityLine): void {
    this.set((s) => ({
      lines: [...s.lines, { kind, text, ...(activity ? { activity } : {}) }],
      scrollOffset: 0,
    }));
  }

  updateActivity(id: string, apply: (a: ActivityLine) => ActivityLine): void {
    this.set((s) => {
      const lines = [...s.lines];
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.kind === "tool" && line.activity?.id === id) {
          lines[i] = { ...line, activity: apply(line.activity) };
          break;
        }
      }
      return { lines };
    });
  }

  /** last index of a pending tool line for FIFO pairing of call→result */
  lastPendingToolIndex(): number {
    for (let i = this.snapshot.lines.length - 1; i >= 0; i--) {
      const line = this.snapshot.lines[i];
      if (line.kind === "tool" && line.activity?.status === "pending") return i;
    }
    return -1;
  }

  completeToolAt(index: number, apply: (a: ActivityLine) => ActivityLine): void {
    this.set((s) => {
      const lines = [...s.lines];
      const line = lines[index];
      if (line?.kind === "tool" && line.activity) {
        lines[index] = { ...line, activity: apply(line.activity) };
      }
      return { lines };
    });
  }

  reset(patch?: Partial<InkTuiState>): void {
    this.snapshot = { ...this.snapshot, lines: [], busy: false, queue: [], scrollOffset: 0, ...patch };
    this.emitter.emit("change");
  }
}

export function createStore(init: Partial<InkTuiState>): Store {
  const now = Date.now();
  const full: InkTuiState = {
    lines: [],
    busy: false,
    mode: "build",
    model: "opencode/inkling-2-small-free",
    effort: "max",
    cwd: process.cwd(),
    projectName: process.cwd().split("/").pop() ?? process.cwd(),
    sessionTitle: "new session",
    sessionShortId: "",
    skillsCount: 0,
    mcpCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    turnStartedAt: now,
    queue: [],
    todos: [],
    scrollOffset: 0,
    input: "",
    ctxWindow: 128_000,
    closed: false,
    ...init,
  };
  return new Store(full);
}
