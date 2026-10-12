import { mkdir, unlink } from 'fs/promises';
import { randomBytes } from 'crypto';
import { extname, resolve } from 'path';
import multer from 'multer';
import { query, withTransaction } from '../../config/database.js';
import { uploadRoot } from '../../config/paths.js';
import { notify } from '../../services/notifications.js';
import { clean, httpError, LEVEL, requireLevel } from '../shared/acl.js';
import { originalName } from '../kb/files.js';
import { taskEvent } from './chat.js';
import { taskMessage } from './messages.js';
import { createTask, editableTask, getTask, insertReminder, loadTaskRow, taskLevel, taskRef, taskWebhook, touch, updateTask, viewableTask } from './service.js';
import { FILE_CSP } from '../shared/storage.js';

/*
 * The optional blocks of a task: checklists, files, results, related tasks,
 * Gantt links, reminders, time tracking, favourites, rating, delegation,
 * copies. Each change also lands in the task's conversation.
 */

const intOr = (value, fallback = null) => (Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback);

// ── Checklists ──────────────────────────────────────────────────────────────

async function checklistOf(listId) {
  const { rows } = await query(`SELECT * FROM task_checklists WHERE id = $1`, [intOr(listId, 0)]);
  if (!rows[0]) throw httpError(404, 'Checklist not found', 'NOT_FOUND');
  return rows[0];
}

