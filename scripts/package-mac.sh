#!/usr/bin/env bash
# =============================================================================
#  scripts/package-mac.sh
#
#  Build SinWeave for macOS (Apple Silicon or Intel) and wrap the resulting
#  .app in a distributable .dmg.
#
#  Usage:
#    ./scripts/package-mac.sh              # defaults to host arch, minified
#    ./scripts/package-mac.sh arm64        # force Apple Silicon
#    ./scripts/package-mac.sh x64          # force Intel
#    ./scripts/package-mac.sh arm64 dev    # unminified (faster, larger)
#
#  What you get:
#    ../VSCode-darwin-<arch>/SinWeave.app         # the app bundle
#    ../SinWeave-darwin-<arch>.dmg                # drag-to-Applications DMG
#
#  First build takes ~10–25 minutes on Apple Silicon. Subsequent builds
#  are faster because some of the intermediate artefacts stay cached.
#
#  This script produces an UNSIGNED build. That's fine for personal use
#  and local testing; Gatekeeper will warn when a non-developer opens it
#  for the first time (Right-click → Open the first time works around it).
#  For a public launch you'll want to sign + notarize — see the README
#  in ./website for the env vars VS Code's build scripts expect.
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Args / detection
# ---------------------------------------------------------------------------
ARCH="${1:-}"
MODE="${2:-min}"          # `min` (default) or `dev`

if [[ -z "$ARCH" ]]; then
	case "$(uname -m)" in
		arm64|aarch64) ARCH="arm64" ;;
		x86_64)        ARCH="x64"   ;;
		*) echo "Unknown arch $(uname -m); pass arm64 or x64 explicitly." >&2; exit 1 ;;
	esac
fi

if [[ "$ARCH" != "arm64" && "$ARCH" != "x64" ]]; then
	echo "arch must be arm64 or x64 (got: $ARCH)" >&2
	exit 1
fi

GULP_TASK="vscode-darwin-${ARCH}"
if [[ "$MODE" == "min" ]]; then
	GULP_TASK="${GULP_TASK}-min"
fi

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# Run from repo root regardless of where we were invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_ROOT="$(cd "$REPO_ROOT/.." && pwd)"

APP_DIR="$BUILD_ROOT/VSCode-darwin-${ARCH}"
APP_BUNDLE="$APP_DIR/SinWeave.app"
DMG_FINAL="$BUILD_ROOT/SinWeave-darwin-${ARCH}.dmg"
STAGING="$BUILD_ROOT/.sinweave-dmg-staging-${ARCH}"

cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------
echo "==> SinWeave mac packager"
echo "    arch:       $ARCH"
echo "    mode:       $MODE"
echo "    gulp task:  $GULP_TASK"
echo "    repo root:  $REPO_ROOT"
echo "    build root: $BUILD_ROOT"
echo "    dmg out:    $DMG_FINAL"
echo ""

if ! command -v node >/dev/null 2>&1; then
	echo "node not on PATH. Run \`nvm use\` first (there's an .nvmrc in the repo)." >&2
	exit 1
fi

if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
	echo "node_modules missing; running \`npm install\` in $REPO_ROOT..." >&2
	(cd "$REPO_ROOT" && npm install)
fi

# ---------------------------------------------------------------------------
# 1. Build the React/Tailwind bundle that the editor's renderer uses. The
#    normal watch mode covers this, but in case the user hasn't run it
#    recently, do a one-shot build to be safe.
# ---------------------------------------------------------------------------
echo "==> Building react bundle (scope-tailwind + tsup)..."
(
	cd "$REPO_ROOT/src/vs/workbench/contrib/void/browser/react"
	node build.js
)

# ---------------------------------------------------------------------------
# 2. Run the gulp task that compiles, bundles, and packages the .app.
# ---------------------------------------------------------------------------
echo "==> Running gulp $GULP_TASK (this is the slow part)..."
npm run gulp -- "$GULP_TASK"

if [[ ! -d "$APP_BUNDLE" ]]; then
	echo ""
	echo "ERROR: expected $APP_BUNDLE to exist after build, but it doesn't." >&2
	echo "Check the gulp output above for errors." >&2
	exit 1
fi

echo "==> App built: $APP_BUNDLE"
du -sh "$APP_BUNDLE"

# ---------------------------------------------------------------------------
# 3. Stage the .app alongside an Applications symlink so users can drag-drop.
# ---------------------------------------------------------------------------
echo "==> Staging DMG contents..."
rm -rf "$STAGING" "$DMG_FINAL"
mkdir -p "$STAGING"
cp -R "$APP_BUNDLE" "$STAGING/"
ln -s /Applications "$STAGING/Applications"

# ---------------------------------------------------------------------------
# 4. Build the DMG with hdiutil (built-in, no extra deps).
#    UDZO = zlib-compressed; decent size-to-speed trade-off.
# ---------------------------------------------------------------------------
echo "==> Creating DMG with hdiutil..."
hdiutil create \
	-volname "SinWeave" \
	-srcfolder "$STAGING" \
	-ov \
	-format UDZO \
	-imagekey zlib-level=9 \
	"$DMG_FINAL" \
	>/dev/null

rm -rf "$STAGING"

echo ""
echo "==> Done."
echo "    $DMG_FINAL"
du -sh "$DMG_FINAL"

# ---------------------------------------------------------------------------
# 5. Friendly reminder for publishing the release.
# ---------------------------------------------------------------------------
cat <<EOF

Next steps to make this downloadable from your site:

    gh release create v1.0.0 \\
        "$DMG_FINAL" \\
        --title "SinWeave 1.0.0" \\
        --notes "First public build."

Make sure the DMG filename matches SinWeave-darwin-${ARCH}.dmg — the site's
download buttons point at:

    https://github.com/Egzothicki/void/releases/latest/download/SinWeave-darwin-${ARCH}.dmg

EOF
