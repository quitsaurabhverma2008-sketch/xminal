// Bundle the Ink engine (ESM) — ink/react are external since the npm package
// ships them as real dependencies and ink is ESM-only.
import { build } from "esbuild";

await build({
  entryPoints: ["src/tui-ink/entry.tsx"],
  outfile: "dist/tui-ink/entry.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  jsx: "automatic",
  sourcemap: true,
  external: ["ink", "react", "react-reconciler", "@inkjs/ui"],
  logLevel: "info",
});
console.log("ink engine bundle → dist/tui-ink/entry.mjs");
