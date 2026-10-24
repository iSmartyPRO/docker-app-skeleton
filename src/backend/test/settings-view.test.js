import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPool } from '../config/database.js';
import { MODULE_CATALOG } from '../modules/catalog.js';
import { CRM_DEFAULTS } from '../modules/crm/settings.js';
import { storeStockLists } from '../modules/crm/schema.js';
import { getSettings, getSettingsView, invalidateSettings, parseSettings } from '../services/settings.js';
import { sourcePackage } from './helpers/modules.js';

/*
 * The parsed settings view of the hot paths (getSettingsView) and the CRM stock lists (stored by the
 * CRM package's migration 001), without a database: the pool's query is replaced by a fake.
 */

// The CRM is a module package: its catalog entry as an installed package adds it.
await sourcePackage('crm');

function fakeRows(rowsFor) {
  const pool = getPool();
  const original = pool.query;
  pool.query = (text, params) => rowsFor(text, params);
  return () => {
    pool.query = original;
  };
}

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const rows = (appName) => ({ rows: [{ key: 'app_name', value: appName }] });

test('getSettingsView: two loads that settle together never store the older parse', async () => {
  const pending = [];
  const restore = fakeRows(() => {
    const next = deferred();
    pending.push(next);
    return next.promise;
  });
  try {
    invalidateSettings();
    const first = getSettingsView();
    await Promise.resolve();
    invalidateSettings(); // an admin save between the two reads
    const second = getSettingsView();
    await Promise.resolve();
    assert.equal(pending.length, 2);
    // Both answers arrive in the same microtask drain, the newer one first.
    pending[1].resolve(rows('New name'));
    pending[0].resolve(rows('Old name'));
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.appName, 'Old name', 'each caller gets the parse of its own load');
    assert.equal(b.appName, 'New name');
    // The cached view is the newer snapshot, served without another query.
    const again = await getSettingsView();
    assert.equal(again.appName, 'New name');
    assert.equal(pending.length, 2, 'served from the cache');
    assert.equal(await getSettingsView(), again, 'same frozen object while the raw cache lasts');
  } finally {
    restore();
    invalidateSettings();
  }
});

test('getSettingsView: a read that started before an invalidation does not fill the cache', async () => {
  const pending = [];
  const restore = fakeRows(() => {
    const next = deferred();
    pending.push(next);
    return next.promise;
  });
  try {
    invalidateSettings();
    const stale = getSettings();
    await Promise.resolve();
    invalidateSettings();
    pending[0].resolve(rows('Before save'));
    assert.equal((await stale).app_name, 'Before save');
    const view = getSettingsView();
    await Promise.resolve();
    assert.equal(pending.length, 2, 'the stale answer was not cached');
    pending[1].resolve(rows('After save'));
    assert.equal((await view).appName, 'After save');
  } finally {
    restore();
    invalidateSettings();
  }
});

test('getSettingsView: frozen view, module-level defaults stay mutable', async () => {
  const restore = fakeRows(async () => rows('Portal'));
  try {
    invalidateSettings();
    const view = await getSettingsView();
    assert.ok(Object.isFrozen(view.modules.crm.settings.currencies));
    assert.throws(() => view.modules.crm.settings.currencies.push('XXX'), TypeError);
    assert.equal(Object.isFrozen(CRM_DEFAULTS.currencies), false, 'CRM_DEFAULTS untouched');
    for (const module of MODULE_CATALOG) {
      for (const value of Object.values(module.defaults || {})) {
        if (value && typeof value === 'object') assert.equal(Object.isFrozen(value), false, `${module.id} defaults stay mutable`);
      }
    }
    // An editor's own copy is mutable too.
    const own = parseSettings(await getSettings());
    own.modules.crm.settings.currencies.push('XXX');
    assert.equal(CRM_DEFAULTS.currencies.includes('XXX'), false, 'the copy does not share the defaults');
  } finally {
    restore();
    invalidateSettings();
  }
});

/* ── CRM stock lists: stored once, never relabelled ───────────────────────── */

