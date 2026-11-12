/**
 * OpenCode engine — opt-in launcher for the vendored OpenCode TUI.
 *
 * The vendored TUI (MIT-licensed, see vendor/LICENSE-opencode + NOTICE) is the
 * exact OpenCode interface XMINAL ships as an *alternative* frontend. It talks
 * to XMINAL's runtime through `vendor/packages/xminal-bridge`, an in-process
 * implementation of the OpenCode server contract — no HTTP, no SQLite, no
 * network for the API layer.
 *
 * Platform reality: @opentui/core ships no android-arm64 native binary, so
 * this engine only runs where the native renderer exists (macOS, linux, win32).
 * On Android/Termux XMINAL keeps its built-in TUI and says so honestly.
 *
 * Where the checkout lives:
 *   1. in-repo            → <root>/vendor/packages/{cli,xminal-bridge}
 *   2. $XMINAL_OPENCODE_ENGINE → an external opencode checkout root
 *   3. <root>/../opencode      → a sibling checkout
 * The npm tarball does NOT ship vendor/ (it would triple the package size) —
 * so npm users get the built-in TUI + the Ink engine, and the vendored engine
 * works from a git checkout or an external checkout via the env var.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export interface EngineLocation {
  /** root that contains packages/cli and packages/xminal-bridge */
  readonly root: string;
  readonly cli: string;
  readonly preload: string;
}

/** Candidate roots, in priority order. */
function engineCandidates(root: string): string[] {
  const out: string[] = [];
  const external = process.env.XMINAL_OPENCODE_ENGINE?.trim();
  if (external) out.push(external);
  out.push(path.join(root, "vendor"));
  out.push(path.join(root, "..", "opencode"));
  out.push(path.join(root, "..", "..", "opencode"));
  return out;
}

/** Locate the vendored OpenCode checkout, or undefined when it is not present. */
function findEngine(root = xminalRoot()): EngineLocation | undefined {
  for (const candidate of engineCandidates(root)) {
    const cli = path.join(candidate, "packages", "cli", "src", "index.ts");
    const preload = path.join(candidate, "packages", "xminal-bridge", "src", "preload.ts");
    if (fs.existsSync(cli) && fs.existsSync(preload)) return { root: candidate, cli, preload };
  }
  return undefined;
}

export function isOpenCodeEngineSupported(platform: NodeJS.Platform = process.platform): boolean {
  if (platform === "android") return false; // no prebuilt @opentui/core-android-arm64 exists
  if (platform !== "darwin" && platform !== "linux" && platform !== "win32") return false;
  return findEngine() !== undefined;
}

function xminalRoot(): string {
  // dist/tui/opencode-engine.js → package root
  return path.resolve(__dirname, "..", "..");
}

function bunCandidate(): string {
  return process.env.XMINAL_BUN ?? process.env.BUN ?? "bun";
}

class EngineMissingError extends Error {
  constructor(readonly searched: string[]) {
    super(
      "opencode engine not installed: no OpenCode checkout found. " +
        "Options: run from a git checkout (vendor/ is included there), point " +
        "XMINAL_OPENCODE_ENGINE at an opencode checkout, or use the built-in TUI " +
        "(default) / XMINAL_TUI_ENGINE=ink.",
    );
    this.name = "EngineMissingError";
  }
}

/** Returns the XMINAL exit code after the vendored TUI exits. */
export async function runOpenCodeEngine(cwd: string): Promise<number> {
  const engine = findEngine();
  if (!engine) throw new EngineMissingError(engineCandidates(xminalRoot()));
  const bun = bunCandidate();
  return new Promise<number>((resolve, reject) => {
    const child = spawn(bun, ["--preload", engine.preload, engine.cli], {
      cwd,
      env: { ...process.env, XMINAL_ROOT: xminalRoot(), XMINAL_OPENCODE_ROOT: engine.root },
      stdio: "inherit",
    });
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("opencode engine needs Bun on PATH (https://bun.sh)"));
        return;
      }
      reject(error);
    });
    child.on("exit", (code) => resolve(code ?? 0));
  });
}
