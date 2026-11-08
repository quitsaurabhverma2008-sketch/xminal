import { ansi } from "./ansi";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

let level: LogLevel = (process.env.XMINAL_LOG as LogLevel) || "info";

export function setLogLevel(next: LogLevel): void {
  level = next;
}

const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function enabled(target: LogLevel): boolean {
  return order[target] >= order[level];
}

export const log = {
  debug: (...args: unknown[]) => {
    if (enabled("debug")) console.error(ansi.gray("[debug]"), ...args);
  },
  info: (...args: unknown[]) => {
    if (enabled("info")) console.error(ansi.cyan("[xminal]"), ...args);
  },
  warn: (...args: unknown[]) => {
    if (enabled("warn")) console.error(ansi.yellow("[warn]"), ...args);
  },
  error: (...args: unknown[]) => {
    if (enabled("error")) console.error(ansi.red("[error]"), ...args);
  },
};
