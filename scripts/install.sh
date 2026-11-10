#!/bin/sh
# XMINAL installer — npm (published) or local source build.
set -eu

if ! command -v node >/dev/null 2>&1; then
  echo "xminal: node >= 18 is required (https://nodejs.org)" >&2
  exit 1
fi

major=$(node -p "process.versions.node.split('.')[0]")
if [ "$major" -lt 18 ]; then
  echo "xminal: node $(node -v) is too old; need >= 18" >&2
  exit 1
fi

if command -v npm >/dev/null 2>&1 && npm view xminal version >/dev/null 2>&1; then
  npm install -g xminal
else
  echo "xminal: installing from the latest GitHub release tarball." >&2
  npm install -g https://github.com/quitsaurabhverma2008-sketch/xminal/releases/download/v0.12.2/xminal-0.12.2.tgz && exit 0
  echo "xminal: npm package not found or registry unreachable; building from source." >&2
  if [ ! -f package.json ]; then
    echo "xminal: run this from a clone of the repository (package.json not found)." >&2
    exit 1
  fi
  npm install
  npm run build
  mkdir -p "${XMINAL_BIN_DIR:-$HOME/.local/bin}"
  ln -sfn "$(pwd)/dist/index.js" "${XMINAL_BIN_DIR:-$HOME/.local/bin}/xminal"
  chmod +x "$(pwd)/dist/index.js"
fi

echo "xminal installed. Run: xminal doctor && xminal"
