import { remoteSettings } from './service.js';

/*
 * Portal VNC (github.com/iSmartyPRO/portal-vnc): a Windows remote-access agent
 * (RFB over mutual TLS, browser access via its own gateway + noVNC). The portal
 * shows an install centre with live download links to the latest release so an
 * administrator reaches the installer in a couple of clicks.
 *
 * The release info is fetched from the GitHub API and cached. If the portal
 * cannot reach GitHub, a known-good fallback is returned — the download URLs
 * point at github.com and are fetched by the admin's own browser, so they work
 * regardless of the portal's outbound network.
 */

const DEFAULT_REPO = 'iSmartyPRO/portal-vnc';
const CACHE_MS = 60 * 60 * 1000;
let cache = { at: 0, data: null };

// Known-good fallback (v0.1.0) in case the GitHub API is unreachable from the portal.
const FALLBACK = {
  repo: DEFAULT_REPO,
  version: 'v0.1.0',
  publishedAt: '2026-10-23T04:28:32Z',
  releaseUrl: 'https://github.com/iSmartyPRO/portal-vnc/releases/tag/v0.1.0',
  repoUrl: 'https://github.com/iSmartyPRO/portal-vnc',
  releasesUrl: 'https://github.com/iSmartyPRO/portal-vnc/releases',
  live: false,
  assets: [
    { name: 'PortalVNC-0.1.0.msi', kind: 'msi', size: 655360, url: 'https://github.com/iSmartyPRO/portal-vnc/releases/download/v0.1.0/PortalVNC-0.1.0.msi' },
    { name: 'PortalVNC-0.1.0-win64.zip', kind: 'zip', size: 983310, url: 'https://github.com/iSmartyPRO/portal-vnc/releases/download/v0.1.0/PortalVNC-0.1.0-win64.zip' },
  ],
};

function assetKind(name) {
  if (/\.msi$/i.test(name)) return 'msi';
  if (/\.zip$/i.test(name)) return 'zip';
  if (/\.exe$/i.test(name)) return 'exe';
  return 'file';
}

async function fetchLatest(repo) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'portal-remote' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const assets = (json.assets || [])
      .map((a) => ({ name: a.name, kind: assetKind(a.name), size: a.size, url: a.browser_download_url }))
      // Installer first, then archives.
      .sort((a, b) => (a.kind === 'msi' ? -1 : b.kind === 'msi' ? 1 : 0));
    return {
      repo,
      version: json.tag_name,
      publishedAt: json.published_at,
      releaseUrl: json.html_url,
      repoUrl: `https://github.com/${repo}`,
      releasesUrl: `https://github.com/${repo}/releases`,
      live: true,
      assets,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The latest Portal VNC release (cached), with download links. Never throws. */
export async function portalVncRelease() {
  const settings = await remoteSettings().catch(() => ({}));
  const repo = (settings.portalVncRepo || DEFAULT_REPO).replace(/[^\w./-]/g, '');
  if (cache.data && cache.data.repo === repo && Date.now() - cache.at < CACHE_MS) return cache.data;
  const live = await fetchLatest(repo);
  const data = live || (repo === DEFAULT_REPO ? FALLBACK : { ...FALLBACK, repo, repoUrl: `https://github.com/${repo}`, releasesUrl: `https://github.com/${repo}/releases`, assets: [] });
  cache = { at: Date.now(), data };
  return data;
}
