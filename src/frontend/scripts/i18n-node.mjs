/*
 * Translations from Node (npm run i18n:check, backend tests): the same files
 * the Vite plugin bundles, read without a bundler.
 *
 *   dictionaries            { en, ru, ky, … } each language's own keys (not merged)
 *   readDictionary(lang)    one language's own keys
 *   buildDictionary(lang)   a language laid over English, as shipped
 *   readArticle(kind, lang, id)   help/<kind>/<lang>/<id>.js (kind: content | admin)
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assemble } from '../src/i18n/merge.js';
import { buildDictionary as build, languagesIn } from './vite-plugin-i18n.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const SRC_DIR = resolve(here, '../src');
export const LOCALES_DIR = join(SRC_DIR, 'locales');
export const HELP_DIR = join(SRC_DIR, 'help');

const load = async (file) => (existsSync(file) ? (await import(pathToFileURL(file).href)).default || {} : null);

export const languages = () => languagesIn(LOCALES_DIR);

/** Namespace files of a language: { ns: content }. */
export async function readNamespaces(lang) {
  const dir = join(LOCALES_DIR, lang);
  if (!existsSync(dir)) return {};
  const names = readdirSync(dir).filter((name) => name.endsWith('.js')).sort();
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name.slice(0, -3), await load(join(dir, name))])));
}

export async function readDictionary(lang) {
  return assemble(await readNamespaces(lang));
}

export function buildDictionary(lang) {
  return build(LOCALES_DIR, lang);
}

/** Article ids of a help kind (from the English folder). */
export function articleIds(kind) {
  const dir = join(HELP_DIR, kind, 'en');
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.js')).map((name) => name.slice(0, -3)).sort() : [];
}

export async function readArticle(kind, lang, id) {
  return load(join(HELP_DIR, kind, lang, `${id}.js`));
}

export const dictionaries = Object.fromEntries(await Promise.all(languages().map(async (lang) => [lang, await readDictionary(lang)])));
