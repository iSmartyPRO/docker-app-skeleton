/*
 * Browser tab icon, iOS home-screen icon and manifest link follow the
 * "App icon" setting at runtime. index.html only knows the static defaults,
 * so without this an admin who uploads a new icon keeps seeing the old one
 * until the browser happens to refetch.
 *
 * An uploaded icon gets a new random file name on every upload, so its URL is
 * already a cache-buster. The manifest URL is constant, so it carries a
 * version derived from the icon URL: Chrome re-reads the manifest when the
 * link changes (installed apps still refresh their icon only when the OS
 * decides to).
 */

export const DEFAULT_FAVICON = '/favicon.svg';
export const DEFAULT_TOUCH_ICON = '/pwa/apple-touch-icon.png';
const MANIFEST = '/api/pwa/manifest.webmanifest';

function mimeOf(url) {
  const path = String(url).split('?')[0];
  if (/\.svg$/i.test(path)) return 'image/svg+xml';
  if (/\.ico$/i.test(path)) return 'image/x-icon';
  if (/\.webp$/i.test(path)) return 'image/webp';
  if (/\.jpe?g$/i.test(path)) return 'image/jpeg';
  return 'image/png';
}

/** Short stable hash (FNV-1a) for the manifest version. */
function versionOf(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** What the head should point to for a given app icon URL (null = default). */
export function iconLinks(appIconUrl) {
  const custom = typeof appIconUrl === 'string' && appIconUrl ? appIconUrl : null;
  const favicon = custom || DEFAULT_FAVICON;
  return {
    favicon,
    faviconType: mimeOf(favicon),
    // iOS ignores SVG touch icons: keep the bundled PNG for an SVG upload.
    touchIcon: custom && mimeOf(custom) !== 'image/svg+xml' ? custom : DEFAULT_TOUCH_ICON,
    manifest: `${MANIFEST}?v=${versionOf(custom || 'default')}`,
  };
}

function ensureLink(doc, rel) {
  let node = doc.head.querySelector(`link[rel="${rel}"]`);
  if (!node) {
    node = doc.createElement('link');
    node.setAttribute('rel', rel);
    doc.head.appendChild(node);
  }
  return node;
}

export function applyAppIcon(appIconUrl, doc = document) {
  const links = iconLinks(appIconUrl);
  // Browsers pick among all rel=icon links; keep exactly one so no stale
  // default (or an extension-added one) wins over the configured icon.
  const icons = [...doc.head.querySelectorAll('link[rel~="icon"]')];
  icons.slice(1).forEach((node) => node.remove());
  const icon = icons[0] || ensureLink(doc, 'icon');
  if (icon.getAttribute('href') !== links.favicon) {
    // A fresh element is what makes Chrome and Safari refresh the tab icon;
    // changing href in place is not always picked up.
    const next = doc.createElement('link');
    next.setAttribute('rel', 'icon');
    next.setAttribute('type', links.faviconType);
    next.setAttribute('href', links.favicon);
    icon.replaceWith(next);
  }
  const touch = ensureLink(doc, 'apple-touch-icon');
  if (touch.getAttribute('href') !== links.touchIcon) touch.setAttribute('href', links.touchIcon);
  const manifest = ensureLink(doc, 'manifest');
  if (manifest.getAttribute('href') !== links.manifest) manifest.setAttribute('href', links.manifest);
  return links;
}
