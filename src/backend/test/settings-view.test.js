import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPool } from '../config/database.js';
import { CRM_DEFAULTS, MODULE_CATALOG } from '../modules/catalog.js';
import { getSettings, getSettingsView, invalidateSettings, localizeCrmStockLists, migrateCrmStockLists, parseSettings } from '../services/settings.js';

/*
 * The parsed settings view of the hot paths (getSettingsView) and the CRM stock-list migration,
 * without a database: the pool's query is replaced by a fake.
 */

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

function fakeClient({ modules, deals = 0, dealsTable = true }) {
  const state = { modules: modules === undefined ? undefined : JSON.stringify(modules), writes: 0 };
  const client = {
    async query(text, params) {
      if (/to_regclass/.test(text)) return { rows: [{ t: dealsTable ? 'crm_deals' : null }] };
      if (/FROM crm_deals/.test(text)) return { rows: deals ? [{ '?column?': 1 }] : [] };
      if (/SELECT value FROM app_settings/.test(text)) return { rows: state.modules === undefined ? [] : [{ value: state.modules }] };
      if (/INSERT INTO app_settings/.test(text)) {
        state.modules = params[0];
        state.writes += 1;
        return { rowCount: 1 };
      }
      throw new Error(`unexpected query ${text}`);
    },
  };
  const transaction = (fn) => fn(client);
  return { state, transaction, stored: () => JSON.parse(state.modules) };
}

test('CRM stock lists: an existing portal that never saved CRM settings keeps the Russian lists', async () => {
  const portal = fakeClient({ modules: { crm: { enabled: true }, kb: { enabled: false } }, deals: 3 });
  assert.deepEqual(await migrateCrmStockLists(portal.transaction), ['sources', 'lostReasons']);
  const stored = portal.stored();
  assert.deepEqual(stored.crm.settings.sources, CRM_DEFAULTS.sources);
  assert.deepEqual(stored.crm.settings.lostReasons, CRM_DEFAULTS.lostReasons);
  assert.equal(stored.crm.enabled, true);
  assert.deepEqual(stored.kb, { enabled: false }, 'other modules kept');
  // Idempotent.
  assert.deepEqual(await migrateCrmStockLists(portal.transaction), []);
  assert.equal(portal.state.writes, 1);

  // An English portal now shows the lists its deals hold; only section titles follow the language.
  const parsed = parseSettings({ modules: portal.state.modules, localization: JSON.stringify({ enabled: ['en', 'ru'], default: 'en', fallback: 'en' }) });
  assert.deepEqual(parsed.modules.crm.settings.sources, CRM_DEFAULTS.sources);
  assert.equal(parsed.modules.crm.settings.sections[0].title, 'About the deal');
  // Setup never runs again on it; even if called, deals block relabelling.
  assert.equal(await localizeCrmStockLists('en', portal.transaction), false);
});

test('CRM stock lists: saved lists are never touched', async () => {
  const portal = fakeClient({ modules: { crm: { settings: { sources: ['Own'], lostReasons: [] } } } });
  assert.deepEqual(await migrateCrmStockLists(portal.transaction), []);
  assert.equal(portal.state.writes, 0);
  const partly = fakeClient({ modules: { crm: { settings: { sources: ['Own'] } } } });
  assert.deepEqual(await migrateCrmStockLists(partly.transaction), ['lostReasons']);
  assert.deepEqual(partly.stored().crm.settings.sources, ['Own']);
  const unreadable = fakeClient({ modules: undefined });
  unreadable.state.modules = '{broken';
  assert.deepEqual(await migrateCrmStockLists(unreadable.transaction), []);
});

test('CRM stock lists: a brand-new portal gets them in its language at setup', async () => {
  // Fresh install: start-up wrote the Russian stock, then the wizard ran in Turkish.
  const portal = fakeClient({ modules: undefined, dealsTable: false });
  await migrateCrmStockLists(portal.transaction);
  assert.equal(await localizeCrmStockLists('tr', portal.transaction), true);
  assert.equal(portal.stored().crm.settings.sources[0], 'Web sitesi');
  assert.equal(portal.stored().crm.settings.lostReasons[0], 'Pahalı');
  // Lists an administrator changed are not replaced.
  const changed = fakeClient({ modules: { crm: { settings: { sources: ['Own'], lostReasons: CRM_DEFAULTS.lostReasons } } } });
  assert.equal(await localizeCrmStockLists('en', changed.transaction), false);
});
