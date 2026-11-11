import { ansi } from "./ansi";
import fs from "node:fs";
import path from "node:path";
import { globalXminalDir } from "../config/paths";
import { redactSecrets } from "./redact";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/**
 * XMINAL_LOG can be:
 *   debug | info | warn | error | silent  → console level (default: info)
 *   1 | file | true                       → also write ~/.xminal/xminal.log
 *   /absolute/path.log                    → also write that file
 * XMINAL_LOG_FILE=/path → always writes that file.
 */
function initialLevel(): LogLevel {
  const raw = process.env.XMINAL_LOG?.trim();
  if (raw && Object.prototype.hasOwnProperty.call(order, raw)) return raw as LogLevel;
  return "info";
}

let level: LogLevel = initialLevel();

export function setLogLevel(next: LogLevel): void {
  level = next;
}

function enabled(target: LogLevel): boolean {
  return order[target] >= order[level];
}

/** Where the file log goes (null = no file log). */
let resolvedFile: string | null | undefined;

function logFile(): string | null {
  if (resolvedFile !== undefined) return resolvedFile;
  const explicit = process.env.XMINAL_LOG_FILE?.trim();
  if (explicit) {
    resolvedFile = path.resolve(explicit);
    return resolvedFile;
  }
  const setting = process.env.XMINAL_LOG?.trim();
  if (!setting || setting === "0" || setting === "false") {
    resolvedFile = null;
    return null;
  }
  if (setting === "1" || setting.toLowerCase() === "file" || setting.toLowerCase() === "true") {
    resolvedFile = path.join(globalXminalDir(), "xminal.log");
    return resolvedFile;
  }
  if (setting.includes("/") || setting.includes("\\")) {
    resolvedFile = path.resolve(setting);
    return resolvedFile;
  }
  resolvedFile = null; // a level name: console only
  return null;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return "[unserializable]";
  }
}

/** Write one redacted line to the log file (never throws). */
export function logEvent(levelName: "debug" | "info" | "warn" | "error", message: string, data?: unknown): void {
  const file = logFile();
  if (!file || !enabled(levelName)) return;
  try {
    const stamp = new Date().toISOString();
    const safe = redactSecrets(String(message ?? "")).text;
    const extra = data === undefined ? "" : ` ${redactSecrets(safeJson(data)).text}`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${stamp} ${levelName.toUpperCase().padEnd(5)} ${safe}${extra}\n`, { mode: 0o600 });
  } catch {
    // logging must never break the app
  }
}

export const log = {
  debug: (...args: unknown[]) => {
    if (enabled("debug")) console.error(ansi.gray("[debug]"), ...args);
    logEvent("debug", args.map((a) => safeJson(a)).join(" "));
  },
  info: (...args: unknown[]) => {
    if (enabled("info")) console.error(ansi.cyan("[xminal]"), ...args);
    logEvent("info", args.map((a) => safeJson(a)).join(" "));
  },
  warn: (...args: unknown[]) => {
    if (enabled("warn")) console.error(ansi.yellow("[warn]"), ...args);
    logEvent("warn", args.map((a) => safeJson(a)).join(" "));
  },
  error: (...args: unknown[]) => {
    if (enabled("error")) console.error(ansi.red("[error]"), ...args);
    logEvent("error", args.map((a) => safeJson(a)).join(" "));
  },
};
