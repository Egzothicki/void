#!/usr/bin/env bash
# =============================================================================
#  scripts/sign-and-notarize-mac.sh
#
#  Sign, notarize, and staple the SinWeave macOS app + DMG so it opens
#  on any Mac with zero Gatekeeper warnings.
#
#  Assumes `./scripts/package-mac.sh arm64 min` has already produced:
#      ../VSCode-darwin-arm64/SinWeave.app
#      ../SinWeave-darwin-arm64.dmg
#
#  Prereqs (one-time):
#    1. Developer ID Application cert installed in login Keychain
#       (check with: `security find-identity -v -p codesigning`)
#    2. App-specific password at https://appleid.apple.com
#    3. Team ID from https://developer.apple.com (10 chars, e.g. ABCD123456)
#
#  Usage:
#      export CODESIGN_IDENTITY="Developer ID Application: Your Name (ABCD123456)"
#      export APPLE_ID="you@example.com"
#      export APPLE_TEAM_ID="ABCD123456"
#      export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
#      ./scripts/sign-and-notarize-mac.sh arm64
#
#  Tip: store the env vars in ~/.sinweave-signing.env (chmod 600), then
#  `source ~/.sinweave-signing.env` before each release.
# =============================================================================
set -euo pipefail

ARCH="${1:-arm64}"

# ---------------------------------------------------------------------------
# Validate required env vars
# ---------------------------------------------------------------------------
: "${CODESIGN_IDENTITY:?set CODESIGN_IDENTITY to your Developer ID Application identity}"
: "${APPLE_ID:?set APPLE_ID to your Apple Developer account email}"
: "${APPLE_TEAM_ID:?set APPLE_TEAM_ID to your 10-char team ID}"
: "${APPLE_APP_SPECIFIC_PASSWORD:?set APPLE_APP_SPECIFIC_PASSWORD (generate at appleid.apple.com)}"

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_ROOT="$(cd "$REPO_ROOT/.." && pwd)"

APP_BUNDLE="$BUILD_ROOT/VSCode-darwin-${ARCH}/SinWeave.app"
DMG_FINAL="$BUILD_ROOT/SinWeave-darwin-${ARCH}.dmg"
STAGING="$BUILD_ROOT/.sinweave-dmg-staging-${ARCH}"

ENT_DIR="$REPO_ROOT/build/azure-pipelines/darwin"
ENT_APP="$ENT_DIR/app-entitlements.plist"
ENT_GPU="$ENT_DIR/helper-gpu-entitlements.plist"
ENT_RENDERER="$ENT_DIR/helper-renderer-entitlements.plist"
ENT_PLUGIN="$ENT_DIR/helper-plugin-entitlements.plist"

FW_DIR="$APP_BUNDLE/Contents/Frameworks"

echo "==> SinWeave sign + notarize"
echo "    arch:     $ARCH"
echo "    app:      $APP_BUNDLE"
echo "    dmg:      $DMG_FINAL"
echo "    identity: $CODESIGN_IDENTITY"
echo ""

