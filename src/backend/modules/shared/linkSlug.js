import { randomBytes } from 'crypto';
import rateLimit from 'express-rate-limit';
import { query } from '../../config/database.js';
import { httpError } from './acl.js';

/*
 * Custom addresses ("slugs") for public links: /l/dogovor-keykompani instead
 * of /l/Xk3_9fQa2bLm. Used by Files (/l/…) and Drive (/d/…); each module is
 * its own namespace (a slug can exist once in Files and once in Drive).
 *
 * Rules: lowercase latin a–z, digits and single hyphens inside, 3–64
 * characters, not a reserved word. Input is normalized first: Cyrillic
 * (Russian, Kyrgyz, Kazakh letters) is transliterated, accents dropped,
 * everything else becomes a hyphen. Uniqueness is case-insensitive and
 * enforced by a UNIQUE index on LOWER(slug) (race-safe: the loser of two
 * parallel saves gets 409 SLUG_TAKEN).
 *
 * Policy (docs/security.md):
 *   - a slug stays bound to its link while the link exists, also when it is
 *     revoked or expired, so a shared address never opens something else;
 *   - when a slug is changed or its link deleted, the old address stops
 *     working at once and is held for SLUG_HOLD_DAYS: during that time only
 *     the same author can take it again (e.g. to undo a mistake), nobody else;
 *   - the random token keeps working next to the slug.
 *
 * The frontend mirrors the pure functions in src/frontend/src/lib/linkSlug.js
 * (test/link-slug.test.js checks that both agree).
 */

export const SLUG_MIN = 3;
export const SLUG_MAX = 64;
export const SLUG_HOLD_DAYS = 90;

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

/** Cyrillic → latin ("Договор КейКомпани" → "Dogovor KeyKompani"); other characters unchanged. */
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

/**
 * Any text → slug characters: transliterated, lowercase, runs of anything
 * else as one hyphen, no leading hyphen. `final` also drops a trailing hyphen
 * (while typing it is kept so "dogovor-" can become "dogovor-2026").
 * Length is not cut: validateSlug() reports what is too long.
 */
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

/** null when the slug is valid, else the reason: CHARS, SHORT, LONG, HYPHEN, RESERVED. */
export function validateSlug(slug) {
  const value = String(slug ?? '');
  if (/[^a-z0-9-]/.test(value)) return 'CHARS';
  if (value.length < SLUG_MIN) return 'SHORT';
  if (value.length > SLUG_MAX) return 'LONG';
  if (value.startsWith('-') || value.endsWith('-') || value.includes('--')) return 'HYPHEN';
  if (RESERVED_SLUGS.has(value)) return 'RESERVED';
  return null;
}

const SUFFIX_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const randomSuffix = (length = 3) =>
  Array.from(randomBytes(length), (byte) => SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length]).join('');

/** Alternatives for a taken slug: -2, -<year>, -<random>, -3 (each cut to fit and valid). */
export function slugCandidates(base, { year = new Date().getFullYear(), random = randomSuffix } = {}) {
  const stem = normalizeSlug(base) || 'link';
  const fit = (suffix) => `${stem.slice(0, SLUG_MAX - suffix.length - 1).replace(/-+$/, '')}-${suffix}`;
  const list = [fit('2'), fit(String(year)), fit(random()), fit('3'), fit(random(4))];
  return [...new Set(list)].filter((slug) => !validateSlug(slug) && slug !== stem);
}

// ── Database ────────────────────────────────────────────────────────────────

const TABLES = { files: 'fs_links', drive: 'drive_links' };
const tableOf = (module) => {
  const table = TABLES[module];
  if (!table) throw new Error(`Unknown link module: ${module}`);
  return table;
};
export const slugIndexName = (module) => `${tableOf(module)}_slug_uidx`;

