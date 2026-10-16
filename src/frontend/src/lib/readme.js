import { Marked } from 'marked';

/*
 * Folder READMEs: a README.md in a folder describes it, and the folder views
 * (File server, Files and their public links) show it above the listing.
 * Pure helpers (no DOM): picking the file, decoding it, resolving the links
 * it holds and turning Markdown into (not yet sanitized) HTML. The card that
 * sanitizes and shows it is components/readme/ReadmeCard.jsx.
 */

/** Bigger READMEs are not loaded inline: the card offers to open the file instead. */
export const README_MAX_BYTES = 512 * 1024;

const RANK = { 'readme.md': 0, 'readme.markdown': 1 };

/**
 * The README among a folder's items, or null. Names match case-insensitively
 * (README.md, readme.md, Readme.markdown…); README.md wins over .markdown and
 * the exact spelling "README.md" over other letter cases.
 * `nameOf(item)` and `isDir(item)` adapt the item shape of each module.
 */
export function pickReadme(items, { nameOf = (item) => item?.name, isDir = (item) => Boolean(item?.dir) } = {}) {
  let best = null;
  let bestScore = Infinity;
  for (const item of items || []) {
    if (!item || isDir(item)) continue;
    const name = String(nameOf(item) || '');
    const rank = RANK[name.toLowerCase()];
    if (rank === undefined) continue;
    const score = rank * 2 + (name === 'README.md' || name === 'README.markdown' ? 0 : 1);
    if (score < bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

/**
 * File bytes → text. UTF-8 (a BOM is dropped), UTF-16 when it starts with
 * its BOM, else Windows-1251: Russian files saved on Windows servers.
 */
export function decodeReadme(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || new ArrayBuffer(0));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    try {
      return new TextDecoder('windows-1251').decode(body);
    } catch {
      return new TextDecoder('utf-8').decode(body);
    }
  }
}

/**
 * What a link (or picture) address in a README points to:
 * - { kind: 'anchor', hash } — a heading of the README itself (#section);
 * - { kind: 'external', href } — http(s), mailto, tel: opens as is;
 * - { kind: 'relative', root, up, segments, dir, hash } — a file or folder of
 *   the same place: `up` folders above this one (`../`), then `segments`;
 *   `root` when it starts with "/" (from the top of the share or link);
 * - { kind: 'unsafe' } — anything else (javascript:, data:, //host…): dropped.
 */
export function parseHref(raw) {
  const href = String(raw ?? '').trim();
  if (!href) return { kind: 'unsafe' };
  if (href.startsWith('#')) return { kind: 'anchor', hash: safeDecode(href.slice(1)) };
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) return { kind: 'external', href };
  // Any other scheme ("javascript:", "data:", "file:", "C:") and protocol-relative addresses.
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('\\\\')) return { kind: 'unsafe' };
  const hashAt = href.indexOf('#');
  const hash = hashAt >= 0 ? safeDecode(href.slice(hashAt + 1)) : '';
  const pathPart = (hashAt >= 0 ? href.slice(0, hashAt) : href).split('?')[0].replace(/\\/g, '/');
  const root = pathPart.startsWith('/');
  const dir = pathPart.endsWith('/') || /(^|\/)\.\.?$/.test(pathPart);
  let up = 0;
  const segments = [];
  for (const part of pathPart.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (segments.length) segments.pop();
      else if (root) return { kind: 'unsafe' };
      else up += 1;
      continue;
    }
    const name = safeDecode(part);
    // eslint-disable-next-line no-control-regex
    if (!name || name === '.' || name === '..' || /[\u0000-\u001f/\\]/.test(name)) return { kind: 'unsafe' };
    segments.push(name);
  }
  if (!segments.length && !up && !root) return hash ? { kind: 'anchor', hash } : { kind: 'unsafe' };
  return { kind: 'relative', root, up, segments, dir: dir || !segments.length, hash };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * A relative target (from parseHref) on top of a folder path ("a/b") →
 * the path it names ("a/c/x.md"), or null when it leaves the top (the share,
 * or the shared folder of a public link).
 */
