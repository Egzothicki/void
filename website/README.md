# SinWeave — product site

The marketing site for SinWeave. It's a **pure static site** (one HTML file,
one CSS file, one JS file, a few assets). Zero build step.

```
website/
├── index.html        — the page
├── styles.css        — hand-written CSS, no framework
├── main.js           — OS detection, sine-wave animation, scroll reveal
├── assets/           — logos, favicon, OG image
├── render.yaml       — Render.com blueprint (see below)
└── README.md         — you are here
```

Self-contained. Lives alongside the editor source in the same repo so you
don't have to juggle two GitHub projects.

---

## Preview locally

Any static file server will do. Pick one:

```bash
# from the repo root
cd website

# Python (already on macOS)
python3 -m http.server 4321
#  → http://localhost:4321

# Node (if you'd rather)
npx serve .
```

There's nothing to build — edit the files and refresh.

---

## Deploy to Render

### Option A — one-click Blueprint (recommended)

1. Push this branch to GitHub.
2. Render dashboard → **New +** → **Blueprint**.
3. Pick your fork of the repo. Render reads [`render.yaml`](./render.yaml),
   sees a static site rooted at `website/`, and wires everything up.
4. Click **Apply**. First deploy takes ~30 seconds.
5. You get a `*.onrender.com` URL immediately; add a custom domain later
   in the service settings → _Custom Domains_.

The blueprint uses Render's free static plan, auto-deploys on pushes to
`main`, and only rebuilds when files under `website/**` change.

### Option B — manual Static Site (no blueprint)

If you'd rather wire it up by hand:

| Field              | Value                                  |
| ------------------ | -------------------------------------- |
| Service type       | **Static Site**                        |
| Repository         | your fork of the SinWeave repo         |
| Branch             | `main`                                 |
| Root Directory     | `website`                              |
| Build Command      | _(leave empty)_                        |
| Publish Directory  | `.`                                    |
| Auto-Deploy        | Yes                                    |

That's it — no env vars, no secrets, no config to babysit.

---

## Wiring up the Mac download link

The big **Download for Mac** button, and the two macOS cards in the
download section, point to:

```
https://github.com/Egzothicki/void/releases/latest/download/SinWeave-darwin-arm64.dmg
https://github.com/Egzothicki/void/releases/latest/download/SinWeave-darwin-x64.dmg
```

GitHub resolves `/releases/latest/download/<name>` to whatever your most
recent release has tagged. So the site **doesn't need to know your version
number** — just make sure your release assets are named exactly as above.

### One-time: publish your first release

```bash
# from the repo root (~/code/void)
# 1. Build SinWeave.app for Apple Silicon
npm run gulp vscode-darwin-arm64

# 2. Package it as a .dmg — easiest tool is `create-dmg`:
npm install -g create-dmg
create-dmg './VSCode-darwin-arm64/SinWeave.app' ./
mv 'SinWeave '*.dmg SinWeave-darwin-arm64.dmg

# 3. Repeat for Intel if you want
npm run gulp vscode-darwin-x64
create-dmg './VSCode-darwin-x64/SinWeave.app' ./
mv 'SinWeave '*.dmg SinWeave-darwin-x64.dmg

# 4. Create the GitHub release and attach both DMGs
gh release create v1.0.0 \
  SinWeave-darwin-arm64.dmg \
  SinWeave-darwin-x64.dmg \
  --title "SinWeave 1.0.0" \
  --notes "First public build."
```

From here on, every new release just needs to upload the same asset
filenames and the website updates itself — no redeploy required.

### Signing & notarization (optional but recommended)

Unsigned DMGs trigger Gatekeeper warnings. For a real public launch:

1. Get an Apple Developer account ($99/yr).
2. Set env vars before building:
   ```bash
   export VSCODE_ARCH=arm64
   export CSC_LINK=/path/to/DeveloperIDApp.p12
   export CSC_KEY_PASSWORD=...
   export APPLE_ID=...
   export APPLE_ID_PASSWORD=app-specific-password
   ```
3. VS Code's build scripts pick these up and both sign + notarize the
   output. Details in [`build/darwin`](../build/darwin).

For an early alpha, unsigned is fine — users can right-click → Open to
bypass Gatekeeper the first time.

---

## Editing the site

- **Copy / content** → `index.html` is organized top-to-bottom (hero →
  features → demo → models → download → FAQ → footer). Each section is
  clearly commented.
- **Design tokens** → the top of `styles.css` has CSS custom properties
  for colors, fonts, spacing. Change them there; the rest of the stylesheet
  will follow.
- **Fonts** → pulled from Google Fonts at the top of `index.html`. To swap
  in a different pairing, change the `<link>` and the `--ff-*` variables.
- **OS detection / downloads** → `main.js`, top of file (`DL = {...}`).
  Edit the asset filenames there if your release naming changes.

---

## What lives where (big picture)

```
/code/void
├── website/          ← this folder (site only)
├── src/              ← the editor's TypeScript
├── product.json      ← editor branding (nameShort, applicationName, etc.)
├── resources/        ← app icons (macOS .icns, Linux .png, Windows tiles)
└── …                 ← the rest of the VS Code fork
```

The site is intentionally decoupled: you can rebrand, redesign, or even
swap it for a different stack without touching a single line of editor
code.

---

## Roadmap for the site (non-blocking)

- [ ] Replace the "specimen" card in the hero with a real screenshot once
      you have a screen you're proud of.
- [ ] Add a short Loom / MP4 embed in the Demo section.
- [ ] Wire up a mailing-list capture (ConvertKit, Buttondown, or just a
      `mailto:`).
- [ ] `/changelog` page pulled from GitHub Releases.
- [ ] Add a blog if you ever feel like writing.

None of these need the site to change shape — just edit `index.html`.