function fakeDb({ modules, deals = 0 }) {
  const state = { modules: modules === undefined ? undefined : JSON.stringify(modules), writes: 0 };
  const db = {
    async query(text, params) {
      if (/pg_advisory_xact_lock\(hashtext\('settings:modules'\)\)/.test(text)) {
        state.locked = true;
        return { rows: [] };
      }
      if (/FROM crm_deals/.test(text)) return { rows: deals ? [{ '?column?': 1 }] : [] };
      if (/SELECT value FROM app_settings/.test(text)) return { rows: state.modules === undefined ? [] : [{ value: state.modules }] };
      if (/INSERT INTO app_settings/.test(text)) {
        assert.ok(state.locked, 'the settings lock is taken before the write');
        // As the SQL does: only crm.settings.<missing lists> merged into the stored row (stored lists win).
        if (state.modules === undefined) state.modules = params[1];
        else {
          const current = JSON.parse(state.modules);
          const crm = current.crm && typeof current.crm === 'object' ? current.crm : {};
          const settings = crm.settings && typeof crm.settings === 'object' ? crm.settings : {};
          state.modules = JSON.stringify({ ...current, crm: { ...crm, settings: { ...JSON.parse(params[0]), ...settings } } });
        }
        state.writes += 1;
        return { rowCount: 1 };
      }
      throw new Error(`unexpected query ${text}`);
    },
  };
  return { state, db, stored: () => JSON.parse(state.modules) };
}

/** The portal language for localeFor(null) (getSettingsView through the pool). */
async function withPortalLanguage(lang, fn) {
  const restore = fakeRows(async () => ({ rows: [{ key: 'localization', value: JSON.stringify({ enabled: [lang, 'ru', 'en'], default: lang, fallback: 'en' }) }] }));
  try {
    invalidateSettings();
    return await fn();
  } finally {
    restore();
    invalidateSettings();
  }
}

test('CRM stock lists: a portal with deals that never saved CRM settings keeps the Russian lists', async () => {
  const portal = fakeDb({ modules: { crm: { enabled: true }, kb: { enabled: false } }, deals: 3 });
  assert.deepEqual(await withPortalLanguage('en', () => storeStockLists(portal.db)), ['sources', 'lostReasons']);
  const stored = portal.stored();
  assert.deepEqual(stored.crm.settings.sources, CRM_DEFAULTS.sources);
  assert.deepEqual(stored.crm.settings.lostReasons, CRM_DEFAULTS.lostReasons);
  assert.equal(stored.crm.enabled, true);
  assert.deepEqual(stored.kb, { enabled: false }, 'other modules kept');
  // Idempotent (migration 001 runs once anyway; the CRM installed again after «Удалить данные» starts over).
  assert.deepEqual(await storeStockLists(portal.db), []);
  assert.equal(portal.state.writes, 1);

  // An English portal now shows the lists its deals hold; only section titles follow the language.
  const parsed = parseSettings({ modules: portal.state.modules, localization: JSON.stringify({ enabled: ['en', 'ru'], default: 'en', fallback: 'en' }) });
  assert.deepEqual(parsed.modules.crm.settings.sources, CRM_DEFAULTS.sources);
  assert.equal(parsed.modules.crm.settings.sections[0].title, 'About the deal');
});

test('CRM stock lists: saved lists are never touched', async () => {
  const portal = fakeDb({ modules: { crm: { settings: { sources: ['Own'], lostReasons: [] } } } });
  assert.deepEqual(await storeStockLists(portal.db), []);
  assert.equal(portal.state.writes, 0);
  const partly = fakeDb({ modules: { crm: { settings: { sources: ['Own'] } } }, deals: 1 });
  assert.deepEqual(await storeStockLists(partly.db), ['lostReasons']);
  assert.deepEqual(partly.stored().crm.settings.sources, ['Own']);
  assert.deepEqual(partly.stored().crm.settings.lostReasons, CRM_DEFAULTS.lostReasons);
  const unreadable = fakeDb({ modules: undefined });
  unreadable.state.modules = '{broken';
  assert.deepEqual(await storeStockLists(unreadable.db), []);
});

test('CRM stock lists: a portal without deals gets them in its language', async () => {
  // A new portal in Turkish (or one that installs the CRM later): no settings row for the CRM yet.
  const portal = fakeDb({ modules: undefined });
  assert.deepEqual(await withPortalLanguage('tr', () => storeStockLists(portal.db)), ['sources', 'lostReasons']);
  assert.equal(portal.stored().crm.settings.sources[0], 'Web sitesi');
  assert.equal(portal.stored().crm.settings.lostReasons[0], 'Pahalı');
  // Lists an administrator changed are not replaced.
  const changed = fakeDb({ modules: { crm: { settings: { sources: ['Own'], lostReasons: CRM_DEFAULTS.lostReasons } } } });
  assert.deepEqual(await withPortalLanguage('en', () => storeStockLists(changed.db)), []);
});