async function itemOf(itemId) {
  const { rows } = await query(`SELECT * FROM task_checklist WHERE id = $1`, [intOr(itemId, 0)]);
  if (!rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
  return rows[0];
}

export async function addChecklist(ctx, taskRefOrId, input = {}) {
  const row = await editableTask(ctx, taskRefOrId);
  const title = clean(input.title, 200) || 'Checklist';
  const { rows } = await query(
    `INSERT INTO task_checklists (task_id, title, sort) VALUES ($1, $2, COALESCE((SELECT MAX(sort) + 1 FROM task_checklists WHERE task_id = $1), 0)) RETURNING id`,
    [row.id, title]
  );
  for (const [index, text] of (Array.isArray(input.items) ? input.items : []).slice(0, 200).entries()) {
    const value = clean(typeof text === 'string' ? text : text?.text, 1000);
    if (value) await query(`INSERT INTO task_checklist (task_id, checklist_id, text, sort) VALUES ($1, $2, $3, $4)`, [row.id, rows[0].id, value, index]);
  }
  await touch(row.id);
  return { id: rows[0].id };
}

export async function updateChecklist(ctx, listId, input = {}) {
  const list = await checklistOf(listId);
  await editableTask(ctx, list.task_id);
  if (input.title !== undefined) await query(`UPDATE task_checklists SET title = $2 WHERE id = $1`, [list.id, clean(input.title, 200) || list.title]);
  await touch(list.task_id);
}

export async function deleteChecklist(ctx, listId) {
  const list = await checklistOf(listId);
  await editableTask(ctx, list.task_id);
  await query(`DELETE FROM task_checklists WHERE id = $1`, [list.id]);
  await touch(list.task_id);
}

export async function addChecklistItem(ctx, taskRefOrId, input = {}) {
  const row = await editableTask(ctx, taskRefOrId);
  const payload = typeof input === 'string' ? { text: input } : input;
  const text = clean(payload.text, 1000);
  if (!text) throw httpError(400, 'Text is required', 'TEXT_REQUIRED');
  let listId = intOr(payload.checklistId);
  if (listId) {
    const list = await checklistOf(listId);
    if (list.task_id !== row.id) throw httpError(400, 'Checklist of another task', 'NOT_FOUND');
  } else {
    const first = await query(`SELECT id FROM task_checklists WHERE task_id = $1 ORDER BY sort, id LIMIT 1`, [row.id]);
    listId = first.rows[0]?.id || (await addChecklist(ctx, row.id, { title: 'Checklist' })).id;
  }
  const { rows } = await query(
    `INSERT INTO task_checklist (task_id, checklist_id, text, level, important, sort)
     VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(sort) + 1 FROM task_checklist WHERE checklist_id = $2), 0)) RETURNING id, text, done`,
    [row.id, listId, text, Math.min(4, Math.max(0, Number(payload.level) || 0)), Boolean(payload.important)]
  );
  await touch(row.id);
  return rows[0];
}

export async function updateChecklistItem(ctx, itemId, patch = {}) {
  const item = await itemOf(itemId);
  const row = await editableTask(ctx, item.task_id);
  const sets = [];
  const values = [];
  const set = (sql, value) => {
    values.push(value);
    sets.push(`${sql} = $${values.length}`);
  };
  if (patch.text !== undefined) {
    const text = clean(patch.text, 1000);
    if (!text) throw httpError(400, 'Text is required', 'TEXT_REQUIRED');
    set('text', text);
  }
  if (typeof patch.done === 'boolean') {
    set('done', patch.done);
    set('done_by', patch.done ? ctx.userId : null);
  }
  if (patch.level !== undefined) set('level', Math.min(4, Math.max(0, Number(patch.level) || 0)));
  if (typeof patch.important === 'boolean') set('important', patch.important);
  if (patch.memberId !== undefined) {
    set('member_id', intOr(patch.memberId));
    set('member_role', intOr(patch.memberId) ? (patch.memberRole === 'auditor' ? 'auditor' : 'coassignee') : null);
  }
  if (Array.isArray(patch.fileIds)) set('file_ids', patch.fileIds.map(Number).filter(Number.isInteger).slice(0, 20));
  if (patch.checklistId !== undefined) {
    const target = await checklistOf(patch.checklistId);
    if (target.task_id !== item.task_id) throw httpError(400, 'Checklist of another task', 'NOT_FOUND');
    set('checklist_id', target.id);
    set('sort', (await query(`SELECT COALESCE(MAX(sort) + 1, 0) AS n FROM task_checklist WHERE checklist_id = $1`, [target.id])).rows[0].n);
  }
  if (sets.length) {
    values.push(item.id);
    await query(`UPDATE task_checklist SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
  }
  // A person given a checklist item joins the task in that role.
  if (patch.memberId !== undefined && intOr(patch.memberId)) {
    const role = patch.memberRole === 'auditor' ? 'auditor' : 'coassignee';
    const userId = intOr(patch.memberId);
    if (![row.assignee_id, row.originator_id].includes(userId)) await query(`INSERT INTO task_members VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [row.id, userId, role]);
  }
  if (typeof patch.done === 'boolean' && patch.done) {
    const left = await query(`SELECT COUNT(*) FILTER (WHERE NOT done)::int AS open, COUNT(*)::int AS total FROM task_checklist WHERE checklist_id = $1`, [item.checklist_id]);
    if (left.rows[0].open === 0 && left.rows[0].total > 1) {
      const list = await checklistOf(item.checklist_id);
      await taskEvent(row.id, ctx.userId, { event: 'task.checklist_done', title: list.title });
    }
  }
  await touch(item.task_id);
  const { rows } = await query(`SELECT id, text, done FROM task_checklist WHERE id = $1`, [item.id]);
  return rows[0];
}

export async function deleteChecklistItem(ctx, itemId) {
  const item = await itemOf(itemId);
  await editableTask(ctx, item.task_id);
  await query(`DELETE FROM task_checklist WHERE id = $1`, [item.id]);
  await touch(item.task_id);
}

/** New order of the items of one checklist (`listId`) or of a whole task (older clients: `taskRef`). */
export async function reorderChecklist(ctx, { listId, taskRef: ref }, ids) {
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger);
  const taskId = listId ? (await checklistOf(listId)).task_id : (await loadTaskRow(ref)).id;
  await editableTask(ctx, taskId);
  await withTransaction(async (client) => {
    for (const [index, itemId] of list.entries()) {
      await client.query(`UPDATE task_checklist SET sort = $3${listId ? ', checklist_id = $4' : ''} WHERE id = $1 AND task_id = $2`, listId ? [itemId, taskId, index, Number(listId)] : [itemId, taskId, index]);
    }
  });
}

