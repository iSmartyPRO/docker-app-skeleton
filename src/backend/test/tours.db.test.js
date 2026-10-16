import '../test-fixtures/test-env.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Tour progress and interface preferences in the database: marks per person
 * and tour (versions only grow), «Не показывать туры», users.ui merging,
 * forgetting one tour, resetting for everyone, and the public user shape.
 * Needs a test database (never production!):
 *
 *   TOURS_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/tours.db.test.js
 */

const enabled = process.env.TOURS_DB_TEST === '1';
const skip = enabled ? false : 'set TOURS_DB_TEST=1 and a test database to run';
const tag = `tour${Date.now().toString(36)}`;
let db = null;
const users = [];

after(async () => {
  if (!db) return;
  if (users.length) await db.query(`DELETE FROM users WHERE id = ANY($1)`, [users]);
  await db.closePool();
});

test('database: tours progress, switch, reset and ui preferences', { skip }, async () => {
  db = await import('../config/database.js');
  const { ensureUsersTable, findUserById, toPublicUser } = await import('../services/users.js');
  const tours = await import('../services/tours.js');
  await ensureUsersTable();
  await tours.ensureTourTables();

  const make = async (name) => {
    const { rows } = await db.query(`INSERT INTO users (username, password_hash) VALUES ($1, '!') RETURNING id`, [`${tag}.${name}`]);
    users.push(rows[0].id);
    return rows[0].id;
  };
  const anna = await make('anna');
  const boris = await make('boris');

  assert.deepEqual(await tours.getTourState(anna), { seen: {}, disabled: false });
  await tours.markTour(anna, { id: 'portal', status: 'done', version: 1 });
  await tours.markTour(anna, { id: 'tasks', status: 'skipped', version: 3 });
  // A late mark of an older version never lowers what was seen.
  await tours.markTour(anna, { id: 'tasks', status: 'done', version: 2 });
  let state = await tours.getTourState(anna);
  assert.deepEqual(Object.keys(state.seen).sort(), ['portal', 'tasks']);
  assert.equal(state.seen.tasks.version, 3);
  assert.equal(state.seen.tasks.status, 'done');
  assert.deepEqual((await tours.getTourState(boris)).seen, {}, 'progress is personal');

  await tours.setToursDisabled(anna, true);
  state = await tours.getTourState(anna);
  assert.equal(state.disabled, true);

  // users.ui merges: the switch stays when the theme part changes.
  const ui = await tours.updateUserUi(anna, { motion: 'off', custom: { accent: '#123456', scheme: 'dark' } });
  assert.deepEqual(ui, { motion: 'off', toursOff: true, custom: { image: null, accent: '#123456', scheme: 'dark', dim: 70, blur: 6 } });
  const row = await findUserById(anna);
  assert.deepEqual(toPublicUser(row).ui, ui, '/auth/me carries the preferences');

  await tours.forgetTour(anna, 'portal');
  assert.deepEqual(Object.keys((await tours.getTourState(anna)).seen), ['tasks']);

  await tours.markTour(boris, { id: 'portal' });
  const removed = await tours.resetAllTours();
  assert.ok(removed >= 2);
  state = await tours.getTourState(anna);
  assert.deepEqual(state.seen, {});
  assert.equal(state.disabled, true, 'a reset keeps the personal «Не показывать туры»');

  // Deleting the person removes their marks (ON DELETE CASCADE).
  await tours.markTour(boris, { id: 'files' });
  await db.query(`DELETE FROM users WHERE id = $1`, [boris]);
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM user_tours WHERE user_id = $1`, [boris]);
  assert.equal(rows[0].n, 0);

  // Themes beyond light/dark/system are accepted by the profile.
  const { updateUser } = await import('../services/users.js');
  await updateUser(anna, { theme: 'borealis' });
  assert.equal((await findUserById(anna)).theme, 'borealis');
  await updateUser(anna, { theme: 'nonsense' });
  assert.equal((await findUserById(anna)).theme, 'borealis', 'unknown themes are ignored');
});
