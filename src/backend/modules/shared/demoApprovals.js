import { requestAs } from '../../api/events.js';
import { decide, startApproval } from '../approvals/api.js';

/*
 * Approvals in demo data (docs/extending.md «Demo data»): a module's demo may
 * add a route for its document type — only when none is saved, so a real
 * route is never replaced — and walk documents through it with the real
 * engine (people decide as themselves: demo colleagues by their demo
 * account, «by permission» stages as the superadministrator who seeds).
 * Routes and processes are tracked, so «Удалить демо-данные» removes them;
 * a demo route someone has edited since is kept as theirs.
 *
 * When a real route is in force (ensureDemoRoute returned false) the demo
 * must not send its documents to approval at all: the real approvers would
 * get made-up documents. Modules leave them as drafts then, and decideDemo
 * never decides as anybody but a demo person or the seeding administrator.
 */

/** Adds a demo route for `type` unless one is saved. Returns true when it added one (the demo may then use approvals). */
export async function ensureDemoRoute(ctx, type, { name, stages }) {
  const { rows } = await ctx.query(
    `INSERT INTO approval_routes (type, name, stages, restart_from, escalate_to, updated_by, created_at, updated_at)
     VALUES ($1, $2, $3, 'first', '[]'::jsonb, $4, NOW(), NOW())
     ON CONFLICT (type) DO NOTHING RETURNING id`,
    [type, String(name || '').slice(0, 120), JSON.stringify(stages), ctx.userId]
  );
  if (!rows[0]) return false;
  // created_at = updated_at marks it untouched (see purgeDemoRoutes).
  await ctx.query(`UPDATE approval_routes SET updated_at = created_at WHERE id = $1`, [rows[0].id]);
  await ctx.track('approval_routes', rows[0].id);
  return true;
}

/** Demo routes nobody changed are removed; edited ones stay (and stop being demo). */
export async function purgeDemoRoutes(ctx) {
  for (const id of await ctx.records('approval_routes')) {
    const { rows } = await ctx.query(`SELECT updated_at > created_at + INTERVAL '1 second' AS edited FROM approval_routes WHERE id = $1`, [id]);
    if (rows[0]?.edited) await ctx.untrack('approval_routes', id);
    else await ctx.query(`DELETE FROM approval_routes WHERE id = $1`, [id]);
  }
}

/** Starts the approval of a document and tracks its process. */
export async function startDemoApproval(ctx, type, docId, options = {}) {
  await startApproval(ctx.request, type, String(docId), options);
  await trackProcess(ctx, type, docId);
}

export async function trackProcess(ctx, type, docId) {
  const { rows } = await ctx.query(`SELECT id FROM approval_processes WHERE type = $1 AND doc_id = $2`, [type, String(docId)]);
  if (rows[0]) await ctx.track('approval_processes', rows[0].id);
}

const isDemoPerson = async (ctx, userId) => (await ctx.records('users', '_users')).includes(Number(userId));

/** Who can decide an open seat: the person, a holder of the role / group, or the seeding administrator. */
async function deciderOf(ctx, seat) {
  if (seat.delegated_to) return seat.delegated_to;
  if (seat.kind === 'user') return seat.ref_id;
  if (seat.kind === 'role') {
    const { rows } = await ctx.query(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id WHERE ur.role_id = $1 AND u.is_active IS NOT FALSE ORDER BY u.id LIMIT 1`, [seat.ref_id]);
    return rows[0]?.id || null;
  }
  if (seat.kind === 'group') {
    const { rows } = await ctx.query(`SELECT u.id FROM users u JOIN user_group_members m ON m.user_id = u.id WHERE m.group_id = $1 AND u.is_active IS NOT FALSE ORDER BY u.id LIMIT 1`, [seat.ref_id]).catch(() => ({ rows: [] }));
    return rows[0]?.id || null;
  }
  return ctx.userId;
}

/**
 * Decides the current stage(s) of a document: `stages` stages are approved
 * (Infinity = to the end), then `last` ('reject' | 'return' with a comment)
 * may close it. Stops quietly when nobody can decide a seat.
 */
export async function decideDemo(ctx, type, docId, { stages = Infinity, last = null, comment = null } = {}) {
  let done = 0;
  for (let guard = 0; guard < 20; guard += 1) {
    const { rows } = await ctx.query(`SELECT id, status, round, current_stage FROM approval_processes WHERE type = $1 AND doc_id = $2`, [type, String(docId)]);
    const process = rows[0];
    if (!process || process.status !== 'pending') return;
    const action = done >= stages ? last : 'approve';
    if (!action) return;
    const { rows: seats } = await ctx.query(`SELECT * FROM approval_seats WHERE process_id = $1 AND round = $2 AND stage_index = $3 AND decision IS NULL ORDER BY id`, [process.id, process.round, process.current_stage]);
    if (!seats.length) return;
    const userId = await deciderOf(ctx, seats[0]);
    // Never in the name of a real colleague: only demo people and the administrator who seeds.
    if (!userId || (userId !== ctx.userId && !(await isDemoPerson(ctx, userId)))) return;
    const req = userId === ctx.userId ? ctx.request : await requestAs(userId);
    if (!req) return;
    try {
      await decide(req, process.id, { action, comment: action === 'approve' ? comment : comment || ctx.t({ ru: 'Демо: нужно уточнить', en: 'Demo: needs a correction', ky: 'Демо: тактоо керек', tr: 'Demo: düzeltme gerekiyor', zh: '演示：需要补充说明' }) });
    } catch (err) {
      if (['NOT_APPROVER', 'ALREADY_DECIDED'].includes(err.code)) return;
      throw err;
    }
    if (action !== 'approve') return;
    const { rows: after } = await ctx.query(`SELECT current_stage, status FROM approval_processes WHERE id = $1`, [process.id]);
    if (after[0]?.current_stage !== process.current_stage || after[0]?.status !== 'pending') done += 1;
  }
}

/** Approval processes of removed documents. */
export async function dropProcesses(ctx, type, docIds) {
  if (!docIds.length) return;
  await ctx.query(`DELETE FROM approval_processes WHERE type = $1 AND doc_id = ANY($2::text[])`, [type, docIds.map(String)]);
}
