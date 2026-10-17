/*
 * «Waiting for me» inbox: one list of everything that needs the signed-in
 * person's decision, collected from any number of providers.
 *
 * The core has no idea what a purchase request or a task is. Each module
 * registers a provider at import time:
 *
 *   import { registerInboxProvider } from '../../services/inbox.js';
 *
 *   registerInboxProvider('tasks.acceptance', async (ctx) => {
 *     // ctx.user is the signed-in person ({ id, permissions, roleIds, groupIds, … })
 *     return rows.map((task) => ({
 *       key: `tasks:${task.id}`,          // unique across the whole inbox
 *       module: 'tasks',                  // module id (filter + icon)
 *       kind: 'acceptance',               // what the person must do
 *       id: task.id,
 *       title: task.title,
 *       number: null,
 *       urgency: 'urgent',                // urgency level key, optional
 *       author: { id, name, avatarUrl },  // optional
 *       dueAt: task.accept_due_at,        // ISO string or Date, optional
 *       overdue: false,
 *       url: `/app/tasks?task=${task.id}`,
 *       actions: ['accept'],
 *     }));
 *   }, { module: 'tasks' });
 *
 * Item shape (see docs/approvals.md#inbox-providers):
 *   { key, module, kind, id, title, number?, amount?, currency?, urgency?,
 *     urgencyRank?, author?, dueAt?, overdue, url, actions?, meta? }
 *
 * Providers whose `module` is switched off are skipped. A failing or slow
 * provider never breaks the inbox: its error is logged and its items are left
 * out (the response lists the failed keys).
 */

import { getSettingsView } from './settings.js';

async function isModuleEnabled(id) {
  return Boolean((await getSettingsView()).modules?.[id]?.enabled);
}

const providers = new Map();
const PROVIDER_TIMEOUT_MS = 5000;

/** Default ranks of the stock urgency levels; lower is more urgent. */
const DEFAULT_URGENCY_RANK = { critical: 0, urgent: 1, normal: 2 };

let urgencyRanker = (key) => (key in DEFAULT_URGENCY_RANK ? DEFAULT_URGENCY_RANK[key] : 50);

/**
 * Register (or replace) an inbox provider.
 * @param {string} key     stable unique key, e.g. 'approvals' or 'tasks.acceptance'
 * @param {(ctx: {user: object}) => Promise<object[]>} fn
 * @param {{ module?: string, act?: (ctx, id, action, payload) => Promise<any> }} [options]
 *   module  module id: the provider is skipped while that module is disabled
 *   act     optional handler of inline actions from the inbox page (e.g. 'accept'):
 *           POST /api/app/approvals/inbox/act { provider, id, action, comment }
 * @returns {() => void} unregister function
 */
export function registerInboxProvider(key, fn, options = {}) {
  if (!key || typeof fn !== 'function') throw new Error('registerInboxProvider(key, fn) needs a key and a function');
  const entry = { key: String(key), fn, module: options.module || null, act: typeof options.act === 'function' ? options.act : null };
  providers.set(entry.key, entry);
  return () => {
    if (providers.get(entry.key) === entry) providers.delete(entry.key);
  };
}

export function listInboxProviders() {
  return [...providers.values()].map(({ key, module, act }) => ({ key, module, actions: Boolean(act) }));
}

/** Runs an inline action of a provider's item; 404 when the provider has no `act`. */
export async function inboxAct(ctx, providerKey, id, action, payload = {}) {
  const entry = providers.get(String(providerKey));
  if (!entry?.act) {
    const error = new Error('This item has no inline actions');
    error.statusCode = 404;
    error.code = 'NO_ACTION';
    throw error;
  }
  if (entry.module && !(await isModuleEnabled(entry.module).catch(() => false))) {
    const error = new Error('Module is disabled');
    error.statusCode = 404;
    error.code = 'MODULE_DISABLED';
    throw error;
  }
  return entry.act(providerContext(ctx), id, String(action), payload || {});
}

