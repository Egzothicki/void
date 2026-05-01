# Auto-Updater Implementation — Pick Up Here

## Context
Updates are fully built into the app (Squirrel.Mac on macOS) but disabled because
`product.json` has no `updateUrl`. Three things needed to enable it.

---

## Step 1 — Update the build script to also produce a `.zip`

Squirrel.Mac cannot apply a `.dmg` as an in-app update. It needs a zipped `.app`.
Add this to `scripts/package-mac.sh` after the `.app` is built (before DMG creation):

```bash
echo "==> Zipping app for Squirrel updates..."
ZIP_FINAL="$BUILD_ROOT/SinWeave-darwin-${ARCH}.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP_BUNDLE" "$ZIP_FINAL"
echo "    $ZIP_FINAL"
du -sh "$ZIP_FINAL"
```

Also upload the `.zip` alongside the `.dmg` in the GitHub release:
```bash
gh release create vX.X.X \
    "$DMG_FINAL" \
    "$ZIP_FINAL" \
    --title "SinWeave X.X.X" \
    --notes "..."
```

---

## Step 2 — Deploy a Cloudflare Worker as the update adapter

The app polls: `GET {updateUrl}/api/update/{platform}/{quality}/{commit}`
It expects either an `IUpdate` JSON object or HTTP 204 (already up to date).

Create a new Cloudflare Worker (free tier is fine). Logic:

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    // e.g. /api/update/darwin-arm64/stable/abc123
    const parts = url.pathname.split('/');
    const currentCommit = parts[5]; // the commit hash the running app was built from

    const gh = await fetch(
      'https://api.github.com/repos/Egzothicki/void/releases/latest',
      { headers: { 'User-Agent': 'SinWeave-Updater' } }
    ).then(r => r.json());

    // Find the .zip asset for this platform
    const asset = gh.assets.find(a => a.name.includes('darwin-arm64') && a.name.endsWith('.zip'));
    if (!asset) return new Response(null, { status: 204 });

    const latestVersion = gh.tag_name; // e.g. "v1.4.10"

    // TODO: replace commit comparison with semver version comparison
    // For now: always return update if latest tag != current tag
    // (wire product.json `voidVersion` into the commit slot at build time)
    if (latestVersion === currentCommit) {
      return new Response(null, { status: 204 }); // already up to date
    }

    return Response.json({
      version: latestVersion,
      productVersion: latestVersion.replace('v', ''),
      url: asset.browser_download_url,
    });
  }
}
```

Deploy: `wrangler deploy` (or paste into the Cloudflare Workers dashboard).
Note the worker URL — you'll need it for Step 3.

---

## Step 3 — Add `updateUrl` to `product.json`

Open `product.json` in the repo root and add two fields:

```json
"updateUrl": "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev",
"downloadUrl": "https://github.com/Egzothicki/void/releases"
```

`downloadUrl` is shown in the UI as a fallback ("Download update") on Linux and
as the manual link if Squirrel fails.

---

## Step 4 — Wire version into the build so the app knows what it is

The update URL includes the running app's commit hash so the server knows whether
to return an update. Currently `commit` is set at build time by the gulp pipeline.

For version-based comparison (simpler), change the build to pass `voidVersion`
instead. In `scripts/package-mac.sh`, after the gulp step, verify:

```bash
node -e "const p=require('./product.json'); console.log('version:', p.voidVersion)"
```

Should print `1.4.10` (or whatever the current version is). The Worker above
compares this against the latest GitHub release tag.

---

## Step 5 — Test it

1. Build a test version with a lower `voidVersion` (e.g. `1.4.9`)
2. Make sure a newer release exists on GitHub
3. Launch the app → open Command Palette → `Check for Updates`
4. Should show "Update available" → downloads zip → prompts restart
5. After restart the app should be on the new version

---

## Files touched in total
| File | Change |
|------|--------|
| `scripts/package-mac.sh` | Add zip step + upload zip in release command |
| `product.json` | Add `updateUrl` and `downloadUrl` |
| Cloudflare Worker (new) | GitHub releases adapter |
