/**
 * OpenCode engine — opt-in launcher for the vendored OpenCode TUI.
 *
 * The vendored TUI (vendor/opencode/packages/tui, MIT-licensed, see
 * vendor/LICENSE-opencode + NOTICE) is the exact OpenCode interface XMINAL
 * ships as an *alternative* frontend. It talks to XMINAL's runtime through
 * `vendor/opencode/packages/xminal-bridge`, an in-process implementation of
 * the OpenCode server contract. No HTTP, no SQLite, no network for the API.
 *
 * Platform reality: @opentui/core ships no android-arm64 native binary, so
 * this engine only runs where the native renderer does (macOS, linux, win32).
 * On Android/Termux XMINAL keeps its built-in TUI and says so honestly.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export function isOpenCodeEngineSupported(platform: NodeJS.Platform = process.platform): boolean {
  if (platform === "android") return false; // no prebuilt @opentui/core-android-arm64 exists
  if (platform !== "darwin" && platform !== "linux" && platform !== "win32") return false;
  return fs.existsSync(openCodeCliEntry()) && fs.existsSync(bridgePreload());
}

function xminalRoot(): string {
  // dist/tui/opencode-engine.js → repo root
  return path.resolve(__dirname, "..", "..");
}

export function openCodeCliEntry(): string {
  return path.join(xminalRoot(), "vendor", "opencode", "packages", "cli", "src", "index.ts");
}

export function bridgePreload(): string {
  return path.join(xminalRoot(), "vendor", "opencode", "packages", "xminal-bridge", "src", "preload.ts");
}

function bunCandidate(): string {
  return process.env.XMINAL_BUN ?? process.env.BUN ?? "bun";
}

/** Returns the XMINAL exit code after the vendored TUI exits. */
export async function runOpenCodeEngine(cwd: string): Promise<number> {
  const cli = openCodeCliEntry();
  if (!fs.existsSync(cli)) {
    throw new Error("opencode engine not available: vendor/opencode checkout is missing");
  }
  const preload = bridgePreload();
  if (!fs.existsSync(preload)) {
    throw new Error("opencode engine not available: xminal-bridge is missing");
  }
  const bun = bunCandidate();
  return new Promise<number>((resolve, reject) => {
    const child = spawn(bun, ["--preload", preload, cli], {
      cwd,
      env: { ...process.env, XMINAL_ROOT: xminalRoot() },
      stdio: "inherit",
    });
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("opencode engine requires Bun on PATH (https://bun.sh)"));
        return;
      }
      reject(error);
    });
    child.on("exit", (code) => resolve(code ?? 0));
  });
}
