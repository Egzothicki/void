/**
 * SinWeave Auto-Update Worker
 *
 * Bridges the VS Code/Electron Squirrel update protocol with GitHub Releases.
 *
 * Expected request: GET /api/update/{platform}/{quality}/{currentVersion}
 *   e.g.  GET /api/update/darwin-arm64/stable/1.4.10
 *
 * Returns:
 *   204 No Content  — already on the latest version
 *   200 JSON        — { url, version, productVersion } — update available
 */

const GITHUB_REPO = 'Egzothicki/void';

// Maps Electron platform strings to substrings we look for in GitHub asset names
const PLATFORM_ASSET_MAP = {
  'darwin-arm64': 'darwin-arm64',
  'darwin':       'darwin-x64',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Route: /api/update/{platform}/{quality}/{currentVersion}
    const match = url.pathname.match(/^\/api\/update\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (!match) {
      return new Response('Not found', { status: 404 });
    }

    const [, platform, , currentVersion] = match;

    // Fetch latest release from GitHub
    const ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { 'User-Agent': 'SinWeave-UpdateWorker/1.0' } }
    );

    if (!ghRes.ok) {
      return new Response('Failed to fetch release info', { status: 502 });
    }

    const release = await ghRes.json();
    const latestVersion = release.tag_name.replace(/^v/, ''); // e.g. "1.4.11"

    // Already up to date
    if (latestVersion === currentVersion) {
      return new Response(null, { status: 204 });
    }

    // Older version check (simple semver-ish — enough for sequential releases)
    if (compareVersions(currentVersion, latestVersion) >= 0) {
      return new Response(null, { status: 204 });
    }

    // Find the matching .zip asset for this platform
    const assetFragment = PLATFORM_ASSET_MAP[platform];
    if (!assetFragment) {
      return new Response('Unknown platform', { status: 400 });
    }

    const asset = release.assets.find(
      a => a.name.includes(assetFragment) && a.name.endsWith('.zip')
    );

    if (!asset) {
      // No zip available yet for this platform — tell client to check again later
      return new Response(null, { status: 204 });
    }

    // Return the Squirrel-compatible update payload
    return Response.json({
      url: asset.browser_download_url,
      version: latestVersion,
      productVersion: latestVersion,
    });
  },
};

/**
 * Returns negative if a < b, 0 if equal, positive if a > b.
 * Handles simple "1.4.10" style version strings.
 */
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