export function joinRelative(base, target) {
  if (!target || target.kind !== 'relative') return null;
  const parts = target.root ? [] : String(base || '').split('/').filter(Boolean);
  if (target.up > parts.length) return null;
  parts.splice(parts.length - target.up, target.up);
  return [...parts, ...target.segments].join('/');
}

/** GitHub-style heading anchors: lower case, letters (any script), digits, "-" and "_"; spaces become "-". */
export function headingSlug(text, seen) {
  const base =
    String(text || '')
      .toLowerCase()
      .trim()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-') || 'section';
  if (!seen) return base;
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  return count ? `${base}-${count}` : base;
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'" };
const plainText = (html) => String(html).replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39|#x27);/g, (entity) => ENTITIES[entity]);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** The id prefix of README headings (never clashes with the page's own ids). */
export const ANCHOR_PREFIX = 'readme-';

/**
 * README Markdown (GitHub-flavoured) → HTML, NOT sanitized: the card runs it
 * through DOMPurify. Headings get anchors, code blocks a language bar, tables
 * a scrolling wrapper and task list items a class.
 */
export function renderReadme(text) {
  const seen = new Map();
  const marked = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const slug = headingSlug(plainText(inner), seen);
        return `<h${depth} id="${ANCHOR_PREFIX}${escapeHtml(slug)}"><a class="rd-anchor" href="#${escapeHtml(slug)}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${depth}>\n`;
      },
      code({ text: code, lang }) {
        const language = String(lang || '').trim().split(/\s+/)[0].replace(/[^\w+#.-]/g, '').slice(0, 24);
        const label = language ? `<span class="rd-code__lang">${escapeHtml(language)}</span>` : '<span class="rd-code__lang"></span>';
        const klass = language ? ` class="language-${escapeHtml(language)}"` : '';
        return `<div class="rd-code"><div class="rd-code__bar">${label}</div><pre><code${klass}>${escapeHtml(code.replace(/\n$/, ''))}</code></pre></div>\n`;
      },
    },
  });
  return marked
    .parse(String(text || ''))
    .replace(/<table>/g, '<div class="rd-table"><table>')
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<li>(\s*<p>)?\s*<input/g, (match, para) => `<li class="rd-task">${para || ''}<input`);
}

// ── Remembered view state (per device) ──

const FOLDERS_KEY = 'readme_folders';
const PREFS_KEY = 'readme_prefs';
const MAX_FOLDERS = 400;

function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode, quota: the state just is not remembered */
  }
}

/** 'collapsed' (the default), 'expanded' or 'hidden' for one folder. */
export function folderState(folderKey) {
  const value = read(FOLDERS_KEY, {})[folderKey];
  return value === 'expanded' || value === 'hidden' ? value : 'collapsed';
}

export function setFolderState(folderKey, state) {
  const all = read(FOLDERS_KEY, {});
  delete all[folderKey];
  if (state !== 'collapsed') all[folderKey] = state;
  // The newest last: the oldest folders are forgotten first.
  const keys = Object.keys(all);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_FOLDERS))) delete all[key];
  write(FOLDERS_KEY, all);
}

const listeners = new Set();

/** Global switch: READMEs are not shown anywhere (view options of the folder views). */
export function readmesHidden() {
  return read(PREFS_KEY, {}).hidden === true;
}

export function setReadmesHidden(hidden) {
  write(PREFS_KEY, { ...read(PREFS_KEY, {}), hidden: Boolean(hidden) });
  listeners.forEach((listener) => listener());
}

export function onReadmePrefs(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ── Loaded READMEs, by address and version (path + modification time + size) ──

const cache = new Map();
const CACHE_MAX = 40;

export function cachedReadme(key) {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
}

export function cacheReadme(key, value) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}
