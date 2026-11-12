import { spawnSync } from "node:child_process";

/**
 * Open an URL in the platform's browser/handler. Never throws — returns
 * whether one of the candidates worked. Anything security-relevant should
 * redact the URL first; this is a convenience, not a gate.
 */
export function openExternal(url: string): boolean {
  const platform = process.platform;
  const candidates: Array<[string, string[]]> =
    platform === "darwin"
      ? [["open", [url]]]
      : platform === "win32"
        ? [["cmd", ["/c", "start", "", url]]]
        : [["termux-open-url", [url]], ["xdg-open", [url]], ["gio", ["open", url]]];
  for (const [bin, args] of candidates) {
    try {
      const result = spawnSync(bin, args, { stdio: "ignore" });
      if (result.status === 0) return true;
    } catch {
      // try the next candidate
    }
  }
  return false;
}
