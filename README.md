# SinWeave

SinWeave is an AI coding editor built on a fork of [Void](https://github.com/voideditor/void), which is itself a fork of [VS Code](https://github.com/microsoft/vscode).

It gives you AI agents directly in your editor — chat with your codebase, apply changes with full diff visibility, and connect to any model or run one locally. Messages go straight to providers; no data is retained.

---

## Download

Get the latest macOS build from the [releases page](https://github.com/Egzothicki/void/releases/latest).

| Platform | Download |
|----------|----------|
| macOS Apple Silicon | [SinWeave-darwin-arm64.dmg](https://github.com/Egzothicki/void/releases/latest/download/SinWeave-darwin-arm64.dmg) |
| macOS Intel | [SinWeave-darwin-x64.dmg](https://github.com/Egzothicki/void/releases/latest/download/SinWeave-darwin-x64.dmg) |

---

## Building from source

**Prerequisites:** Node.js (see `.nvmrc`), Python 3, Xcode Command Line Tools.

```bash
# Install dependencies
npm install

# Build the macOS app (Apple Silicon, minified)
./scripts/package-mac.sh arm64

# Build unminified (faster, for development)
./scripts/package-mac.sh arm64 dev
```

The script produces:
- `../VSCode-darwin-<arch>/SinWeave.app` — the app bundle
- `../SinWeave-darwin-<arch>.dmg` — drag-to-Applications installer

First build takes roughly 10–25 minutes on Apple Silicon. See [`docs/APPLE_NOTARIZATION.md`](docs/APPLE_NOTARIZATION.md) for signing and notarization.

---

## Project structure

SinWeave-specific code lives in `src/vs/workbench/contrib/void/`. Everything outside that folder is inherited from VS Code via the Void fork and largely unchanged.

---

## Credits

Built on top of [Void](https://github.com/voideditor/void) and [VS Code](https://github.com/microsoft/vscode).
