#!/usr/bin/env bash
# Release helper — publish XMINAL to npm and verify it really landed.
#
#   NPM_TOKEN=… bash scripts/release.sh            # publish the current version
#   NPM_TOKEN=… bash scripts/release.sh --dry-run  # everything except the upload
#
# The token is never written to disk outside the throwaway npmrc that this
# script deletes again before it exits.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

PKG_VERSION="$(node -p "require('./package.json').version")"
SRC_VERSION="$(grep -oE '"[0-9]+\.[0-9]+\.[0-9]+"' src/version.ts | head -1 | tr -d '"')"

echo "→ version: package=$PKG_VERSION source=$SRC_VERSION"
if [ "$PKG_VERSION" != "$SRC_VERSION" ]; then
  echo "✗ package.json and src/version.ts disagree ($PKG_VERSION vs $SRC_VERSION)" >&2
  exit 1
fi

if ! grep -q "## \[$PKG_VERSION\]" CHANGELOG.md; then
  echo "✗ CHANGELOG.md has no entry for $PKG_VERSION" >&2
  exit 1
fi

echo "→ verifying"
npm run verify >/dev/null

if [ "$DRY_RUN" = "1" ]; then
  echo "✓ dry run — everything is green"
  exit 0
fi

if [ -z "${NPM_TOKEN:-}" ]; then
  echo "✗ NPM_TOKEN is not set" >&2
  exit 1
fi

NPMRC="$(mktemp -d)/npmrc"
chmod 600 "$NPMRC"
cleanup() { rm -rf "$(dirname "$NPMRC")"; }
trap cleanup EXIT

cat > "$NPMRC" <<EOF
//registry.npmjs.org/:_authToken=$NPM_TOKEN
EOF

echo "→ publishing $PKG_VERSION"
npm publish --userconfig "$NPMRC" --access public

echo "→ waiting for the registry to serve the tarball"
TARBALL="https://registry.npmjs.org/xminal/-/xminal-$PKG_VERSION.tgz"
for attempt in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$TARBALL" || echo 000)"
  if [ "$code" = "200" ]; then
    echo "✓ tarball is live: $TARBALL"
    break
  fi
  echo "  … not yet (HTTP $code), retry $attempt/30"
  sleep 20
done

latest="$(curl -s https://registry.npmjs.org/xminal | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s)['dist-tags'].latest)}catch{console.log('?')}});
")"
echo "→ dist-tags.latest = $latest"
if [ "$latest" != "$PKG_VERSION" ]; then
  echo "! latest is $latest, not $PKG_VERSION — replication can take 10–20 minutes." >&2
  exit 1
fi
echo "✓ published $PKG_VERSION"
