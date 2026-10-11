import { useEffect, useState } from 'react';
import { useLocale } from '../context/LocaleContext';

/*
 * Help content registry.
 *
 * Each module documents itself in help/content/<id>.js (see SCHEMA.md). Files
 * are loaded on demand, so the help adds nothing to the first page load.
 */

const loaders = import.meta.glob('./content/*.js');

/** Order of the help center's table of contents. */
export const HELP_ORDER = [
  'start',
  'account',
  'notifications',
  'dashboard',
  'tasks',
  'calendar',
  'chat',
  'files',
  'drive',
  'kb',
  'companies',
  'resources',
  'admin',
  'api',
];

const cache = new Map();

export function helpIds() {
  const available = new Set(Object.keys(loaders).map((path) => path.replace('./content/', '').replace('.js', '')));
  return [...HELP_ORDER.filter((id) => available.has(id)), ...[...available].filter((id) => !HELP_ORDER.includes(id)).sort()];
}

export function loadHelp(id) {
  if (!cache.has(id)) {
    const loader = loaders[`./content/${id}.js`];
    cache.set(id, loader ? loader().then((mod) => mod.default) : Promise.resolve(null));
  }
  return cache.get(id);
}

export function loadAllHelp() {
  return Promise.all(helpIds().map((id) => loadHelp(id))).then((list) => list.filter(Boolean));
}

/** Which help article fits the page the person is on. */
export function helpForPath(pathname) {
  if (pathname.startsWith('/admin/api') || pathname.startsWith('/developers')) return 'api';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/account/notifications')) return 'notifications';
  if (pathname.startsWith('/account/api')) return 'api';
  if (pathname.startsWith('/account')) return 'account';
  const app = pathname.match(/^\/app\/([a-z]+)/);
  if (app) return app[1];
  return 'start';
}

/** Picks the text in the UI language from { ru, en } (or returns a string as is). */
export const tr = (value, locale) => (value && typeof value === 'object' && !Array.isArray(value) ? value[locale] ?? value.ru ?? value.en ?? '' : value ?? '');

/** The title of another article, loaded on demand. */
export function HelpTitle({ id }) {
  const { locale } = useLocale();
  const [title, setTitle] = useState(id);
  useEffect(() => {
    let alive = true;
    loadHelp(id).then((content) => alive && content && setTitle(tr(content.title, locale)));
    return () => {
      alive = false;
    };
  }, [id, locale]);
  return title;
}
