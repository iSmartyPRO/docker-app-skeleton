import { query } from '../../config/database.js';
import { decide } from '../../api/scopes.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { contextFromRequest, httpError, LEVEL } from '../shared/acl.js';
import { modules } from '../../platform/registry.js';
import { loadTaskRow, participantsOf, taskLevel, taskRef, taskWebhook } from './service.js';

/*
 * Every task has a conversation in the chat module: discussion and the log of
 * changes in one feed. Access is the task's own (taskLevel); the people who
 * follow the task get unread counts and pushes. Comments and history written
 * before the chat existed are brought in when the conversation is first opened.
 */

const linkOf = (row) => `/app/tasks/${taskRef(row.project_key, row.number)}`;
const titleOf = (row) => `${taskRef(row.project_key, row.number)} · ${row.title}`;

/**
 * The task chat as the Tasks module allows it: nothing while the module is off
 * or to an API token without the tasks scope; writing needs tasks:write.
 * Session requests (no token) only depend on the module being on.
 */
async function moduleAccess(req) {
  if (!parseSettings(await getSettings()).modules.tasks?.enabled) return null;
  const policy = req?.apiToken?.policy;
  if (!policy) return { write: true };
  if (!decide(policy, 'GET', '/app/tasks/tasks').ok) return null;
  return { write: decide(policy, 'POST', '/app/tasks/tasks').ok };
}

export function registerTaskChat() {
  // Only while the Chat module is installed (it is an optional link).
  modules.whenLoaded('chat', (chat) => chat.registerChatEntity('task', {
    async access(req, id) {
      const allowed = await moduleAccess(req);
      // Thrown, not null: the chat treats an error as "not now" and keeps the
      // person's membership, while null would drop them from the conversation.
      if (!allowed) throw httpError(404, 'Not found', 'NOT_FOUND');
      const row = await loadTaskRow(id).catch(() => null);
      if (!row) return null;
      const level = await taskLevel(contextFromRequest(req, 'tasks.admin'), row);
      if (level < LEVEL.view) return { view: false };
      return {
        view: true,
        write: allowed.write,
        title: titleOf(row),
        subtitle: row.project_personal ? null : row.project_name,
        link: linkOf(row),
        color: row.important ? '#EF4444' : row.project_color || '#10B981',
      };
    },
    async describe(id) {
      const row = await loadTaskRow(id).catch(() => null);
      return row ? { title: titleOf(row), link: linkOf(row) } : null;
    },
    async participants(id) {
      const row = await loadTaskRow(id).catch(() => null);
      return row ? participantsOf(row) : [];
    },
    // A message in the task chat is a comment for webhooks.
    async onMessage(id, message, authorId) {
      await taskWebhook('task.comment', Number(id), { comment: { id: message.id, body: message.body, files: message.files || [], createdAt: message.createdAt } }, authorId);
    },
    async seed(roomId, id) {
      // Only what happened before this moment: the change that opens the room posts its own event.
      const [comments, activity] = await Promise.all([
        query(`SELECT author_id, body, created_at, edited_at FROM task_comments WHERE task_id = $1 AND created_at < NOW() - INTERVAL '10 seconds'`, [id]),
        query(`SELECT actor_id, kind, data, created_at FROM task_activity WHERE task_id = $1 AND created_at < NOW() - INTERVAL '10 seconds'`, [id]),
      ]);
      const entries = [
        ...comments.rows.map((row) => ({ authorId: row.author_id, kind: 'text', body: row.body, createdAt: row.created_at, editedAt: row.edited_at })),
        ...activity.rows.map((row) => ({
          authorId: row.actor_id,
          kind: 'system',
          data: row.kind === 'created' ? { event: 'task.created' } : { event: 'task.change', ...row.data },
          createdAt: row.created_at,
        })),
      ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      await chat.importHistory(roomId, entries);
    },
  }));
}

/** An event in the task's conversation; never fails the change that caused it. */
export async function taskEvent(taskId, actorId, data, notifyText) {
  try {
    const chat = modules.loaded('chat')?.api;
    if (chat) await chat.postSystem('task', taskId, { actorId, data, notifyText });
  } catch (err) {
    console.warn(`[tasks] chat event for task ${taskId} failed:`, err.message);
  }
}
