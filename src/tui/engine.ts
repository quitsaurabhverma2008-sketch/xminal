import { visibleLength, pad, truncate } from "../util/ansi";
import type { TodoItem } from "./state";
import type { AgentMode } from "../core/agent";

export interface Theme {
  bg: string;
  raised: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  violet: string;
  green: string;
  yellow: string;
  red: string;
  cyan: string;
}

export const theme: Theme = {
  bg: "\x1b[48;5;234m",
  raised: "\x1b[48;5;236m",
  border: "\x1b[38;5;239m",
  text: "\x1b[38;5;253m",
  muted: "\x1b[38;5;245m",
  accent: "\x1b[38;5;51m",
  accent2: "\x1b[38;5;45m",
  violet: "\x1b[38;5;141m",
  green: "\x1b[38;5;120m",
  yellow: "\x1b[38;5;221m",
  red: "\x1b[38;5;203m",
  cyan: "\x1b[38;5;45m",
};

export const reset = "\x1b[0m";

export function rule(width: number): string {
  return theme.border + "─".repeat(width) + reset;
}

export function box(width: number, height: number, title: string, fill: (innerWidth: number) => string[]): string[] {
  const inner = Math.max(8, width - 2);
  const lines = fill(inner);
  const out: string[] = [];
  const label = title ? `─ ${title} ` : "─";
  out.push(theme.border + "┌" + label + "─".repeat(Math.max(0, inner - label.length)) + "┐" + reset);
  for (const line of lines.slice(0, Math.max(0, height - 2))) {
    out.push(theme.border + "│" + reset + pad(truncate(line, inner), inner) + theme.border + "│" + reset);
  }
  out.push(theme.border + "└" + "─".repeat(inner) + "┘" + reset);
  return out;
}

export function tag(key: string, value: string): string {
  return `${theme.muted}${key}${reset} ${theme.text}${value}${reset}`;
}

export function statusPill(status: TodoItem["status"]): string {
  switch (status) {
    case "in_progress":
      return theme.accent + "▶ " + reset;
    case "completed":
      return theme.green + "✓ " + reset;
    case "blocked":
      return theme.red + "! " + reset;
    default:
      return theme.muted + "○ " + reset;
  }
}

export function formatCost(cost: number): string {
  return cost < 0.01 ? `$${cost.toFixed(6)}` : `$${cost.toFixed(4)}`;
}

export function modeColor(mode: AgentMode): string {
  switch (mode) {
    case "plan":
      return theme.yellow;
    case "build":
      return theme.accent;
    case "compose":
      return theme.violet;
    case "review":
      return theme.cyan;
    case "yolo":
      return theme.red;
  }
}