/** The approvals service plugs in configurable urgency levels here. */
export function setUrgencyRanker(fn) {
  if (typeof fn === 'function') urgencyRanker = fn;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Normalises one provider item; returns null for unusable rows. */
export function normalizeInboxItem(raw, providerKey, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || raw.id == null || !raw.title) return null;
  const dueAt = toIso(raw.dueAt);
  const overdue = raw.overdue != null ? Boolean(raw.overdue) : Boolean(dueAt && Date.parse(dueAt) < now);
  const urgency = raw.urgency ? String(raw.urgency) : null;
  const amount = raw.amount == null || raw.amount === '' ? null : Number(raw.amount);
  return {
    key: String(raw.key || `${providerKey}:${raw.id}`),
    provider: providerKey,
    module: String(raw.module || providerKey.split('.')[0]),
    kind: String(raw.kind || 'item'),
    id: raw.id,
    title: String(raw.title),
    number: raw.number ? String(raw.number) : null,
    amount: Number.isFinite(amount) ? amount : null,
    currency: raw.currency ? String(raw.currency) : null,
    urgency,
    urgencyRank: Number.isFinite(raw.urgencyRank) ? raw.urgencyRank : urgency ? urgencyRanker(urgency) : 99,
    author: raw.author || null,
    dueAt,
    since: toIso(raw.since),
    overdue,
    url: raw.url ? String(raw.url) : null,
    actions: Array.isArray(raw.actions) ? raw.actions.map(String) : [],
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : undefined,
  };
}

/** Overdue first, then by urgency, then by the nearest deadline (no deadline last). */
export function compareInboxItems(a, b) {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  if (a.urgencyRank !== b.urgencyRank) return a.urgencyRank - b.urgencyRank;
  const da = a.dueAt ? Date.parse(a.dueAt) : Infinity;
  const db = b.dueAt ? Date.parse(b.dueAt) : Infinity;
  if (da !== db) return da - db;
  return String(a.title).localeCompare(String(b.title));
}

/**
 * What providers receive: { user, req, access, apiLimits, apiToken }. Given an
 * Express request, `req` is the request itself (an API token's scope and
 * resource limits apply through it); given a plain { user } or a user, `req`
 * is null and providers build their own context (e.g. requestAs(user.id)).
 */
export function providerContext(ctx) {
  if (!ctx) return { user: null, req: null };
  if (ctx.req || ctx.system) return ctx;
  const isRequest = Boolean(ctx.user && (ctx.headers || ctx.access));
  if (isRequest) return { user: ctx.user, req: ctx, access: ctx.access || null, apiLimits: ctx.apiLimits || null, apiToken: ctx.apiToken || null };
  return ctx.user ? { req: null, ...ctx } : { user: ctx, req: null };
}

/**
 * Everything waiting for ctx.user, sorted.
 * @param {{ user: object }} ctx   (a bare user object is accepted too)
 * @param {{ module?: string }} [options]
 * @returns {Promise<{ items: object[], failed: string[] }>}
 */
export async function inboxFor(ctx, options = {}) {
  const context = providerContext(ctx);
  if (!context.user?.id) return { items: [], failed: [] };
  const now = Date.now();
  const active = [];
  for (const entry of providers.values()) {
    if (entry.module && !(await isModuleEnabled(entry.module).catch(() => false))) continue;
    active.push(entry);
  }
  const failed = [];
  const results = await Promise.all(
    active.map(async (entry) => {
      try {
        const rows = await withTimeout(Promise.resolve(entry.fn(context)), PROVIDER_TIMEOUT_MS);
        return (Array.isArray(rows) ? rows : [])
          .map((row) => normalizeInboxItem(row, entry.key, now))
          .filter(Boolean)
          .map((item) => ({ ...item, inline: Boolean(entry.act) }));
      } catch (err) {
        console.warn(`Inbox provider ${entry.key} failed:`, err.message);
        failed.push(entry.key);
        return [];
      }
    })
  );
  const seen = new Set();
  let items = [];
  for (const item of results.flat()) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    items.push(item);
  }
  if (options.module) items = items.filter((item) => item.module === options.module);
  items.sort(compareInboxItems);
  return { items, failed };
}

/** Test helper: drop every provider. */
export function _resetInboxProviders() {
  providers.clear();
}
