import api from '../../services/api';

const base = '/app/resources';

export const resourcesApi = {
  board: () => api.get('/res'),
  saveLayout: (layout) => api.put(`${base}/layout`, layout),
  resetLayout: () => api.delete(`${base}/layout`),

  admin: () => api.get(`${base}/admin`),
  subjects: () => api.get(`${base}/admin/subjects`),
  createItem: (payload) => api.post(`${base}/admin/items`, payload),
  updateItem: (id, payload) => api.put(`${base}/admin/items/${id}`, payload),
  deleteItem: (id) => api.delete(`${base}/admin/items/${id}`),
  reorder: (ids) => api.put(`${base}/admin/order`, { ids }),
  createCategory: (payload) => api.post(`${base}/admin/categories`, payload),
  updateCategory: (id, payload) => api.put(`${base}/admin/categories/${id}`, payload),
  deleteCategory: (id) => api.delete(`${base}/admin/categories/${id}`),
  reorderCategories: (ids) => api.put(`${base}/admin/categories-order`, { ids }),
  uploadIcon: (file) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return api.post(`${base}/admin/icons`, form);
  },
};

export const iconUrl = (file) => `/api/res/icons/${file}`;

export { MODULE_COLORS } from '../../lib/moduleColors';

/**
 * What a tile says in the current language: its translation, else its own
 * text, else — for a module tile — the module's translated name and summary.
 */
export function itemText(item, { locale, t, settings, registry }) {
  const own = item.i18n?.[locale] || {};
  const module = item.kind === 'module' ? registry?.find((entry) => entry.id === item.module) : null;
  const moduleTitle = module ? settings?.modules?.[module.id]?.title || t(module.labelKey) : '';
  return {
    title: own.title || item.title || moduleTitle || '',
    description: own.description || item.description || (module ? t(module.descKey) : ''),
    host: module ? t('resources.portalModule') : hostOf(item.url),
  };
}

/** "https://mail.google.com/x" → "mail.google.com"; portal paths stay as they are. */
export function hostOf(url) {
  if (!url) return '';
  if (url.startsWith('/')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'mailto:') return parsed.pathname;
    if (parsed.protocol === 'tel:') return parsed.pathname;
    return parsed.host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ── Personal layout for people who are not signed in ──
const LOCAL_KEY = 'resources_layout';

export function readLocalLayout() {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    return value && Array.isArray(value.order) ? { order: value.order, hidden: Array.isArray(value.hidden) ? value.hidden : [] } : null;
  } catch {
    return null;
  }
}

export function writeLocalLayout(layout) {
  try {
    if (layout) localStorage.setItem(LOCAL_KEY, JSON.stringify(layout));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* private mode */
  }
}

/** Items in the person's order (new tiles go to the end), split into shown and hidden. */
export function arrange(items, layout) {
  if (!layout) return { shown: items, hidden: [] };
  const position = new Map(layout.order.map((id, index) => [id, index]));
  const hiddenSet = new Set(layout.hidden);
  const sorted = [...items].sort((a, b) => {
    const pa = position.has(a.id) ? position.get(a.id) : 10_000 + items.indexOf(a);
    const pb = position.has(b.id) ? position.get(b.id) : 10_000 + items.indexOf(b);
    return pa - pb;
  });
  return { shown: sorted.filter((item) => !hiddenSet.has(item.id)), hidden: sorted.filter((item) => hiddenSet.has(item.id)) };
}

/** A category's name in the current language. */
export const categoryName = (category, locale) => category?.i18n?.[locale] || category?.name || '';
