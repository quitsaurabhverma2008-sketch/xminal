#!/usr/bin/env bash
# Package smoke test — pack, install into a throwaway prefix, and run the CLI.
# This is what catches packaging breakage (missing files, broken prepare, wrong bin).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ building"
npm run build >/dev/null

echo "→ packing"
TARBALL="$(npm pack --silent | tail -1)"

echo "→ installing into $TMP/prefix"
npm install -g --prefix "$TMP/prefix" "./$TARBALL" >/dev/null

# npm puts the shims in <prefix>/bin on unix and directly in <prefix> on Windows
BIN=""
for candidate in \
  "$TMP/prefix/bin/xminal" "$TMP/prefix/xminal" \
  "$TMP/prefix/bin/xminal.cmd" "$TMP/prefix/xminal.cmd"
do
  if [ -f "$candidate" ]; then BIN="$candidate"; break; fi
done
if [ -z "$BIN" ]; then
  echo "✗ binary not found in the tarball install" >&2
  ls -R "$TMP/prefix" | head -40 >&2
  exit 1
fi

echo "→ running"
"$BIN" version
"$BIN" doctor >/dev/null || true
"$BIN" mcp search "filesystem" --platform mobile >/dev/null

echo "✓ package smoke test passed ($TARBALL)"
