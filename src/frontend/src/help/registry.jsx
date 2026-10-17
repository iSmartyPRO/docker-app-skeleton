import { useEffect, useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import { pick } from '../i18n/languages';
import { activeLocale } from '../i18n/translations';
import { loaders as indexLoaders } from 'virtual:i18n/help-index';

/*
 * Help content registry.
 *
 * Each module documents itself in help/content/<lang>/<id>.js (see SCHEMA.md),
 * one file per language. Files are loaded on demand — only the article and
 * only the language being read — so the help adds nothing to the first page
 * load. A language's article is laid over the English one at build time
 * (`?l10n`, scripts/vite-plugin-i18n.mjs): untranslated parts read in English.
 */

const loaders = import.meta.glob('./content/*/*.js', { query: '?l10n', import: 'default' });
const REFERENCE = 'en';

/** Order of the help center's table of contents. */
export const HELP_ORDER = [
  'start',
  'account',
  'notifications',
  'dashboard',
  'approvals',
  'contracts',
  'tasks',
  'calendar',
  'chat',
  'files',
  'drive',
  'kb',
  'companies',
  'crm',
  'masterplan',
  'procurement',
  'warehouse',
  'resources',
  'admin',
  'api',
];

const cache = new Map();

export function helpIds() {
  const available = new Set(Object.keys(loaders).filter((path) => path.startsWith(`./content/${REFERENCE}/`)).map((path) => path.split('/').pop().replace('.js', '')));
  return [...HELP_ORDER.filter((id) => available.has(id)), ...[...available].filter((id) => !HELP_ORDER.includes(id)).sort()];
}

/** One article in a language (default: the interface language), English when it has no translation file. */
export function loadHelp(id, locale = activeLocale()) {
  const lang = loaders[`./content/${locale}/${id}.js`] ? locale : REFERENCE;
  const key = `${lang}/${id}`;
  if (!cache.has(key)) {
    const loader = loaders[`./content/${key}.js`];
    cache.set(key, loader ? loader() : Promise.resolve(null));
  }
  return cache.get(key);
}

const indexCache = new Map();

/**
 * The help center's table of contents in a language — [{ id, icon, title,
 * tagline, sections, faq }] in HELP_ORDER — one small chunk instead of every article.
 */
export function loadHelpIndex(locale = activeLocale()) {
  const lang = indexLoaders[locale] ? locale : REFERENCE;
  if (!indexCache.has(lang)) {
    const order = helpIds();
    indexCache.set(
      lang,
      indexLoaders[lang]().then((mod) => [...mod.default].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)))
    );
  }
  return indexCache.get(lang);
}

/** Every article of a language (the help center's search; nothing else needs them all). */
export function loadAllHelp(locale = activeLocale()) {
  return Promise.all(helpIds().map((id) => loadHelp(id, locale))).then((list) => list.filter(Boolean));
}

/** Which help article fits the page the person is on. */
export function helpForPath(pathname) {
  if (pathname.startsWith('/admin/api') || pathname.startsWith('/developers')) return 'api';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/account/notifications')) return 'notifications';
  if (pathname.startsWith('/account/api')) return 'api';
  if (pathname.startsWith('/account/substitute')) return 'approvals';
  if (pathname.startsWith('/account')) return 'account';
  const app = pathname.match(/^\/app\/([a-z]+)/);
  if (app) return app[1];
  return 'start';
}

/**
 * A help text. Articles are already in one language, so this passes strings
 * through; a per-language object ({ en, ru, … }) is picked with English fallback.
 */
export const tr = (value, locale) => pick(value, locale);

/** The title of another article, loaded on demand. */
export function HelpTitle({ id }) {
  const { locale } = useLocale();
  const [title, setTitle] = useState(id);
  useEffect(() => {
    let alive = true;
    loadHelp(id, locale).then((content) => alive && content && setTitle(tr(content.title, locale)));
    return () => {
      alive = false;
    };
  }, [id, locale]);
  return title;
}
