import { ID_PATTERN } from './paths.js';
import { isVersion } from './version.js';

/*
 * manifest.json of a package (spec §4, docs/module-packages.md «manifest.json»):
 *
 *   id, name {ru,en,…}, version, core (lowest core version, same major),
 *   requires [{ id, version, reason? } | { integration, reason?, demo? }],
 *   enhances ["id" | { id, what }], category, permissions [..]
 *
 * plus optional fields the portal uses:
 *   description {..}, changelog [{ version, date, changes {en:[..], ru:[..]} }],
 *   docs { user, guide }, nameForms { ru: { ins } } (declined name for messages),
 *   settings { defaultEnabled, defaults {..}, public [..] }, tables ["mp_units", "mp_%"],
 *   server { entry }, web { entry, css [..], icon, permission [..], page, settings (has a Settings screen) },
 *   locales { <lang>: [<namespace>, …] }, builtAt, sdk (SDK version it was built against).
 *
 * normalizeManifest() checks the file and fills defaults; the result also
 * gives the entries the module platform keeps for every module
 * (modules/manifest.js shape, modules/catalog.js shape).
 */

const TEXT_LANGS = ['en', 'ru'];
const TABLE = /^[a-z_][a-z0-9_]{0,62}[%*]?$/;
const PERMISSION = /^[a-z][a-z0-9_]*\.[a-z0-9_.]+$/;
const LOCALE_NS = /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/;
const LANG = /^[a-z]{2,3}$/;
const ICON = /^[a-z0-9-]{1,40}$/;
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => isObject(value) && TEXT_LANGS.every((lang) => typeof value[lang] === 'string' && value[lang].trim());
const textOr = (value, fallback) => (isText(value) ? value : typeof value === 'string' && value.trim() ? { en: value, ru: value } : fallback);
const safePath = (value) => typeof value === 'string' && /^[a-zA-Z0-9_./-]{1,200}$/.test(value) && !value.split('/').some((part) => !part || part === '.' || part === '..');

const DEFAULT_REASON = { en: 'Required module', ru: 'Обязательный модуль' };
const DEFAULT_WHAT = { en: 'Works together with it', ru: 'Работает вместе с ним' };

/**
 * { manifest, problems }: problems is a list of English sentences (empty =
 * valid). `categories`: the allowed categories (modules/manifest.js CATEGORIES).
 */
