import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPORT_AUTHOR_HOURS, actCaps, capsOf, editNeedsReview, reportEventVisible, reportRights, reportVisible } from '../modules/masterplan/rules.js';

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

// ── Moderated projects: the author's later corrections (docs/masterplan.md) ──

test('a published report corrected by its author in a moderated project goes back to review only for what is moderated', () => {
  const base = { moderation: true, moderator: false, status: 'published' };
  assert.equal(editNeedsReview({ ...base, percent: { from: 40, to: 60 } }), true);
  assert.equal(editNeedsReview({ ...base, factDate: { from: '2026-10-01', to: '2026-10-02' } }), true);
  assert.equal(editNeedsReview({ ...base, photosAdded: true }), true);
  assert.equal(editNeedsReview(base), false, 'the text or a removed photo stays published');
  assert.equal(editNeedsReview({ ...base, moderator: true, percent: { from: 40, to: 60 } }), false, 'a moderator corrects the record');
  assert.equal(editNeedsReview({ ...base, moderation: false, percent: { from: 40, to: 60 } }), false, 'no moderation in the project');
  assert.equal(editNeedsReview({ ...base, status: 'draft', percent: { from: 40, to: 60 } }), false, 'not published yet');
});

// ── History entries about reports follow the report's visibility ───────────

test('report visibility and the history entries about a report', () => {
  const sales = capsOf(new Set(['sales']));
  const foreman = capsOf(new Set(['foreman']));
  const head = capsOf(new Set(['construction_head']));
  const marketing = capsOf(new Set(['marketing']));
  const published = { status: 'published', visibility: 'sales', author_id: 7 };
  const internal = { status: 'published', visibility: 'internal', author_id: 7 };
  const review = { status: 'review', visibility: 'sales', author_id: 7 };
  assert.equal(reportVisible(sales, 1, published), true);
  assert.equal(reportVisible(sales, 1, internal), false);
  assert.equal(reportVisible(foreman, 1, internal), true);
  assert.equal(reportVisible(sales, 1, review), false);
  assert.equal(reportVisible(foreman, 7, review), true, 'the author');
  assert.equal(reportVisible(head, 1, review), true, 'a moderator');
  assert.equal(reportVisible(capsOf(new Set()), 1, published), false, 'no construction view');
  // The report as it is now wins over what the entry recorded.
  const entry = { kind: 'report', author_id: 7, data: { reportId: 1, status: 'review', reportStatus: 'review', visibility: 'sales', reportAuthorId: 7 } };
  assert.equal(reportEventVisible(sales, 1, entry), false, 'under review when written, deleted since');
  assert.equal(reportEventVisible(sales, 1, entry, published), true, 'published since');
  assert.equal(reportEventVisible(sales, 1, { ...entry, data: { ...entry.data, reportStatus: 'published', status: 'published' } }), true);
  // Entries written before visibility was recorded count as internal.
  const old = { kind: 'report_edited', author_id: 7, data: { reportId: 1, percent: { from: 40, to: 60 } } };
  assert.equal(reportEventVisible(sales, 1, old), false);
  assert.equal(reportEventVisible(marketing, 1, old), false);
  assert.equal(reportEventVisible(foreman, 1, old), true);
  const oldDeleted = { kind: 'report_deleted', author_id: 3, data: { reportId: 1, status: 'draft', authorId: 7 } };
  assert.equal(reportEventVisible(foreman, 7, oldDeleted), true, 'the author of a deleted draft');
  assert.equal(reportEventVisible(foreman, 1, oldDeleted), false, 'someone else’s draft');
});
