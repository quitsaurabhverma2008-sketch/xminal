import fs from "node:fs"
import path from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"

/**
 * Lazy-load XMINAL's compiled distribution (dist/*.js) from the checkout root.
 * XMINAL is not import-safe (src/index.ts runs the CLI), so we import only the
 * side-effect-free modules — runtime, session, config — never dist/index.js.
 */
export interface Xminal {
  readonly root: string
  readonly dist: string
  readonly Runtime: any
  readonly Session: any
  readonly loadConfig: (cwd: string) => any
  readonly resolveModelBySpec: (config: any, spec: string) => any
  readonly VERSION: string
}

let cached: Xminal | undefined

export async function loadXminal(): Promise<Xminal> {
  if (cached) return cached
  const here = path.dirname(fileURLToPath(import.meta.url))
  // <root>/vendor/opencode/packages/xminal-bridge/src/xminal.ts → <root>
  const root = process.env.XMINAL_ROOT ?? path.resolve(here, "../../../..")
  const distDir = path.join(root, "dist")
  if (!fs.existsSync(path.join(distDir, "runtime.js"))) {
    throw new Error(`XMINAL dist/ not found under ${root} — run \`npm run build\` first (or set XMINAL_ROOT)`)
  }
  const [runtime, sessionMod, configMod, versionMod] = await Promise.all([
    import(pathToFileURL(path.join(distDir, "runtime.js")).href),
    import(pathToFileURL(path.join(distDir, "core/session.js")).href),
    import(pathToFileURL(path.join(distDir, "config/config.js")).href),
    import(pathToFileURL(path.join(distDir, "version.js")).href),
  ])
  cached = {
    root,
    dist: distDir,
    Runtime: runtime.Runtime,
    Session: sessionMod.Session,
    loadConfig: configMod.loadConfig,
    resolveModelBySpec: configMod.resolveModel,
    VERSION: versionMod.VERSION,
  }
  return cached
}