export function normalizeManifest(raw, { categories = null, integrations = null } = {}) {
  const problems = [];
  if (!isObject(raw)) return { manifest: null, problems: ['manifest.json must be an object'] };
  const id = raw.id;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) problems.push(`id "${id}" must be 2–32 lowercase letters, digits or _ (starting with a letter)`);
  if (!isVersion(raw.version)) problems.push(`version "${raw.version}" must be x.y.z`);
  if (!isVersion(raw.core)) problems.push(`core "${raw.core}" must be x.y.z`);
  if (!isText(raw.name)) problems.push('name needs en and ru');
  if (typeof raw.category !== 'string' || (categories && !categories.includes(raw.category))) problems.push(`unknown category "${raw.category}"`);

  const requires = [];
  for (const link of Array.isArray(raw.requires) ? raw.requires : raw.requires == null ? [] : (problems.push('requires must be a list'), [])) {
    if (isObject(link) && typeof link.integration === 'string') {
      if (integrations && !integrations.includes(link.integration)) problems.push(`requires names unknown integration "${link.integration}"`);
      requires.push({ integration: link.integration, reason: textOr(link.reason, DEFAULT_REASON), ...(link.demo ? { demo: true } : {}) });
      continue;
    }
    if (!isObject(link) || typeof link.id !== 'string' || !ID_PATTERN.test(link.id)) {
      problems.push(`requires entry ${JSON.stringify(link)} needs an id`);
      continue;
    }
    if (link.id === id) problems.push('requires names itself');
    if (link.version != null && !isVersion(link.version)) problems.push(`requires ${link.id}: version "${link.version}" must be x.y.z`);
    // `name`: how to call the module in messages while it is not installed («Нужен модуль „CRM“…»).
    requires.push({ id: link.id, ...(link.version ? { version: link.version } : {}), ...(isText(link.name) ? { name: link.name } : {}), reason: textOr(link.reason, DEFAULT_REASON) });
  }

  const enhances = [];
  for (const link of Array.isArray(raw.enhances) ? raw.enhances : raw.enhances == null ? [] : (problems.push('enhances must be a list'), [])) {
    const item = typeof link === 'string' ? { id: link } : link;
    if (isObject(item) && typeof item.integration === 'string') {
      enhances.push({ integration: item.integration, what: textOr(item.what, DEFAULT_WHAT) });
      continue;
    }
    if (!isObject(item) || typeof item.id !== 'string' || !ID_PATTERN.test(item.id)) {
      problems.push(`enhances entry ${JSON.stringify(link)} needs an id`);
      continue;
    }
    if (item.id === id) problems.push('enhances names itself');
    enhances.push({ id: item.id, what: textOr(item.what, DEFAULT_WHAT) });
  }

  const permissions = Array.isArray(raw.permissions) ? raw.permissions : [];
  if (raw.permissions != null && !Array.isArray(raw.permissions)) problems.push('permissions must be a list');
  for (const permission of permissions) {
    if (typeof permission !== 'string' || !PERMISSION.test(permission)) problems.push(`permission "${permission}" must look like <module>.<right>`);
    else if (typeof id === 'string' && !permission.startsWith(`${id}.`)) problems.push(`permission "${permission}" must start with "${id}."`);
  }

  const tables = Array.isArray(raw.tables) ? raw.tables : [];
  for (const table of tables) if (typeof table !== 'string' || !TABLE.test(table)) problems.push(`table "${table}" is not a valid table name or prefix pattern`);

  let changelog = Array.isArray(raw.changelog) ? raw.changelog.filter((item) => isObject(item) && isVersion(item.version)) : [];
  if (!changelog.length || changelog[0].version !== raw.version) changelog = [{ version: raw.version, date: raw.builtAt ? String(raw.builtAt).slice(0, 10) : undefined, changes: { en: [], ru: [] } }, ...changelog];
  changelog = changelog.slice(0, 10).map((item) => ({ version: item.version, ...(item.date ? { date: String(item.date).slice(0, 10) } : {}), changes: isObject(item.changes) ? item.changes : { en: [], ru: [] } }));

  const settings = isObject(raw.settings) ? raw.settings : {};
  const defaults = isObject(settings.defaults) ? settings.defaults : {};
  const publicSettings = Array.isArray(settings.public) ? settings.public.filter((key) => typeof key === 'string' && key in defaults) : [];

  let server = null;
  if (raw.server != null) {
    const entry = isObject(raw.server) ? raw.server.entry || 'server/index.js' : null;
    if (!safePath(entry) || !entry.startsWith('server/')) problems.push('server.entry must be a file under server/');
    else server = { entry };
  }
  let web = null;
  if (raw.web != null) {
    const w = isObject(raw.web) ? raw.web : {};
    const entry = w.entry || 'web/index.js';
    if (!safePath(entry) || !entry.startsWith('web/')) problems.push('web.entry must be a file under web/');
    const css = Array.isArray(w.css) ? w.css : [];
    for (const file of css) if (!safePath(file) || !file.startsWith('web/')) problems.push(`web.css "${file}" must be a file under web/`);
    if (w.icon != null && (typeof w.icon !== 'string' || !ICON.test(w.icon))) problems.push(`web.icon "${w.icon}" is not an icon name`);
    const permission = Array.isArray(w.permission) ? w.permission.filter((item) => typeof item === 'string') : typeof w.permission === 'string' ? [w.permission] : [];
    web = { entry, css, icon: w.icon || 'apps', ...(permission.length ? { permission } : {}), ...(w.page === false ? { page: false } : {}), ...(w.settings === true ? { settings: true } : {}) };
  }
  const locales = {};
  if (isObject(raw.locales)) {
    for (const [lang, list] of Object.entries(raw.locales)) {
      if (!LANG.test(lang) || !Array.isArray(list)) {
        problems.push(`locales.${lang} must be a list of namespaces`);
        continue;
      }
      const names = list.filter((ns) => typeof ns === 'string' && LOCALE_NS.test(ns));
      if (names.length !== list.length) problems.push(`locales.${lang} has an invalid namespace`);
      locales[lang] = names;
    }
  }

  const manifest = {
    id,
    name: raw.name,
    ...(isText(raw.description) ? { description: raw.description } : {}),
    version: raw.version,
    core: raw.core,
    requires,
    enhances,
    category: raw.category,
    permissions: permissions.filter((item) => typeof item === 'string'),
    changelog,
    ...(isObject(raw.docs) ? { docs: raw.docs } : {}),
    ...(isObject(raw.nameForms) ? { nameForms: raw.nameForms } : {}),
    settings: { defaultEnabled: Boolean(settings.defaultEnabled), defaults, public: publicSettings },
    tables: tables.filter((table) => typeof table === 'string' && TABLE.test(table)),
    server,
    web,
    locales,
    ...(raw.builtAt ? { builtAt: String(raw.builtAt) } : {}),
    ...(raw.sdk ? { sdk: String(raw.sdk) } : {}),
  };
  return { manifest, problems };
}

/** The modules/manifest.js-shaped entry of a package (what the Modules page and dependency rules read). */
export function platformManifestEntry(manifest) {
  return {
    name: manifest.name,
    version: manifest.version,
    category: manifest.category,
    minCore: manifest.core,
    requires: manifest.requires,
    enhances: manifest.enhances,
    docs: manifest.docs || {},
    changelog: manifest.changelog,
    package: true,
  };
}

/** Keeps known keys of `defaults` whose type matches (the sanitizer of a package without its own). */
export function genericSanitizer(defaults) {
  return (current = {}, incoming = {}) => {
    const next = { ...current };
    for (const [key, value] of Object.entries(incoming || {})) {
      if (!(key in defaults)) continue;
      const base = defaults[key];
      if (Array.isArray(base) ? !Array.isArray(value) : typeof value !== typeof base || (base !== null && typeof base === 'object' && Array.isArray(value))) continue;
      if (typeof value === 'number' && !Number.isFinite(value)) continue;
      if (typeof value === 'string' && value.length > 10000) continue;
      next[key] = value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
    }
    return next;
  };
}

/** The modules/catalog.js-shaped entry of a package. The server code may replace `sanitize` (export sanitizeSettings). */
export function platformCatalogEntry(manifest) {
  return {
    id: manifest.id,
    defaultEnabled: manifest.settings.defaultEnabled,
    permissions: manifest.permissions,
    defaults: manifest.settings.defaults,
    publicSettings: manifest.settings.public,
    sanitize: genericSanitizer(manifest.settings.defaults),
    package: true,
  };
}
