/*
 * Translation checks (npm run i18n:check, backend test/i18n.test.js). Shared
 * copy: src/frontend/src/i18n/check.js and src/backend/services/i18n/check.js
 * are kept identical by the backend test. Pure functions, no imports.
 *
 * compareTranslation(reference, target, { categories }) compares a language
 * with English, unit by unit. A unit is one text, or one plural group
 * (`files_one` / `files_few` / … / `files_other`, counted once). It returns:
 *   total, translated        units in English, and how many the language has
 *   missing                  English units the language lacks
 *   extra                    texts with no English counterpart (typo or stale key)
 *   placeholders             {name} used by the translation but unknown in English
 *   lostPlaceholders         English {name} the translation does not use (warning)
 *   plurals                  plural groups without every form the language needs
 *   types                    a text where English has a list or group, or the reverse
 * `structural`: keys that are not text (ids, icons, links between articles).
 */

const SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLURAL = new RegExp(`^(.+)_(${SUFFIXES.join('|')})$`);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const join = (prefix, key) => (prefix ? `${prefix}.${key}` : String(key));

/** `{name}` placeholders of a text. */
export function placeholdersOf(text) {
  return new Set([...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
}

function groupsOf(object) {
  const groups = new Map();
  for (const [key, value] of Object.entries(object)) {
    const match = PLURAL.exec(key);
    if (match && typeof value === 'string') {
      if (!groups.has(match[1])) groups.set(match[1], {});
      groups.get(match[1])[match[2]] = value;
    }
  }
  return groups;
}

const present = (value) => typeof value === 'string' && value !== '';

export function compareTranslation(reference, target, { categories = ['one', 'other'], structural = [] } = {}) {
  // Keys that are structure, not text (help articles: id, icon, related, more): they stay English-only.
  const skip = new Set(structural);
  const report = { total: 0, translated: 0, missing: [], extra: [], placeholders: [], lostPlaceholders: [], plurals: [], types: [] };

  const checkText = (path, ref, own) => {
    const known = placeholdersOf(ref);
    const used = placeholdersOf(own);
    const unknown = [...used].filter((name) => !known.has(name));
    const lost = [...known].filter((name) => !used.has(name));
    if (unknown.length) report.placeholders.push(`${path}: {${unknown.join('}, {')}}`);
    if (lost.length) report.lostPlaceholders.push(`${path}: {${lost.join('}, {')}}`);
  };

  const walk = (ref, own, prefix) => {
    if (Array.isArray(ref)) {
      if (own !== undefined && own !== null && !Array.isArray(own)) {
        report.types.push(`${prefix}: list expected`);
        own = undefined;
      }
      ref.forEach((value, index) => walk(value, own?.[index], join(prefix, index)));
      if (Array.isArray(own) && own.length > ref.length) for (let index = ref.length; index < own.length; index++) report.extra.push(join(prefix, index));
      return;
    }
    if (isObject(ref)) {
      if (own !== undefined && own !== null && !isObject(own)) {
        report.types.push(`${prefix}: group of texts expected`);
        own = undefined;
      }
      const mine = own || {};
      const refGroups = groupsOf(ref);
      const ownGroups = groupsOf(mine);
      for (const [key, value] of Object.entries(ref)) {
        if (skip.has(key)) continue;
        const match = PLURAL.exec(key);
        if (match && typeof value === 'string') continue; // counted with its group below
        walk(value, mine[key], join(prefix, key));
      }
      for (const [stem, forms] of refGroups) {
        const path = join(prefix, stem);
        report.total += 1;
        const ownForms = ownGroups.get(stem) || {};
        const plain = mine[stem];
        if (Object.keys(ownForms).length) {
          report.translated += 1;
          const needed = categories.filter((category) => !present(ownForms[category]));
          if (needed.length) report.plurals.push(`${path}: needs ${needed.map((category) => `${stem}_${category}`).join(', ')}`);
          for (const [category, text] of Object.entries(ownForms)) checkText(`${path}_${category}`, forms[category] ?? forms.other ?? Object.values(forms)[0], text);
        } else if (present(plain)) {
          // One text for every number ("Файлов: {count}"): allowed.
          report.translated += 1;
          checkText(path, forms.other ?? Object.values(forms)[0], plain);
        } else {
          report.missing.push(path);
        }
      }
      for (const [key, value] of Object.entries(mine)) {
        if (key in ref || skip.has(key)) continue;
        const match = PLURAL.exec(key);
        if (match && refGroups.has(match[1])) continue; // a plural form English does not need (ru: few, many)
        if (refGroups.has(key)) continue; // plain text for a plural group
        report.extra.push(join(prefix, key));
        void value;
      }
      return;
    }
    if (typeof ref !== 'string') return; // numbers, booleans: structure, not text
    report.total += 1;
    if (own === undefined || own === null || (own === '' && ref !== '')) {
      report.missing.push(prefix);
      return;
    }
    if (typeof own !== 'string') {
      report.types.push(`${prefix}: text expected`);
      return;
    }
    report.translated += 1;
    checkText(prefix, ref, own);
  };

  walk(reference, target, '');
  return report;
}

/** Errors of a report that are mistakes in what was written (never just "not translated yet"). */
export function writtenErrors(report) {
  return [...report.extra.map((key) => `extra key ${key}`), ...report.placeholders.map((item) => `unknown placeholder ${item}`), ...report.plurals.map((item) => `plural ${item}`), ...report.types.map((item) => `type ${item}`)];
}

/** "87.5 %" of a report. */
export function coverageOf(report) {
  return report.total ? report.translated / report.total : 1;
}