/** Several items at once: done / not done / delete / move to another checklist. */
export async function bulkChecklist(ctx, input = {}) {
  const ids = (Array.isArray(input.ids) ? input.ids : []).map(Number).filter(Number.isInteger).slice(0, 500);
  if (!ids.length) return;
  const { rows } = await query(`SELECT DISTINCT task_id FROM task_checklist WHERE id = ANY($1)`, [ids]);
  if (rows.length !== 1) throw httpError(400, 'Items of one task only', 'BULK');
  const taskId = rows[0].task_id;
  await editableTask(ctx, taskId);
  if (input.action === 'done' || input.action === 'undone') await query(`UPDATE task_checklist SET done = $2, done_by = $3 WHERE id = ANY($1)`, [ids, input.action === 'done', input.action === 'done' ? ctx.userId : null]);
  else if (input.action === 'delete') await query(`DELETE FROM task_checklist WHERE id = ANY($1)`, [ids]);
  else if (input.action === 'move') {
    const target = await checklistOf(input.checklistId);
    if (target.task_id !== taskId) throw httpError(400, 'Checklist of another task', 'NOT_FOUND');
    await query(`UPDATE task_checklist SET checklist_id = $2 WHERE id = ANY($1)`, [ids, target.id]);
  }
  await touch(taskId);
}

// ── Files ───────────────────────────────────────────────────────────────────

const ROOT = resolve(uploadRoot, 'tasks');
const extOf = (name) => extname(String(name || '')).slice(1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);

