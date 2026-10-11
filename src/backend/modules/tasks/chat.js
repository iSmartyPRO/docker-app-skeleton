import { query } from '../../config/database.js';
import { contextFromRequest, LEVEL } from '../shared/acl.js';
import { registerChatEntity } from '../chat/entities.js';
import { importHistory, postSystem } from '../chat/service.js';
import { loadTaskRow, participantsOf, taskLevel, taskRef, taskWebhook } from './service.js';

/*
 * Every task has a conversation in the chat module: discussion and the log of
 * changes in one feed. Access is the task's own (taskLevel); the people who
 * follow the task get unread counts and pushes. Comments and history written
 * before the chat existed are brought in when the conversation is first opened.
 */

const linkOf = (row) => `/app/tasks/${taskRef(row.project_key, row.number)}`;
const titleOf = (row) => `${taskRef(row.project_key, row.number)} · ${row.title}`;

export function registerTaskChat() {
  registerChatEntity('task', {
    async access(req, id) {
      const row = await loadTaskRow(id).catch(() => null);
      if (!row) return null;
      const level = await taskLevel(contextFromRequest(req, 'tasks.admin'), row);
      if (level < LEVEL.view) return { view: false };
      return {
        view: true,
        write: true,
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
      await importHistory(roomId, entries);
    },
  });
}

/** An event in the task's conversation; never fails the change that caused it. */
export async function taskEvent(taskId, actorId, data, notifyText) {
  try {
    await postSystem('task', taskId, { actorId, data, notifyText });
  } catch (err) {
    console.warn(`[tasks] chat event for task ${taskId} failed:`, err.message);
  }
}
