/*
 * Vite plugin: per-language translation bundles (docs/i18n.md).
 *
 *   import { loaders } from 'virtual:i18n/catalog'
 *       { en: () => import('virtual:i18n/dict/en'), ru: …, ky: … } — one entry
 *       per folder in src/locales/.
 *   import('virtual:i18n/dict/<lang>')
 *       the whole interface dictionary of one language, already laid over
 *       English: src/locales/en/*.js ← src/locales/<lang>/*.js. Each language
 *       is its own chunk and is complete, so a missing key shows English
 *       without downloading the English chunk too.
 *   import('./content/<lang>/<id>.js?l10n')
 *       any per-language data file (help articles, admin docs) laid over its
 *       English sibling ./content/en/<id>.js. Works with import.meta.glob:
 *       import.meta.glob('./content/*\/*.js', { query: '?l10n', import: 'default' }).
 *   import { loaders } from 'virtual:i18n/help-index'
 *       { en: () => import('virtual:i18n/help-index/en'), … }: per language the
 *       table of contents of the help center — [{ id, icon, title, tagline,
 *       sections, faq }] for every article (sections / faq are counts), so the
 *       help center downloads only the article being read plus this list.
 *
 * Build: the files are evaluated in Node and the merged result is emitted as a
 * JSON literal (fast to parse, nothing English left to fetch). Dev server: the
 * module imports the source files and merges at runtime, so editing a
 * translation updates the page through HMR.
 *
 * Translation files must stay plain data: `export default { … }` with strings,
 * numbers, booleans, arrays and objects, and no imports.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assemble, englishPlurals, overlay } from '../src/i18n/merge.js';

const CATALOG = 'virtual:i18n/catalog';
const DICT = 'virtual:i18n/dict/';
const QUERY = '?l10n';
const HELP_INDEX = 'virtual:i18n/help-index';
const REFERENCE = 'en';

const toPosix = (path) => path.split('\\').join('/');

/** Evaluates a translation file in Node (fresh on every call: watch mode rebuilds). */
async function evaluate(file) {
  if (!existsSync(file)) return {};
  const url = `${pathToFileURL(file).href}?v=${statSync(file).mtimeMs}`;
  const mod = await import(url);
  return mod.default || {};
}

function namespaceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => ({ ns: name.slice(0, -3), file: join(dir, name) }));
}

export function languagesIn(localesDir) {
  if (!existsSync(localesDir)) return [];
  return readdirSync(localesDir)
    .filter((name) => /^[a-z]{2,3}$/.test(name) && statSync(join(localesDir, name)).isDirectory())
    .sort((a, b) => (a === REFERENCE ? -1 : b === REFERENCE ? 1 : a.localeCompare(b)));
}

const readLanguage = async (localesDir, code) => assemble(Object.fromEntries(await Promise.all(namespaceFiles(join(localesDir, code)).map(async ({ ns, file }) => [ns, await evaluate(file)]))));

/** The dictionary of one language, laid over English (used by the plugin and i18n-check). */
export async function buildDictionary(localesDir, lang) {
  const reference = await readLanguage(localesDir, REFERENCE);
  return lang === REFERENCE ? reference : overlay(reference, await readLanguage(localesDir, lang));
}

/** Plural groups the language lacks (English forms, English rules). */
export async function fallbackPlurals(localesDir, lang) {
  if (lang === REFERENCE) return [];
  return englishPlurals(await readLanguage(localesDir, REFERENCE), await readLanguage(localesDir, lang));
}

/** Leaf texts (strings) of a dictionary as dotted paths. */
export function leafPaths(value, prefix = '', out = []) {
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) leafPaths(child, prefix ? `${prefix}.${key}` : key, out);
  } else if (typeof value === 'string') out.push(prefix);
  return out;
}

/** { lang: share of English leaf texts the language has itself }. */
export async function translationCoverage(localesDir, langs = languagesIn(localesDir)) {
  const read = async (code) => assemble(Object.fromEntries(await Promise.all(namespaceFiles(join(localesDir, code)).map(async ({ ns, file }) => [ns, await evaluate(file)]))));
  const reference = leafPaths(await read(REFERENCE));
  const out = {};
  for (const lang of langs) {
    if (lang === REFERENCE) {
      out[lang] = 1;
      continue;
    }
    const own = new Set(leafPaths(await read(lang)));
    out[lang] = reference.length ? Math.round((reference.filter((path) => own.has(path)).length / reference.length) * 1000) / 1000 : 1;
  }
  return out;
}

/** `…/help/content/ky/start.js` → `…/help/content/en/start.js`. */
const referenceSibling = (file) => join(dirname(dirname(file)), REFERENCE, basename(file));

/** Help center table of contents in one language (articles laid over English). */
export async function helpIndex(helpDir, lang) {
  const reference = join(helpDir, REFERENCE);
  if (!existsSync(reference)) return [];
  const out = [];
  for (const name of readdirSync(reference).filter((file) => file.endsWith('.js')).sort()) {
    const base = await evaluate(join(reference, name));
    const own = lang === REFERENCE ? {} : await evaluate(join(helpDir, lang, name));
    const article = lang === REFERENCE ? base : overlay(base, own);
    out.push({
      id: article.id || name.slice(0, -3),
      icon: article.icon,
      title: article.title,
      tagline: article.tagline,
      sections: (article.sections || []).length,
      faq: (article.faq || []).length,
    });
  }
  return out;
}