export function taskUploader(maxMb = 200) {
  return multer({
    storage: multer.diskStorage({
      destination: async (_req, file, cb) => {
        try {
          const now = new Date();
          const dir = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
          await mkdir(resolve(ROOT, dir), { recursive: true });
          const ext = extOf(originalName(file));
          file.storageKey = `${dir}/${randomBytes(16).toString('hex')}${ext ? `.${ext}` : ''}`;
          cb(null, resolve(ROOT, dir));
        } catch (err) {
          cb(err);
        }
      },
      filename: (_req, file, cb) => cb(null, file.storageKey.split('/').pop()),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 20 },
  }).array('files', 20);
}

/** Stores uploads; without a task (the form is still open) they wait for it. */
export async function storeTaskFiles(ctx, taskRefOrId, files) {
  const row = taskRefOrId ? await editableTask(ctx, taskRefOrId) : null;
  const out = [];
  for (const file of files) {
    const { rows } = await query(
      `INSERT INTO task_files (task_id, kind, name, mime, size, storage_key, uploaded_by) VALUES ($1, 'upload', $2, $3, $4, $5, $6) RETURNING id, name, size, mime`,
      [row?.id || null, originalName(file).slice(0, 255), String(file.mimetype || '').slice(0, 120), file.size, file.storageKey, ctx.userId]
    );
    out.push({ ...rows[0], size: Number(rows[0].size), kind: 'upload', url: `/api/app/tasks/files/${rows[0].id}` });
  }
  if (row && out.length) await taskEvent(row.id, ctx.userId, { event: 'task.files', names: out.map((file) => file.name) });
  return out;
}

/** Attaches a file of the Files module (node) or of a file server (share + path) by reference. */
export async function linkTaskFile(ctx, taskRefOrId, input = {}) {
  const row = taskRefOrId ? await editableTask(ctx, taskRefOrId) : null;
  let record;
  if (input.nodeId) {
    const { nodeAccess } = await import('../files/access.js');
    const nodeId = intOr(input.nodeId, 0);
    const access = await nodeAccess({ ...ctx, isAdmin: false }, nodeId);
    if (!access || access.level < LEVEL.view) throw httpError(404, 'File not found', 'NOT_FOUND');
    const { rows } = await query(`SELECT name, size, mime FROM fs_nodes WHERE id = $1 AND kind = 'file'`, [nodeId]);
    if (!rows[0]) throw httpError(404, 'File not found', 'NOT_FOUND');
    record = { kind: 'node', name: rows[0].name, size: rows[0].size, mime: rows[0].mime, nodeId };
  } else if (input.shareId && input.path) {
    record = { kind: 'drive', name: clean(String(input.path).split('/').pop(), 255), size: Number(input.size) || 0, mime: null, shareId: intOr(input.shareId, 0), path: clean(input.path, 2000) };
  } else {
    throw httpError(400, 'Nothing to attach', 'INVALID');
  }
  const { rows } = await query(
    `INSERT INTO task_files (task_id, kind, name, mime, size, node_id, share_id, drive_path, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [row?.id || null, record.kind, record.name, record.mime, record.size, record.nodeId || null, record.shareId || null, record.path || null, ctx.userId]
  );
  if (row) await taskEvent(row.id, ctx.userId, { event: 'task.files', names: [record.name] });
  return { id: rows[0].id, ...record };
}

async function fileOf(fileId) {
  const { rows } = await query(`SELECT * FROM task_files WHERE id = $1`, [intOr(fileId, 0)]);
  if (!rows[0]) throw httpError(404, 'File not found', 'NOT_FOUND');
  return rows[0];
}

export async function removeTaskFile(ctx, fileId) {
  const file = await fileOf(fileId);
  if (file.task_id) await editableTask(ctx, file.task_id);
  else if (file.uploaded_by !== ctx.userId) throw httpError(404, 'File not found', 'NOT_FOUND');
  await query(`DELETE FROM task_files WHERE id = $1`, [file.id]);
  if (file.storage_key) {
    const others = await query(`SELECT 1 FROM task_files WHERE storage_key = $1 LIMIT 1`, [file.storage_key]);
    if (!others.rows.length) await unlink(resolve(ROOT, file.storage_key)).catch(() => {});
  }
}

export async function sendTaskFile(ctx, fileId, res, download) {
  const file = await fileOf(fileId);
  if (file.task_id) await viewableTask(ctx, file.task_id);
  else if (file.uploaded_by !== ctx.userId) throw httpError(404, 'File not found', 'NOT_FOUND');
  if (file.kind !== 'upload') throw httpError(400, 'Linked file', 'LINKED');
  const inline = !download && /^(image\/(png|jpe?g|gif|webp|bmp)|application\/pdf)$/.test(file.mime || '');
  res.setHeader('Content-Type', inline ? file.mime : 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', FILE_CSP);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  res.sendFile(resolve(ROOT, file.storage_key));
}

export async function purgeDraftFiles() {
  const { rows } = await query(`DELETE FROM task_files WHERE task_id IS NULL AND created_at < NOW() - INTERVAL '1 day' RETURNING storage_key`);
  for (const row of rows) if (row.storage_key) await unlink(resolve(ROOT, row.storage_key)).catch(() => {});
}

// ── Results ─────────────────────────────────────────────────────────────────

export async function addResult(ctx, taskRefOrId, input = {}) {
  const row = await editableTask(ctx, taskRefOrId);
  let body = clean(input.body, 20000);
  let fileIds = [];
  let messageId = null;
  if (input.messageId) {
    // "Add to result" from the task chat.
    const { rows } = await query(
      `SELECT m.id, m.body, m.room_id FROM chat_messages m JOIN chat_rooms r ON r.id = m.room_id
       WHERE m.id = $1 AND r.entity_type = 'task' AND r.entity_id = $2 AND m.deleted_at IS NULL`,
      [Number(input.messageId), row.id]
    );
    if (!rows[0]) throw httpError(404, 'Message not found', 'NOT_FOUND');
    messageId = Number(rows[0].id);
    body = body || rows[0].body;
    fileIds = (await query(`SELECT id FROM chat_files WHERE message_id = $1`, [messageId])).rows.map((file) => file.id);
  }
  if (!body && !fileIds.length) throw httpError(400, 'Describe the result', 'TEXT_REQUIRED');
  const { rows } = await query(`INSERT INTO task_results (task_id, author_id, body, chat_file_ids, message_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [
    row.id,
    ctx.userId,
    body,
    fileIds,
    messageId,
  ]);
  await touch(row.id);
  await taskEvent(row.id, ctx.userId, { event: 'task.result', text: body.slice(0, 200) });
  await taskWebhook('task.result', row.id, { result: { text: body } }, ctx.userId);
  const originator = row.originator_id || row.created_by;
  if (originator && originator !== ctx.userId) {
    const ref = taskRef(row.project_key, row.number);
    await notify({
      userIds: [originator],
      kind: 'tasks.result',
      module: 'tasks',
      link: `/app/tasks/${ref}`,
      actorId: ctx.userId,
      render: (locale) => (locale === 'ru' ? { title: `Результат по задаче ${ref}`, body: `${row.title}\n${body.slice(0, 200)}` } : { title: `Result added to ${ref}`, body: `${row.title}\n${body.slice(0, 200)}` }),
    });
  }
  return { id: rows[0].id };
}

export async function deleteResult(ctx, resultId) {
  const { rows } = await query(`SELECT * FROM task_results WHERE id = $1`, [intOr(resultId, 0)]);
  if (!rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
  const row = await editableTask(ctx, rows[0].task_id);
  if (rows[0].author_id !== ctx.userId && (row.originator_id || row.created_by) !== ctx.userId && !ctx.isAdmin) throw httpError(403, 'Only the author can remove a result', 'FORBIDDEN');
  await query(`DELETE FROM task_results WHERE id = $1`, [rows[0].id]);
}

// ── Related tasks and Gantt links ───────────────────────────────────────────

export async function addLink(ctx, taskRefOrId, otherRef) {
  const row = await editableTask(ctx, taskRefOrId);
  const other = await viewableTask(ctx, otherRef);
  if (other.id === row.id) throw httpError(400, 'A task cannot be linked to itself', 'SELF');
  await query(`INSERT INTO task_links (task_id, other_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [row.id, other.id]);
  await taskEvent(row.id, ctx.userId, { event: 'task.linked', ref: taskRef(other.project_key, other.number), title: other.title });
}

export async function removeLink(ctx, taskRefOrId, otherId) {
  const row = await editableTask(ctx, taskRefOrId);
  await query(`DELETE FROM task_links WHERE (task_id = $1 AND other_id = $2) OR (task_id = $2 AND other_id = $1)`, [row.id, intOr(otherId, 0)]);
}

export async function addDep(ctx, taskRefOrId, input = {}) {
  const row = await editableTask(ctx, taskRefOrId);
  const other = await viewableTask(ctx, input.ref || input.taskId);
  if (other.id === row.id) throw httpError(400, 'A task cannot depend on itself', 'SELF');
  const kind = ['FS', 'SS', 'SF', 'FF'].includes(input.kind) ? input.kind : 'FS';
  await query(`INSERT INTO task_deps (task_id, depends_on, kind) VALUES ($1, $2, $3) ON CONFLICT (task_id, depends_on) DO UPDATE SET kind = EXCLUDED.kind`, [row.id, other.id, kind]);
  await taskEvent(row.id, ctx.userId, { event: 'task.dep', ref: taskRef(other.project_key, other.number), title: other.title, kind });
}

export async function removeDep(ctx, depId) {
  const { rows } = await query(`SELECT * FROM task_deps WHERE id = $1`, [intOr(depId, 0)]);
  if (!rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
  await editableTask(ctx, rows[0].task_id);
  await query(`DELETE FROM task_deps WHERE id = $1`, [rows[0].id]);
}

// ── Reminders ───────────────────────────────────────────────────────────────

/** Does a reminder go to anyone but its author? (Same defaults as insertReminder: no targets = 'me'.) */
export function remindsOthers(targets) {
  return (Array.isArray(targets) ? targets : []).some((target) => ['assignee', 'originator', 'coassignees', 'auditors'].includes(target));
}

export async function addReminder(ctx, taskRefOrId, input = {}) {
  const row = await viewableTask(ctx, taskRefOrId);
  // Reminding other people of the task (possibly through messengers) takes working on it;
  // anyone who sees the task may remind themselves. Edit covers originator and managers.
  if (remindsOthers(input.targets) && (await taskLevel(ctx, row)) < LEVEL.edit) {
    throw httpError(403, 'Only those who work on the task can remind other people', 'FORBIDDEN');
  }
  const id = await withTransaction((client) => insertReminder(client, row.id, ctx.userId, input));
  if (!id) throw httpError(400, 'Choose when to remind', 'REMINDER_TIME');
  return { id };
}

export async function deleteReminder(ctx, reminderId) {
  const { rows } = await query(`SELECT * FROM task_reminders WHERE id = $1`, [intOr(reminderId, 0)]);
  if (!rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
  const row = await viewableTask(ctx, rows[0].task_id);
  if (rows[0].created_by !== ctx.userId && (await taskLevel(ctx, row)) < LEVEL.manage) throw httpError(403, 'Only its author can remove a reminder', 'FORBIDDEN');
  await query(`DELETE FROM task_reminders WHERE id = $1`, [rows[0].id]);
}

// ── Time tracking ───────────────────────────────────────────────────────────

export async function timer(ctx, taskRefOrId, action) {
  const row = await editableTask(ctx, taskRefOrId);
  if (action === 'start') {
    // One running timer per person: starting here stops it elsewhere.
    await query(`UPDATE task_time SET stopped_at = NOW() WHERE user_id = $1 AND stopped_at IS NULL`, [ctx.userId]);
    await query(`INSERT INTO task_time (task_id, user_id) VALUES ($1, $2)`, [row.id, ctx.userId]);
    if (!row.time_tracking) await query(`UPDATE tasks SET time_tracking = TRUE WHERE id = $1`, [row.id]);
  } else {
    await query(`UPDATE task_time SET stopped_at = NOW() WHERE task_id = $1 AND user_id = $2 AND stopped_at IS NULL`, [row.id, ctx.userId]);
  }
  const { rows } = await query(
    `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(stopped_at, NOW()) - started_at))), 0)::bigint AS total,
            MAX(started_at) FILTER (WHERE stopped_at IS NULL AND user_id = $2) AS running
     FROM task_time WHERE task_id = $1`,
    [row.id, ctx.userId]
  );
  return { total: Number(rows[0].total), running: rows[0].running };
}

// ── Favourites, rating, delegation, start, copies ───────────────────────────

export async function setFavorite(ctx, taskRefOrId, on) {
  const row = await viewableTask(ctx, taskRefOrId);
  if (on) await query(`INSERT INTO task_favorites VALUES ($1, $2) ON CONFLICT DO NOTHING`, [ctx.userId, row.id]);
  else await query(`DELETE FROM task_favorites WHERE user_id = $1 AND task_id = $2`, [ctx.userId, row.id]);
  return Boolean(on);
}

export async function rateTask(ctx, taskRefOrId, input = {}) {
  const row = await viewableTask(ctx, taskRefOrId);
  if ((row.originator_id || row.created_by) !== ctx.userId && !ctx.isAdmin) throw httpError(403, 'Only the originator rates a task', 'FORBIDDEN');
  if (!row.completed_at) throw httpError(400, 'Rate a finished task', 'NOT_DONE');
  const rating = ['good', 'bad'].includes(input.rating) ? input.rating : null;
  await query(`UPDATE tasks SET rating = $2, rating_comment = $3 WHERE id = $1`, [row.id, rating, clean(input.comment, 1000) || null]);
  await taskEvent(row.id, ctx.userId, { event: 'task.rated', rating, comment: clean(input.comment, 300) || null });
  return { rating };
}

export async function delegateTask(ctx, taskRefOrId, userId) {
  const row = await editableTask(ctx, taskRefOrId);
  const previous = row.assignee_id;
  const task = await updateTask(ctx, row.id, { assigneeId: userId });
  // The one who handed it over keeps an eye on it.
  if (previous && previous !== Number(userId)) {
    await query(`INSERT INTO task_members VALUES ($1, $2, 'auditor') ON CONFLICT DO NOTHING`, [row.id, previous]);
  }
  return task;
}

export async function startTask(ctx, taskRefOrId) {
  const row = await editableTask(ctx, taskRefOrId);
  const { rows } = await query(`SELECT id FROM task_statuses WHERE project_id = $1 AND category = 'active' ORDER BY sort, id LIMIT 1`, [row.project_id]);
  if (rows[0]) return updateTask(ctx, row.id, { statusId: rows[0].id, deferred: false });
  await query(`UPDATE tasks SET started_at = NOW() WHERE id = $1`, [row.id]);
  return updateTask(ctx, row.id, { deferred: false });
}

/** The fields the form uses, from an existing task (copy, "save as template"). */
export async function formPayload(ctx, taskRefOrId) {
  const task = await getTask(ctx, taskRefOrId, { countView: false });
  return {
    title: task.title,
    description: task.description,
    descriptionFormat: task.descriptionFormat,
    important: task.important,
    priority: task.priority,
    projectId: task.project.personal ? null : task.project.id,
    assigneeId: task.assignee?.id || null,
    originatorId: task.originator?.id || null,
    coassigneeIds: task.coassignees.map((user) => user.id),
    auditorIds: task.auditors.map((user) => user.id),
    labels: task.labels,
    resultRequired: task.resultRequired,
    flowId: task.flowId,
    allowChangeDeadline: task.allowChangeDeadline,
    skipWeekends: task.skipWeekends,
    deadlineFromSubtasks: task.deadlineFromSubtasks,
    timeTracking: task.timeTracking,
    timeEstimate: task.timeEstimate,
    custom: task.custom,
    checklists: task.checklists.map((list) => ({ title: list.title, items: list.items.map((item) => ({ text: item.text, level: item.level, important: item.important })) })),
  };
}

export async function copyTask(ctx, taskRefOrId, overrides = {}) {
  const source = await loadTaskRow(taskRefOrId);
  const payload = await formPayload(ctx, source.id);
  // The copy stays under the same parent only when the person may edit that parent.
  let parentId = null;
  if (source.parent_id) {
    const parent = await loadTaskRow(source.parent_id).catch(() => null);
    if (parent && (await taskLevel(ctx, parent)) >= LEVEL.edit) parentId = parent.id;
  }
  const task = await createTask(ctx, { ...payload, dueAt: source.due_at, dueTime: source.due_time, parentId, ...overrides });
  // Uploaded files are shared between the copies (same stored blob).
  await query(
    `INSERT INTO task_files (task_id, kind, name, mime, size, storage_key, node_id, share_id, drive_path, uploaded_by)
     SELECT $1, kind, name, mime, size, storage_key, node_id, share_id, drive_path, $3 FROM task_files WHERE task_id = $2`,
    [task.id, source.id, ctx.userId]
  );
  return task;
}

export async function requireTaskView(ctx, refOrId) {
  const row = await loadTaskRow(refOrId);
  requireLevel(await taskLevel(ctx, row), LEVEL.view);
  return row;
}

/** Remind the people of a task: by role names into user ids. */
export async function resolveTargets(row, targets, creatorId) {
  const ids = new Set();
  const members = await query(`SELECT user_id, role FROM task_members WHERE task_id = $1`, [row.id]);
  for (const target of targets) {
    if (target === 'assignee' && row.assignee_id) ids.add(row.assignee_id);
    if (target === 'originator') ids.add(row.originator_id || row.created_by);
    if (target === 'coassignees') members.rows.filter((m) => m.role === 'coassignee').forEach((m) => ids.add(m.user_id));
    if (target === 'auditors') members.rows.filter((m) => m.role === 'auditor').forEach((m) => ids.add(m.user_id));
    if (target === 'me' && creatorId) ids.add(creatorId);
  }
  return [...ids].filter(Boolean);
}

export const reminderMessage = taskMessage;
