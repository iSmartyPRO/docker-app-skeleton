import { useState } from 'react';

const PREFS_KEY = 'drive_prefs';

/** Folder view preferences (layout, sort, hidden files), kept per device. */
export function usePrefs() {
  const [prefs, setPrefs] = useState(() => {
    try {
      return { view: 'grid', sort: 'name', desc: false, hidden: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
    } catch {
      return { view: 'grid', sort: 'name', desc: false, hidden: false };
    }
  });
  const update = (patch) =>
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  return [prefs, update];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function sortEntries(entries, { sort, desc }) {
  const list = [...entries].sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    let order = 0;
    if (sort === 'mtime') order = new Date(a.mtime || 0) - new Date(b.mtime || 0);
    else if (sort === 'size') order = (a.size || 0) - (b.size || 0);
    else if (sort === 'type') order = collator.compare(a.ext || '', b.ext || '') || collator.compare(a.name, b.name);
    if (!order) order = collator.compare(a.name, b.name);
    return desc ? -order : order;
  });
  return list;
}
