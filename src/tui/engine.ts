import { visibleLength, pad, truncate } from "../util/ansi";
import type { TodoItem } from "./state";
import type { AgentMode } from "../core/agent";

export interface Theme {
  bg: string;
  bgRgb: [number, number, number];
  raised: string;
  raisedRgb: [number, number, number];
  border: string;
  borderRgb: [number, number, number];
  text: string;
  textRgb: [number, number, number];
  muted: string;
  mutedRgb: [number, number, number];
  accent: string;
  accentRgb: [number, number, number];
  accent2: string;
  accent2Rgb: [number, number, number];
  violet: string;
  green: string;
  yellow: string;
  red: string;
  cyan: string;
  cyanRgb: [number, number, number];
}

const rgb = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;
const rgbBg = (r: number, g: number, b: number) => `\x1b[48;2;${r};${g};${b}m`;

// Tokyo Night — opencode's default dark theme (assets/tokyonight.json)
export const theme: Theme = {
  bg: rgbBg(26, 27, 38), bgRgb: [26, 27, 38],
  raised: rgbBg(30, 32, 48), raisedRgb: [30, 32, 48],
  border: rgb(115, 122, 162), borderRgb: [115, 122, 162],
  text: rgb(200, 211, 245), textRgb: [200, 211, 245],
  muted: rgb(130, 139, 184), mutedRgb: [130, 139, 184],
  accent: rgb(130, 170, 255), accentRgb: [130, 170, 255],
  accent2: rgb(134, 225, 252), accent2Rgb: [134, 225, 252],
  violet: rgb(192, 153, 255),
  green: rgb(195, 232, 141),
  yellow: rgb(255, 199, 119),
  red: rgb(255, 117, 127),
  cyan: rgb(130, 170, 255), cyanRgb: [130, 170, 255],
};

export const reset = "\x1b[0m";

export function bgFill(rgbTriple: [number, number, number], width: number): string {
  return rgbBg(...rgbTriple) + " ".repeat(width);
}

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
