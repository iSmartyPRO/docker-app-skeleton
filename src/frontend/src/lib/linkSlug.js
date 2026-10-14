/*
 * Custom addresses of public links ("slugs"), browser side. Mirrors the pure
 * functions of src/backend/modules/shared/linkSlug.js (the server is the
 * authority; backend test/link-slug.test.js checks that both agree).
 *
 * Rules: lowercase latin a–z, digits and single hyphens inside, 3–64
 * characters, not a reserved word. Cyrillic is transliterated as you type.
 */

export const SLUG_MIN = 3;
export const SLUG_MAX = 64;

export const RESERVED_SLUGS = new Set([
  'about', 'account', 'admin', 'api', 'app', 'apps', 'assets', 'auth', 'cdn', 'config', 'd', 'dashboard', 'delete', 'download',
  'drive', 'edit', 'favicon', 'files', 'help', 'index', 'l', 'link', 'links', 'login', 'logout', 'new', 'null', 'preview',
  'public', 'register', 'reset', 'robots', 'root', 's', 'session', 'settings', 'setup', 'share', 'signin', 'signup', 'static',
  'support', 'system', 'undefined', 'unlock', 'upload', 'uploads', 'user', 'users', 'www',
]);

const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya', ң: 'ng', ө: 'o', ү: 'u', ә: 'a', ғ: 'g', қ: 'q', ұ: 'u', һ: 'h', і: 'i', є: 'ye', ї: 'yi', ґ: 'g',
};

/** Cyrillic → latin; other characters unchanged. */
export function transliterate(text) {
  return Array.from(String(text || ''))
    .map((char) => {
      const lower = char.toLowerCase();
      const latin = CYRILLIC[lower];
      if (latin === undefined) return char;
      return char !== lower && latin ? latin[0].toUpperCase() + latin.slice(1) : latin;
    })
    .join('');
}

/** Any text → slug characters (see the server version). `final: false` keeps a trailing hyphen while typing. */
export function normalizeSlug(input, { final = true } = {}) {
  let slug = transliterate(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '');
  if (final) slug = slug.replace(/-+$/, '');
  return slug;
}

/** null when valid, else CHARS | SHORT | LONG | HYPHEN | RESERVED. */
export function validateSlug(slug) {
  const value = String(slug ?? '');
  if (/[^a-z0-9-]/.test(value)) return 'CHARS';
  if (value.length < SLUG_MIN) return 'SHORT';
  if (value.length > SLUG_MAX) return 'LONG';
  if (value.startsWith('-') || value.endsWith('-') || value.includes('--')) return 'HYPHEN';
  if (RESERVED_SLUGS.has(value)) return 'RESERVED';
  return null;
}

/** A readable slug from a file or folder name ("Договор КейКомпани.pdf" → "dogovor-keykompani"), cut to fit. */
export function slugFromName(name) {
  const stem = String(name || '').replace(/\.[a-z0-9]{1,8}$/i, '');
  return normalizeSlug(stem).slice(0, 48).replace(/-+$/, '');
}
