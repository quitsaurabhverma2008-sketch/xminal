/**
 * Tiny opt-in file logger.
 *
 * Off by default. Enable with XMINAL_LOG=1 (writes ~/.xminal/xminal.log) or
 * XMINAL_LOG=/path/to/file. Secrets are redacted before anything is written.
 */
import fs from "node:fs";
import path from "node:path";
import { globalXminalDir } from "../config/paths";
import { redactSecrets } from "./redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

let resolvedPath: string | null | undefined;

function logFile(): string | null {
  if (resolvedPath !== undefined) return resolvedPath;
  const setting = process.env.XMINAL_LOG?.trim();
  if (!setting || setting === "0" || setting === "false") {
    resolvedPath = null;
    return null;
  }
  resolvedPath =
    setting === "1" || setting.toLowerCase() === "true"
      ? path.join(globalXminalDir(), "xminal.log")
      : path.resolve(setting);
  return resolvedPath;
}

/** Write one log line. Never throws, never blocks the caller for long. */
export function logEvent(level: LogLevel, message: string, data?: unknown): void {
  const file = logFile();
  if (!file) return;
  try {
    const stamp = new Date().toISOString();
    const safe = redactSecrets(String(message ?? "")).text;
    const extra = data === undefined ? "" : ` ${redactSecrets(safeJson(data)).text}`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${stamp} ${level.toUpperCase().padEnd(5)} ${safe}${extra}\n`, { mode: 0o600 });
  } catch {
    // logging must never break the app
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return "[unserializable]";
  }
}

export const log = {
  debug: (message: string, data?: unknown) => logEvent("debug", message, data),
  info: (message: string, data?: unknown) => logEvent("info", message, data),
  warn: (message: string, data?: unknown) => logEvent("warn", message, data),
  error: (message: string, data?: unknown) => logEvent("error", message, data),
};