export default function i18nPlugin({ localesDir = 'src/locales', helpContentDir = 'src/help/content' } = {}) {
  let root = process.cwd();
  let serve = false;
  let dir = resolve(root, localesDir);
  let helpDir = resolve(root, helpContentDir);
  const mergeModule = () => toPosix(resolve(root, 'src/i18n/merge.js'));

  return {
    name: 'portal-i18n',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
      serve = config.command === 'serve';
      dir = resolve(root, localesDir);
      helpDir = resolve(root, helpContentDir);
    },
    resolveId(id) {
      if (id === CATALOG || id.startsWith(DICT) || id === HELP_INDEX || id.startsWith(`${HELP_INDEX}/`)) return `\0${id}`;
      return null;
    },
    async load(id) {
      if (id === `\0${CATALOG}`) {
        const langs = languagesIn(dir);
        const entries = langs.map((lang) => `  ${JSON.stringify(lang)}: () => import(${JSON.stringify(DICT + lang)}),`);
        for (const lang of langs) for (const { file } of namespaceFiles(join(dir, lang))) this.addWatchFile(file);
        const coverage = await translationCoverage(dir, langs);
        return `export const loaders = {\n${entries.join('\n')}\n};\n// Share of English texts each language has (0…1), for Settings → Languages.\nexport const coverage = ${JSON.stringify(coverage)};\n`;
      }
      if (id === `\0${HELP_INDEX}`) {
        const langs = existsSync(helpDir) ? languagesIn(helpDir) : [];
        return `export const loaders = {\n${langs.map((lang) => `  ${JSON.stringify(lang)}: () => import(${JSON.stringify(`${HELP_INDEX}/${lang}`)}),`).join('\n')}\n};\n`;
      }
      if (id.startsWith(`\0${HELP_INDEX}/`)) {
        const lang = id.slice(HELP_INDEX.length + 2);
        for (const code of new Set([REFERENCE, lang])) for (const { file } of namespaceFiles(join(helpDir, code))) this.addWatchFile(file);
        return `export default JSON.parse(${JSON.stringify(JSON.stringify(await helpIndex(helpDir, lang)))});\n`;
      }
      if (id.startsWith(`\0${DICT}`)) {
        const lang = id.slice(DICT.length + 1);
        if (!languagesIn(dir).includes(lang)) throw new Error(`i18n: no folder src/locales/${lang}`);
        const langs = lang === REFERENCE ? [REFERENCE] : [REFERENCE, lang];
        if (serve) {
          const imports = [];
          const maps = langs.map((code, li) => {
            const parts = namespaceFiles(join(dir, code)).map(({ ns, file }, fi) => {
              const name = `m${li}_${fi}`;
              imports.push(`import ${name} from ${JSON.stringify(toPosix(file))};`);
              return `${JSON.stringify(ns)}: ${name}`;
            });
            return `assemble({ ${parts.join(', ')} })`;
          });
          if (maps.length === 1) return `import { assemble } from ${JSON.stringify(mergeModule())};\n${imports.join('\n')}\nexport default ${maps[0]};\nexport const fallbackPlurals = [];\n`;
          return `import { assemble, englishPlurals, overlay } from ${JSON.stringify(mergeModule())};\n${imports.join('\n')}\nconst reference = ${maps[0]};\nconst own = ${maps[1]};\nexport default overlay(reference, own);\nexport const fallbackPlurals = englishPlurals(reference, own);\n`;
        }
        for (const code of langs) for (const { file } of namespaceFiles(join(dir, code))) this.addWatchFile(file);
        const dict = await buildDictionary(dir, lang);
        const plurals = await fallbackPlurals(dir, lang);
        return `export default JSON.parse(${JSON.stringify(JSON.stringify(dict))});\nexport const fallbackPlurals = ${JSON.stringify(plurals)};\n`;
      }
      if (id.endsWith(QUERY)) {
        const file = id.slice(0, -QUERY.length);
        const lang = basename(dirname(file));
        const reference = referenceSibling(file);
        if (serve) {
          if (lang === REFERENCE || !existsSync(reference)) return `export { default } from ${JSON.stringify(toPosix(file))};\n`;
          return `import { overlay } from ${JSON.stringify(mergeModule())};\nimport base from ${JSON.stringify(toPosix(reference))};\nimport own from ${JSON.stringify(toPosix(file))};\nexport default overlay(base, own);\n`;
        }
        this.addWatchFile(file);
        if (existsSync(reference)) this.addWatchFile(reference);
        const own = await evaluate(file);
        const data = lang === REFERENCE || !existsSync(reference) ? own : overlay(await evaluate(reference), own);
        return `export default JSON.parse(${JSON.stringify(JSON.stringify(data))});\n`;
      }
      return null;
    },
    configureServer(server) {
      // A new language folder or namespace file: rebuild the catalog and the dictionaries.
      const refresh = (file) => {
        if (!toPosix(file).startsWith(toPosix(dir))) return;
        for (const mod of server.moduleGraph.idToModuleMap.values()) {
          if (mod.id === `\0${CATALOG}` || mod.id?.startsWith(`\0${DICT}`)) server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
  };
}
