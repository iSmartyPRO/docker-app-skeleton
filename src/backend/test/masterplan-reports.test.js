import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPORT_AUTHOR_HOURS, actCaps, reportRights } from '../modules/masterplan/rules.js';

/*
 * Who may correct or delete a construction report (docs/masterplan.md →
 * Construction → "Correcting and deleting reports"). Pure rules, no database.
 */

const ctxOf = (userId, roles = [], assignments = []) => ({ userId, globalRoles: new Set(roles), assignments });
const sectorA = { project_id: 1, path: [10, 11] };
const sectorB = { project_id: 1, path: [20, 21] };
const foremanA = ctxOf(7, [], [{ projectId: 1, nodeId: 10, role: 'foreman' }]);
const headA = ctxOf(8, [], [{ projectId: 1, nodeId: 10, role: 'construction_head' }]);
const projectAdmin = ctxOf(9, [], [{ projectId: 1, nodeId: null, role: 'admin' }]);
const sales = ctxOf(5, ['sales']);
const rights = (ctx, report, nodes = [sectorA], now = Date.parse('2026-10-13T12:00:00Z')) =>
  reportRights({ report, nodeCaps: nodes.map((node) => actCaps(ctx, node)), userId: ctx.userId, now });
const at = (hoursAgo) => new Date(Date.parse('2026-10-13T12:00:00Z') - hoursAgo * 3600000).toISOString();

test('reports: the author corrects drafts, reviews and returned reports in their zone', () => {
  for (const status of ['draft', 'review', 'rejected']) {
    const r = rights(foremanA, { author_id: 7, status });
    assert.equal(r.edit, true, status);
    assert.equal(r.delete, true, status);
    assert.equal(r.review, false, 'an author is not a moderator');
    assert.equal(r.editUntil, null);
  }
  assert.equal(rights(foremanA, { author_id: 7, status: 'rejected' }).submit, true);
  assert.equal(rights(foremanA, { author_id: 7, status: 'review' }).submit, false);
});

test(`reports: a published report stays the author's for ${REPORT_AUTHOR_HOURS} h, then only moderators`, () => {
  const fresh = rights(foremanA, { author_id: 7, status: 'published', published_at: at(2) });
  assert.equal(fresh.edit, true);
  assert.equal(fresh.delete, true);
  assert.equal(fresh.editUntil, Date.parse(at(2)) + REPORT_AUTHOR_HOURS * 3600000);
  const old = rights(foremanA, { author_id: 7, status: 'published', published_at: at(REPORT_AUTHOR_HOURS + 1) });
  assert.equal(old.edit, false);
  assert.equal(old.delete, false);
  for (const ctx of [headA, projectAdmin, ctxOf(1, ['admin'])]) {
    const r = rights(ctx, { author_id: 7, status: 'published', published_at: at(500) });
    assert.equal(r.edit, true);
    assert.equal(r.delete, true);
    assert.equal(r.editUntil, null, 'no window for moderators');
  }
});

test('reports: zones — out of the zone nobody but a wider moderator changes a report', () => {
  // The author lost the zone (or the report covers sector B too).
  assert.equal(rights(foremanA, { author_id: 7, status: 'draft' }, [sectorA, sectorB]).edit, false);
  assert.equal(rights(ctxOf(7), { author_id: 7, status: 'draft' }).delete, false, 'author without any role');
  // A head of sector A does not moderate a report on sector B.
  assert.equal(rights(headA, { author_id: 7, status: 'review' }, [sectorB]).delete, false);
  assert.equal(rights(headA, { author_id: 7, status: 'review' }, [sectorA]).review, true);
  // Another foreman and sales people never.
  assert.equal(rights(ctxOf(6, [], [{ projectId: 1, nodeId: 10, role: 'foreman' }]), { author_id: 7, status: 'draft' }).edit, false);
  assert.equal(rights(sales, { author_id: 7, status: 'published', published_at: at(1) }).delete, false);
  assert.equal(rights(sales, { author_id: 7, status: 'published' }, []).edit, false, 'no objects → nothing');
});
