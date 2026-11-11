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

BIN="$TMP/prefix/bin/xminal"
[ -x "$BIN" ] || BIN="$TMP/prefix/bin/xminal.cmd"
if [ ! -x "$BIN" ]; then
  echo "✗ binary not found in the tarball install" >&2
  ls -R "$TMP/prefix" | head -40 >&2
  exit 1
fi

echo "→ running"
"$BIN" version
"$BIN" doctor >/dev/null || true
"$BIN" mcp search "filesystem" --platform mobile >/dev/null

echo "✓ package smoke test passed ($TARBALL)"