/** The slug column with its case-insensitive unique index, and the hold list. Idempotent. */
export async function ensureSlugSchema(module) {
  const table = tableOf(module);
  await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS slug VARCHAR(${SLUG_MAX})`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS ${slugIndexName(module)} ON ${table} (LOWER(slug)) WHERE slug IS NOT NULL`);
  // Addresses that were in use recently (changed or deleted): held for their author.
  await query(`
    CREATE TABLE IF NOT EXISTS link_slug_holds (
      module VARCHAR(16) NOT NULL,
      slug VARCHAR(${SLUG_MAX}) NOT NULL,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (module, slug)
    )
  `);
}

/**
 * Which of `slugs` cannot be used for a link of `authorId` (other than link
 * `linkId`): Map slug → 'TAKEN' (another link has it as slug or token) or
 * 'RECENT' (held after a change or deletion by someone else).
 */
async function blockedSlugs(module, slugs, { linkId = null, authorId = null } = {}) {
  const table = tableOf(module);
  const blocked = new Map();
  if (!slugs.length) return blocked;
  const { rows } = await query(
    `SELECT LOWER(slug) AS slug, token FROM ${table}
     WHERE (LOWER(slug) = ANY($1) OR token = ANY($1)) AND ($2::int IS NULL OR id <> $2)`,
    [slugs, linkId]
  );
  for (const row of rows) {
    if (row.slug && slugs.includes(row.slug)) blocked.set(row.slug, 'TAKEN');
    if (slugs.includes(row.token)) blocked.set(row.token, 'TAKEN');
  }
  const { rows: held } = await query(
    `SELECT slug FROM link_slug_holds
     WHERE module = $1 AND slug = ANY($2) AND released_at > NOW() - make_interval(days => $3)
       AND author_id IS DISTINCT FROM $4::int`,
    [module, slugs, SLUG_HOLD_DAYS, authorId]
  );
  for (const row of held) if (!blocked.has(row.slug)) blocked.set(row.slug, 'RECENT');
  return blocked;
}

async function suggestionsFor(module, slug, options) {
  const candidates = slugCandidates(slug);
  const blocked = await blockedSlugs(module, candidates, options);
  return candidates.filter((item) => !blocked.has(item)).slice(0, 3);
}

/**
 * Availability of a slug for the author's link (linkId when editing):
 * { slug (normalized), available, reason, suggestions }.
 * reason: CHARS | SHORT | LONG | HYPHEN | RESERVED | TAKEN | RECENT | null.
 */
export async function checkSlug(module, input, { linkId = null, authorId = null } = {}) {
  const slug = normalizeSlug(String(input ?? '').slice(0, 200));
  const invalid = validateSlug(slug);
  if (invalid) {
    const suggestions = invalid === 'RESERVED' ? await suggestionsFor(module, slug, { linkId, authorId }) : [];
    return { slug, available: false, reason: invalid, suggestions };
  }
  const blocked = await blockedSlugs(module, [slug], { linkId, authorId });
  if (!blocked.has(slug)) return { slug, available: true, reason: null, suggestions: [] };
  return { slug, available: false, reason: blocked.get(slug), suggestions: await suggestionsFor(module, slug, { linkId, authorId }) };
}

/**
 * The slug to store for a create/update, or null for "random address only".
 * Throws 400 SLUG_INVALID or 409 SLUG_TAKEN. The final word is the unique
 * index: wrap the INSERT/UPDATE with rethrowSlugConflict().
 */
export async function claimSlug(module, input, options) {
  if (input === null || input === undefined || String(input).trim() === '') return null;
  const result = await checkSlug(module, input, options);
  if (result.available) return result.slug;
  if (result.reason === 'TAKEN' || result.reason === 'RECENT') {
    const error = httpError(409, 'This address is already taken', 'SLUG_TAKEN');
    error.details = { slug: result.slug, reason: result.reason, suggestions: result.suggestions };
    throw error;
  }
  const error = httpError(400, 'This address cannot be used', 'SLUG_INVALID');
  error.details = { slug: result.slug, reason: result.reason, suggestions: result.suggestions };
  throw error;
}

