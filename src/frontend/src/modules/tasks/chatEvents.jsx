import { registerSystemEvents } from '../chat/system';
import { formatDateTime } from '../../lib/format';

/*
 * How task events read in the task's conversation. Deadline reminders carry
 * actions: the open task card handles them (complete, change the deadline);
 * elsewhere they open the task.
 */

function when(value, locale) {
  if (!value) return '—';
  return formatDateTime(value, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Asks an open task card to act; opens the task when no card is listening. */
export function taskAction(ref, action, navigate) {
  const event = new CustomEvent('task-action', { detail: { ref, action, handled: false } });
  window.dispatchEvent(event);
  if (!event.detail.handled && ref) navigate(`/app/tasks/${ref}`);
}

const names = (list) => (list || []).map((user) => user.name).join(', ');

registerSystemEvents('task.', (data, { t, locale, actor, navigate }) => {
  const k = (key, params) => t(`tasks.v2.ev.${key}`, { actor, ...params });
  const deadlineActions = data.ref
    ? [
        { key: 'done', label: t('tasks.v2.ev.completeIt'), onClick: () => taskAction(data.ref, 'complete', navigate) },
        { key: 'due', label: t('tasks.v2.ev.changeDeadline'), onClick: () => taskAction(data.ref, 'deadline', navigate) },
      ]
    : [];
  switch (data.event) {
    case 'task.created':
      return { icon: '✦', text: k('created') };
    case 'task.recurring':
      return { icon: '🔁', text: t('tasks.v2.ev.recurring', { template: data.template }) };
    case 'task.result':
      return { icon: '🏁', text: k('result'), tone: 'ok' };
    case 'task.rated':
      return { icon: data.rating === 'good' ? '👍' : data.rating === 'bad' ? '👎' : '☆', text: k(data.rating ? `rated_${data.rating}` : 'unrated') };
    case 'task.files':
      return { icon: '📎', text: k('files', { names: (data.names || []).join(', ') }) };
    case 'task.linked':
      return { icon: '🔗', text: k('linked', { ref: data.ref, title: data.title }) };
    case 'task.dep':
      return { icon: '📊', text: k('dep', { ref: data.ref, kind: t(`tasks.v2.gantt.${data.kind}`) }) };
    case 'task.checklist_done':
      return { icon: '☑', text: k('checklistDone', { title: data.title }), tone: 'ok' };
    case 'task.members': {
      const role = t(`tasks.v2.ev.roles.${data.role}`);
      const parts = [];
      if (data.added?.length) parts.push(k('membersAdded', { role, names: names(data.added) }));
      if (data.removed?.length) parts.push(k('membersRemoved', { role, names: names(data.removed) }));
      return { icon: '👥', text: parts.join('; ') };
    }
    case 'task.due_soon':
      return { icon: '⏰', text: t('tasks.v2.ev.dueSoon', { at: when(data.dueAt, locale) }), tone: 'warn', actions: deadlineActions };
    case 'task.overdue':
      return { icon: '🔥', text: t('tasks.v2.ev.overdue', { at: when(data.dueAt, locale) }), tone: 'danger', actions: deadlineActions };
    case 'task.reminder':
      return { icon: '⏰', text: t('tasks.v2.ev.reminder'), tone: 'warn' };
    case 'task.change': {
      switch (data.field) {
        case 'status':
          if (data.category === 'done') return { icon: '✓', text: k('completed'), tone: 'ok' };
          if (data.wasDone) return { icon: '↺', text: k('reopened') };
          return { icon: '●', text: k('status', { to: data.to }) };
        case 'due':
          return { icon: '📅', text: data.to ? k('due', { to: when(data.to, locale) }) : k('dueRemoved') };
        case 'assignee':
          return { icon: '👤', text: data.to ? k('assignee', { to: data.to }) : k('unassigned') };
        case 'originator':
          return { icon: '👤', text: k('originator', { to: data.to }) };
        case 'title':
          return { icon: '✎', text: k('title', { to: data.to }) };
        case 'description':
          return { icon: '✎', text: k('description') };
        case 'important':
          return { icon: '🔥', text: k(data.to ? 'importantOn' : 'importantOff') };
        case 'resultRequired':
          return { icon: '🏁', text: k(data.to ? 'resultOn' : 'resultOff') };
        case 'deferred':
          return { icon: '⏸', text: k(data.to ? 'deferred' : 'resumed') };
        case 'priority':
          return { icon: '⚑', text: k('priority', { to: t(`tasks.priority.${data.to}`) }) };
        case 'labels':
          return { icon: '#', text: k('labels', { to: (data.to || []).join(', ') || '—' }) };
        case 'project':
          return { icon: '🗂', text: data.to ? k('project', { to: data.to }) : k('noProject') };
        case 'parent':
          return { icon: '⤴', text: k(data.to ? 'parent' : 'noParent') };
        case 'flow':
          return { icon: '🌊', text: data.to ? k('flow', { to: data.to }) : k('noFlow') };
        case 'planStart':
        case 'planEnd':
          return { icon: '🗓', text: k('planning') };
        default:
          return { icon: '•', text: k('changed') };
      }
    }
    default:
      return null;
  }
});