[[ -d "$APP_BUNDLE" ]] || { echo "ERROR: $APP_BUNDLE missing. Run ./scripts/package-mac.sh first." >&2; exit 1; }
[[ -f "$ENT_APP" ]]   || { echo "ERROR: $ENT_APP missing." >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Sign from the inside out
#    Order matters: any modification to a container invalidates its signature,
#    so children must be signed before parents.
# ---------------------------------------------------------------------------
common_flags=(
	--force
	--options=runtime   # hardened runtime — required for notarization
	--timestamp         # secure timestamp from Apple
	--sign "$CODESIGN_IDENTITY"
)

# 1a. Sign every Mach-O binary inside the app bundle (deepest-first).
#     This picks up .dylib, .node, and helper executables without any
#     extension (ShipIt, chrome_crashpad_handler, rg, spawn-helper).
echo "==> Scanning for Mach-O binaries..."
MACHO_LIST="$(mktemp)"

# Files with known native extensions
find "$APP_BUNDLE" -type f \( -name "*.dylib" -o -name "*.node" -o -name "*.so" \) \
	-print >> "$MACHO_LIST"

# Files with no extension that happen to be Mach-O (helper binaries)
find "$APP_BUNDLE" -type f ! -name "*.*" -print | while IFS= read -r f; do
	if file "$f" 2>/dev/null | grep -q "Mach-O"; then
		echo "$f" >> "$MACHO_LIST"
	fi
done

sort -u "$MACHO_LIST" -o "$MACHO_LIST"

echo "==> Signing $(wc -l < "$MACHO_LIST") individual Mach-O binaries..."
while IFS= read -r binary; do
	codesign "${common_flags[@]}" --entitlements "$ENT_APP" "$binary"
done < "$MACHO_LIST"
rm -f "$MACHO_LIST"

# Sign nested frameworks (the electron framework in particular is huge)
echo "==> Signing nested frameworks..."
find "$FW_DIR" -type d -name "*.framework" -print0 | while IFS= read -r -d '' fw; do
	echo "  signing framework: $fw"
	codesign "${common_flags[@]}" --entitlements "$ENT_APP" "$fw"
done

# 1b. Sign the three Electron Helper apps with their helper-specific entitlements
for pair in \
	"SinWeave Helper (GPU).app:$ENT_GPU" \
	"SinWeave Helper (Renderer).app:$ENT_RENDERER" \
	"SinWeave Helper (Plugin).app:$ENT_PLUGIN" \
	"SinWeave Helper.app:$ENT_APP"
do
	helper_name="${pair%%:*}"
	helper_ent="${pair##*:}"
	helper_path="$FW_DIR/$helper_name"
	if [[ -d "$helper_path" ]]; then
		echo "==> Signing helper: $helper_name"
		codesign "${common_flags[@]}" --entitlements "$helper_ent" "$helper_path"
	fi
done

# 1c. Sign the main app bundle last, with app-level entitlements
echo "==> Signing main app bundle..."
codesign "${common_flags[@]}" --entitlements "$ENT_APP" "$APP_BUNDLE"

# ---------------------------------------------------------------------------
# 2. Verify signatures before going to Apple
# ---------------------------------------------------------------------------
echo "==> Verifying signatures..."
codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"
spctl --assess --type execute --verbose "$APP_BUNDLE" || true   # may warn until notarized

# ---------------------------------------------------------------------------
# 3. Rebuild the DMG with the signed .app
# ---------------------------------------------------------------------------
echo "==> Rebuilding DMG with signed .app..."
rm -rf "$STAGING" "$DMG_FINAL"
mkdir -p "$STAGING"
cp -R "$APP_BUNDLE" "$STAGING/"
ln -s /Applications "$STAGING/Applications"

hdiutil create \
	-volname "SinWeave" \
	-srcfolder "$STAGING" \
	-ov \
	-format UDZO \
	-imagekey zlib-level=9 \
	"$DMG_FINAL" \
	>/dev/null

rm -rf "$STAGING"

# 4. Sign the DMG itself
echo "==> Signing DMG..."
codesign --force --sign "$CODESIGN_IDENTITY" --timestamp "$DMG_FINAL"

# ---------------------------------------------------------------------------
# 5. Submit to Apple's notary service (5–15 min typical)
# ---------------------------------------------------------------------------
echo "==> Submitting to Apple notary service (this takes ~5–15 min)..."
xcrun notarytool submit "$DMG_FINAL" \
	--apple-id "$APPLE_ID" \
	--team-id "$APPLE_TEAM_ID" \
	--password "$APPLE_APP_SPECIFIC_PASSWORD" \
	--wait

# ---------------------------------------------------------------------------
# 6. Staple the notarization ticket so Gatekeeper can verify offline
# ---------------------------------------------------------------------------
echo "==> Stapling ticket to DMG..."
xcrun stapler staple "$DMG_FINAL"

echo "==> Validating stapled ticket..."
xcrun stapler validate "$DMG_FINAL"
spctl --assess --type open --context context:primary-signature --verbose "$DMG_FINAL" || true

echo ""
echo "==> Done."
echo "    $DMG_FINAL"
du -sh "$DMG_FINAL"
echo ""
echo "This DMG is now signed + notarized + stapled. Anyone on any Mac can"
echo "double-click it and drag the app to /Applications with zero warnings."