/** Turns a unique-index violation on the slug into 409 SLUG_TAKEN; rethrows anything else. */
export function rethrowSlugConflict(module, err, slug) {
  if (err?.code === '23505' && String(err.constraint || '') === slugIndexName(module)) {
    const error = httpError(409, 'This address is already taken', 'SLUG_TAKEN');
    error.details = { slug, reason: 'TAKEN', suggestions: [] };
    throw error;
  }
  throw err;
}

/**
 * A slug that stopped being used (changed or link deleted): held for its
 * author. Pass the transaction's `client` so the hold commits together with
 * the change that released the slug (never a free address in between).
 */
export async function releaseSlug(module, slug, authorId, client = null) {
  if (!slug) return;
  const db = client || { query };
  await db.query(`DELETE FROM link_slug_holds WHERE released_at < NOW() - make_interval(days => $1)`, [SLUG_HOLD_DAYS]);
  await db.query(
    `INSERT INTO link_slug_holds (module, slug, author_id) VALUES ($1, $2, $3)
     ON CONFLICT (module, slug) DO UPDATE SET author_id = EXCLUDED.author_id, released_at = NOW()`,
    [module, String(slug).toLowerCase(), authorId || null]
  );
}

/** The author took a held slug back: it is no longer held. */
export async function clearHold(module, slug, client = null) {
  if (slug) await (client || { query }).query(`DELETE FROM link_slug_holds WHERE module = $1 AND slug = $2`, [module, String(slug).toLowerCase()]);
}

/**
 * A random token that does not read as an existing slug (resolution tries
 * the token first, so it must never shadow a slug).
 */
export async function freshToken(module, bytes) {
  const table = tableOf(module);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = randomBytes(bytes).toString('base64url');
    const { rows } = await query(`SELECT 1 FROM ${table} WHERE LOWER(slug) = LOWER($1) LIMIT 1`, [token]);
    if (!rows.length) return token;
  }
  return randomBytes(bytes).toString('base64url');
}

/**
 * Availability checks are for signed-in people only and limited per person,
 * so the endpoint cannot be used to list addresses in use.
 */
export function slugCheckLimiter(module, { windowMs = 60 * 1000, max = 60 } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `slug:${module}:${req.user?.id || req.ip}`,
    handler: (req, res) => res.status(429).json({ success: false, error: 'Too many checks. Try again in a minute.', code: 'RATE_LIMITED', retryAfter: Math.ceil(windowMs / 1000) }),
  });
}

/** SQL condition matching a public address: the token exactly, else the slug in any case. Param $n is the address. */
export const addressMatch = (alias, n) => `(${alias}.token = $${n} OR LOWER(${alias}.slug) = LOWER($${n}))`;
export const addressOrder = (alias, n) => `ORDER BY (${alias}.token = $${n}) DESC LIMIT 1`;

/*
 * The key public-link rate limits count under: the link's id once the
 * address resolves (its token and every letter-case variant of its slug share
 * one budget), else the lowercased address. Lookups are memoised briefly so
 * the limiter adds no real database load.
 */
const KEY_MS = 60 * 1000;
const keyMemo = new Map();

export async function linkRateKey(module, address) {
  const raw = String(address || '').slice(0, 64);
  const memoKey = `${module}:${raw}`;
  const hit = keyMemo.get(memoKey);
  if (hit && hit.until > Date.now()) return hit.key;
  let key = `addr:${raw.toLowerCase()}`;
  try {
    const { rows } = await query(`SELECT id FROM ${tableOf(module)} l WHERE ${addressMatch('l', 1)} ${addressOrder('l', 1)}`, [raw]);
    if (rows[0]) key = `id:${rows[0].id}`;
  } catch {
    /* no database: the lowercased address */
  }
  if (keyMemo.size > 5000) keyMemo.clear();
  keyMemo.set(memoKey, { key, until: Date.now() + KEY_MS });
  return key;
}
