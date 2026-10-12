import { useEffect, useSyncExternalStore } from 'react';
import api from '../../services/api';
import { loadAllHelp, tr } from '../../help/registry';

/*
 * The person's robot settings, shared by the floating robot and the settings
 * pages: one request, one source of truth, updates visible everywhere at once.
 */

let state = { prefs: null, userId: null, loading: false };
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());
const set = (patch) => {
  state = { ...state, ...patch };
  emit();
};

export function loadPrefs(userId) {
  if (!userId) return Promise.resolve(null);
  if (state.userId === userId && (state.prefs || state.loading)) return Promise.resolve(state.prefs);
  set({ userId, prefs: null, loading: true });
  return api
    .get('/app/assistant/prefs')
    .then((res) => {
      if (state.userId === userId) set({ prefs: res.data.prefs, loading: false });
      return res.data.prefs;
    })
    .catch(() => {
      // Module off (404) or offline: no robot.
      if (state.userId === userId) set({ prefs: { enabled: false, unavailable: true }, loading: false });
      return null;
    });
}

export async function savePrefs(patch) {
  // Optimistic: the robot reacts at once, the server confirms.
  if (state.prefs) set({ prefs: { ...state.prefs, ...patch } });
  const res = await api.put('/app/assistant/prefs', patch);
  set({ prefs: res.data.prefs });
  return res.data.prefs;
}

export function useAssistantPrefs(userId) {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state
  );
  useEffect(() => {
    loadPrefs(userId);
  }, [userId]);
  return snapshot.userId === userId ? snapshot.prefs : null;
}

// ── Position (per device: screens differ) ───────────────────────────────────
const POS_KEY = 'da_assistant_pos';

export function readPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved;
  } catch {
    // storage blocked: default corner
  }
  return null;
}

export function writePosition(pos) {
  try {
    if (pos) localStorage.setItem(POS_KEY, JSON.stringify(pos));
    else localStorage.removeItem(POS_KEY);
  } catch {
    // storage blocked: position lasts for this visit
  }
  window.dispatchEvent(new Event('assistant:position'));
}

// ── Help search ─────────────────────────────────────────────────────────────
const plain = (text) =>
  String(text || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const words = (text) =>
  plain(text)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я0-9]+/i)
    .filter((word) => word.length > 1);

let index = null;
/** Every help article, section, question and tip as searchable entries. */
async function helpIndex(locale) {
  if (index?.locale === locale) return index.entries;
  const all = await loadAllHelp();
  const entries = [];
  all.forEach((doc) => {
    const article = tr(doc.title, locale);
    entries.push({ kind: 'article', id: doc.id, title: article, text: `${tr(doc.tagline, locale)} ${tr(doc.summary, locale)}`, article });
    (doc.sections || []).forEach((section) =>
      entries.push({ kind: 'section', id: doc.id, section: section.id, title: tr(section.title, locale), text: plain(tr(section.body, locale)), article })
    );
    (doc.faq || []).forEach((item) => entries.push({ kind: 'faq', id: doc.id, title: tr(item.q, locale), text: plain(tr(item.a, locale)), answer: tr(item.a, locale), article }));
  });
  entries.forEach((entry) => {
    entry.titleWords = words(entry.title);
    entry.textWords = words(entry.text);
  });
  index = { locale, entries };
  return entries;
}

/** Best matches for a question: title hits weigh more; prefixes count (задач → задачи). */
export async function searchHelp(query, locale, here) {
  const asked = words(query).map((word) => word.slice(0, Math.max(3, word.length - 2)));
  if (!asked.length) return [];
  const entries = await helpIndex(locale);
  const hit = (list, stem) => list.some((word) => word.startsWith(stem));
  return entries
    .map((entry) => {
      let score = 0;
      asked.forEach((stem) => {
        if (hit(entry.titleWords, stem)) score += 3;
        else if (hit(entry.textWords, stem)) score += 1;
      });
      if (score && entry.id === here) score += 0.5;
      if (score && entry.kind === 'faq') score += 0.3;
      return { ...entry, score };
    })
    .filter((entry) => entry.score >= Math.min(2, asked.length))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

export { plain as plainHelpText };
