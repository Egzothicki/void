# SinWeave — Project Guide for Claude

SinWeave is an AI coding editor. It is a fork of Void (which is itself a fork of VS Code).
SinWeave-specific code lives in `src/vs/workbench/contrib/void/`. Everything outside that
folder is inherited VS Code/Void upstream code.

---

## How builds work

### NEVER start a full build without type-checking first
The minified macOS build takes **5–6 hours** on Apple Silicon. A single unused import or
type error will crash it at the very end (after compile-src completes). Always run:

```bash
npx tsc --project src/tsconfig.json --noEmit
```

Fix every error before touching the build script.

### Local build (macOS only, blocks the machine)
```bash
./scripts/package-mac.sh           # ARM64, minified (default)
./scripts/package-mac.sh arm64 dev # ARM64, unminified — much faster, for testing
```

Produces:
- `../VSCode-darwin-arm64/SinWeave.app` — app bundle (423 MB)
- `../SinWeave-darwin-arm64.dmg` — installer for first-time users
- `../SinWeave-darwin-arm64.zip` — used by Squirrel for in-app auto-updates

### Cloud build (preferred — doesn't block the laptop)
Push a version tag and GitHub Actions handles everything automatically:

```bash
# Bump voidVersion in product.json first, then:
git add product.json
git commit -m "chore: bump to v1.4.11"
git tag v1.4.11
git push origin main --tags
```

The workflow (`.github/workflows/build-mac.yml`) runs on a free macOS-14 M1 runner,
type-checks, builds, and uploads the DMG + ZIP to the GitHub release automatically.

---

## Auto-updater

The in-app updater (Squirrel.Mac) is fully wired up. Flow:
1. App polls `updateUrl/api/update/{platform}/{quality}/{voidVersion}`
2. Cloudflare Worker at `sinweave-updater.info-gorecki.workers.dev` compares the version
   against the latest GitHub release
3. Returns the `.zip` download URL if an update is available, or `204` if up to date
4. Squirrel downloads the zip, prompts "Restart to update", applies on next launch

**To ship an update:** bump `voidVersion` in `product.json`, push a tag → CI does the rest.

Worker source: `cloudflare-worker/update-worker.js`
Worker config: `cloudflare-worker/wrangler.toml`
To redeploy worker: `cd cloudflare-worker && wrangler deploy`

---

## Key files

| File | What it is |
|------|------------|
| `product.json` | App identity, version (`voidVersion`), update URL, quality |
| `scripts/package-mac.sh` | Local build script |
| `.github/workflows/build-mac.yml` | Cloud build + release workflow |
| `cloudflare-worker/update-worker.js` | Update API adapter (GitHub → Squirrel format) |
| `build/lib/mangle/index.ts` | Name mangler — has a node_modules filter fix (do not revert) |
| `src/vs/platform/update/electron-main/updateService.darwin.ts` | macOS updater — uses `voidVersion` not commit hash |
| `src/vs/workbench/contrib/void/` | All SinWeave-specific features |
| `docs/MANGLER_NODE_MODULES_FIX.md` | Documents the mangler crash fix |
| `docs/AUTO_UPDATER_TOMORROW.md` | Original auto-updater implementation notes (superseded) |

---

## Releasing a new version — checklist

1. Bump `voidVersion` in `product.json` (e.g. `1.4.10` → `1.4.11`)
2. Commit and push
3. `git tag v1.4.11 && git push origin v1.4.11`
4. GitHub Actions builds and publishes the release (~5–6 hrs)
5. Cloudflare Worker picks up the new release automatically — no changes needed
6. Users get an in-app update prompt on next launch
