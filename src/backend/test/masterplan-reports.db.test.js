import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/*
 * Correcting and deleting construction reports against a real database:
 * rights (author window, moderators, zones), files leaving the disk, stage
 * progress and readiness after a report is deleted or corrected.
 *
 *   MASTERPLAN_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/masterplan-reports.db.test.js
 *
 * Never against production. Skipped without MASTERPLAN_DB_TEST.
 */

const enabled = process.env.MASTERPLAN_DB_TEST === '1';
const skip = enabled ? false : 'set MASTERPLAN_DB_TEST=1 and a test database to run';

// Files go to a throw-away upload directory (read by config/paths.js at import).
const uploads = mkdtempSync(join(tmpdir(), 'mp-reports-'));
process.env.UPLOAD_DIR = uploads;

let db = null;
const projects = [];

after(async () => {
  rmSync(uploads, { recursive: true, force: true });
  if (!db) return;
  for (const id of projects) await db.query(`DELETE FROM mp_projects WHERE id = $1`, [id]);
  await db.closePool();
});

test('database: report rights, photo files, progress and readiness after delete / correction', { skip }, async () => {
  db = await import('../config/database.js');
  const { ensureMasterplanSchema } = await import('../modules/masterplan/schema.js');
  await ensureMasterplanSchema();
  const { updateAdminSettings } = await import('../services/settings.js');
  await updateAdminSettings({ modules: { masterplan: { enabled: true } } });
  const { rows: users } = await db.query(`SELECT id FROM users WHERE is_active IS NOT FALSE ORDER BY id LIMIT 4`);
  assert.ok(users.length >= 3, 'the test database needs three users');
  const [adminId, aId, bId] = users.map((row) => row.id);

  const { mpSettings } = await import('../modules/masterplan/access.js');
  const { createProject } = await import('../modules/masterplan/projects.js');
  const { createNode, bulkCreate } = await import('../modules/masterplan/nodes.js');
  const C = await import('../modules/masterplan/construction.js');
  const { deleteMedia } = await import('../modules/masterplan/media.js');
  const { weightedReadiness } = await import('../modules/masterplan/rules.js');
  const settings = await mpSettings();
  const ctxOf = (userId, roles, assignments = []) => ({ userId, globalRoles: new Set(roles), isAdmin: roles.includes('admin'), assignments, settings, request: null });
  const admin = ctxOf(adminId, ['admin']);
  const project = await createProject(admin, { name: `DBTEST-REP ${Date.now()}`, currency: 'USD' });
  projects.push(project.id);
  const pid = project.id;
  const { rows: types } = await db.query(`SELECT id FROM mp_types WHERE key = 'cottage'`);
  const sectorA = await createNode(admin, { projectId: pid, kind: 'level', levelKey: 'sector', code: 'RA' });
  const sectorB = await createNode(admin, { projectId: pid, kind: 'level', levelKey: 'sector', code: 'RB' });
  const { ids } = await bulkCreate(admin, { projectId: pid, parentId: sectorA.id, kind: 'object', typeId: types[0].id, prefix: 'RA-', from: 1, count: 4 });
  await bulkCreate(admin, { projectId: pid, parentId: sectorB.id, kind: 'object', typeId: types[0].id, prefix: 'RB-', from: 1, count: 1 });
  const { rows: stages } = await db.query(`SELECT id, weight FROM mp_stages WHERE set_key = 'lowrise' AND archived_at IS NULL ORDER BY sort, id`);
  const stageId = stages[0].id;

  const foreman = ctxOf(aId, [], [{ projectId: pid, nodeId: sectorA.id, role: 'foreman' }]);
  const foremanMoved = ctxOf(aId, [], [{ projectId: pid, nodeId: sectorB.id, role: 'foreman' }]);
  const otherForeman = ctxOf(bId, [], [{ projectId: pid, nodeId: sectorA.id, role: 'foreman' }]);
  const headB = ctxOf(bId, [], [{ projectId: pid, nodeId: sectorB.id, role: 'construction_head' }]);
  const headA = ctxOf(bId, [], [{ projectId: pid, nodeId: sectorA.id, role: 'construction_head' }]);

  const percent = async (nodeId, stage = stageId) => Number((await db.query(`SELECT percent FROM mp_node_stages WHERE node_id = $1 AND stage_id = $2`, [nodeId, stage])).rows[0]?.percent ?? 0);
  const readinessOk = async (nodeId) => {
    const { rows } = await db.query(`SELECT readiness FROM mp_nodes WHERE id = $1`, [nodeId]);
    const list = [];
    for (const stage of stages) list.push({ weight: stage.weight, percent: await percent(nodeId, stage.id) });
    assert.equal(Number(rows[0].readiness), weightedReadiness(list), 'readiness follows the stages');
    return Number(rows[0].readiness);
  };
  /** A photo uploaded by `userId` and waiting for a report, with its file and preview on disk. */
  const photo = async (userId) => {
    const key = `2026/10/test-${Math.random().toString(16).slice(2)}`;
    mkdirSync(join(uploads, 'masterplan', '2026/10'), { recursive: true });
    writeFileSync(join(uploads, 'masterplan', `${key}.jpg`), 'x');
    writeFileSync(join(uploads, 'masterplan', `${key}-t.jpg`), 'x');
    const { rows } = await db.query(
      `INSERT INTO mp_media (project_id, kind, name, mime, size, storage_key, thumb_key, created_by) VALUES ($1, 'photo', 'p.jpg', 'image/jpeg', 1, $2, $3, $4) RETURNING id`,
      [pid, `${key}.jpg`, `${key}-t.jpg`, userId]
    );
    return { id: rows[0].id, file: join(uploads, 'masterplan', `${key}.jpg`), thumb: join(uploads, 'masterplan', `${key}-t.jpg`) };
  };
  const forbiddenCode = (code) => (err) => err.statusCode === 403 && (!code || err.code === code);

  // ── 1. The foreman's reports; "40 % → 55 %".
  const p1 = await photo(aId);
  const p2 = await photo(aId);
  const r1 = await C.createReport(foreman, { projectId: pid, nodeIds: [ids[0]], stageId, percent: 40, factDate: '2026-10-01' });
  const r2 = await C.createReport(foreman, { projectId: pid, nodeIds: [ids[0]], stageId, percent: 55, factDate: '2026-10-05', mediaIds: [p1.id, p2.id] });
  assert.equal(await percent(ids[0]), 55);
  assert.equal(r2.prevPercent, 40);
  assert.equal(r2.canEdit, true);
  assert.ok(r2.editUntil, 'the author sees until when');
  await readinessOk(ids[0]);

  // ── 2. Others: another foreman of the zone, a head of another sector — 403; sales cannot even try.
  await assert.rejects(C.deleteReport(otherForeman, r2.id), forbiddenCode());
  await assert.rejects(C.updateReport(otherForeman, r2.id, { body: 'x' }), forbiddenCode());
  await assert.rejects(C.deleteReport(headB, r2.id), forbiddenCode());
  assert.equal((await C.reportById(otherForeman, r2.id)).canDelete, false);

  // ── 3. The author corrects the percent within the window: progress and readiness follow.
  const fixed = await C.updateReport(foreman, r2.id, { percent: 60, body: 'Кладка 2 этажа' });
  assert.equal(fixed.percent, 60);
  assert.equal(fixed.prevPercent, 40, 'the "before" stays');
  assert.equal(fixed.body, 'Кладка 2 этажа');
  assert.ok(fixed.editedAt);
  assert.equal(await percent(ids[0]), 60);
  await readinessOk(ids[0]);

  // ── 4. One photo out of the report: row and files gone, event written (through the generic media route too).
  const afterPhoto = await deleteMedia(foreman, p1.id).then(() => C.reportById(foreman, r2.id));
  assert.equal(afterPhoto.media.length, 1);
  assert.equal(existsSync(p1.file), false, 'file removed');
  assert.equal(existsSync(p1.thumb), false, 'preview removed');
  assert.equal(existsSync(p2.file), true);
  const { rows: edited } = await db.query(`SELECT data FROM mp_events WHERE node_id = $1 AND kind = 'report_edited' ORDER BY id DESC LIMIT 1`, [ids[0]]);
  assert.equal(edited[0].data.photosRemoved, 1);

  // ── 5. After 24 h the report is the record: the author is refused, a moderator is not.
  await db.query(`UPDATE mp_reports SET published_at = NOW() - INTERVAL '25 hours' WHERE id = $1`, [r2.id]);
  await assert.rejects(C.updateReport(foreman, r2.id, { body: 'late' }), forbiddenCode('REPORT_LOCKED'));
  await assert.rejects(C.deleteReport(foreman, r2.id), forbiddenCode('REPORT_LOCKED'));
  await assert.rejects(C.deleteReportMedia(foreman, r2.id, p2.id), forbiddenCode('REPORT_LOCKED'));
  assert.equal((await C.reportById(foreman, r2.id)).canDelete, false);

  // ── 6. The head of construction deletes it: stage back to the previous report, readiness recomputed, files gone.
  const { restored } = await C.deleteReport(headA, r2.id);
  assert.deepEqual(restored, [{ nodeId: ids[0], from: 60, to: 40 }]);
  assert.equal(await percent(ids[0]), 40);
  await readinessOk(ids[0]);
  assert.equal(existsSync(p2.file), false);
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM mp_media WHERE id = $1`, [p2.id])).rows[0].n, 0);
  await assert.rejects(C.reportById(admin, r2.id), (err) => err.statusCode === 404);
  const { rows: deleted } = await db.query(`SELECT data, author_id FROM mp_events WHERE node_id = $1 AND kind = 'report_deleted' ORDER BY id DESC LIMIT 1`, [ids[0]]);
  assert.equal(deleted[0].author_id, bId);
  assert.deepEqual(deleted[0].data.restored, { from: 60, to: 40 });
  assert.equal(deleted[0].data.photos, 1);
  // The first report again owns the stage: deleting it brings the stage to 0.
  await C.deleteReport(foreman, r1.id);
  assert.equal(await percent(ids[0]), 0);
  assert.equal(await readinessOk(ids[0]), 0);

  // ── 7. Zones: an author who no longer holds the zone cannot touch even a draft.
  const draft = await C.createReport(foreman, { projectId: pid, nodeIds: [ids[1]], stageId, percent: 30, submit: false });
  assert.equal(draft.status, 'draft');
  assert.equal(draft.prevPercent, 0, 'what publishing would change');
  await assert.rejects(C.deleteReport(foremanMoved, draft.id), forbiddenCode());
  // Submitted: without moderation it is published and applied.
  const sent = await C.updateReport(foreman, draft.id, { submit: true });
  assert.equal(sent.status, 'published');
  assert.equal(await percent(ids[1]), 30);
  await readinessOk(ids[1]);

  // ── 8. A late, older-dated report skipped because of a newer one takes over when the newer one goes.
  const newer = await C.createReport(admin, { projectId: pid, nodeIds: [ids[2]], stageId, percent: 50, factDate: '2026-10-10' });
  const late = await C.createReport(admin, { projectId: pid, nodeIds: [ids[2]], stageId, percent: 30, factDate: '2026-10-01' });
  assert.equal(await percent(ids[2]), 50);
  await C.deleteReport(admin, newer.id);
  assert.equal(await percent(ids[2]), 30, 'the remaining newest fact');
  await C.deleteReport(admin, late.id);
  assert.equal(await percent(ids[2]), 0);
  await readinessOk(ids[2]);

  // ── 9. A correction by hand after the report stands when the report is deleted.
  const manual = await C.createReport(admin, { projectId: pid, nodeIds: [ids[3]], stageId, percent: 70 });
  await C.updateNodeStage(admin, ids[3], stageId, { percent: 75 });
  await C.deleteReport(admin, manual.id);
  assert.equal(await percent(ids[3]), 75);
  await readinessOk(ids[3]);

  // ── 10. A report applied before the bookkeeping existed (no applied_at): handled by date.
  const legacy = await C.createReport(admin, { projectId: pid, nodeIds: [ids[1]], stageId, percent: 45, factDate: '2026-10-20' });
  await db.query(`UPDATE mp_report_nodes SET applied_at = NULL, prev_percent = NULL WHERE report_id = ANY($1::int[])`, [[legacy.id, sent.id]]);
  await C.deleteReport(admin, legacy.id);
  assert.equal(await percent(ids[1]), 30, 'back to the newest remaining report');
  await readinessOk(ids[1]);

  // ── 11. Correcting the date of a published report re-applies it by the newest-fact rule.
  const a = await C.createReport(admin, { projectId: pid, nodeIds: [ids[2]], stageId, percent: 20, factDate: '2026-10-02' });
  const b = await C.createReport(admin, { projectId: pid, nodeIds: [ids[2]], stageId, percent: 35, factDate: '2026-10-03' });
  assert.equal(await percent(ids[2]), 35);
  await C.updateReport(admin, a.id, { factDate: '2026-10-04' });
  assert.equal(await percent(ids[2]), 20, 'now the newest fact');
  await C.updateReport(admin, a.id, { factDate: '2026-10-01' });
  assert.equal(await percent(ids[2]), 35, 'older again: the other report owns the stage');
  await C.deleteReport(admin, b.id);
  await readinessOk(ids[2]);
});
