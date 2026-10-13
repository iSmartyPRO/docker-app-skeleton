import { registerSystemEvents } from '../chat/system';

/*
 * How deal events read in a deal's conversation («Обсудить с коллегами»):
 * stage moves, wins and losses, new owners and activities.
 */

const nameOf = (value) => (value && typeof value === 'object' ? value.name : value) || '—';

registerSystemEvents('deal.', (data, { t, actor }) => {
  const k = (key, params) => t(`crm.chat.${key}`, { actor, ...params });
  switch (data.event) {
    case 'deal.created':
      return { icon: '✦', text: k('created') };
    case 'deal.stage': {
      const kind = data.to && typeof data.to === 'object' ? data.to.kind : null;
      if (kind === 'won') return { icon: '🏆', text: k('won', { stage: nameOf(data.to) }), tone: 'ok' };
      if (kind === 'lost') return { icon: '✕', text: data.lostReason ? k('lostReason', { reason: data.lostReason }) : k('lost'), tone: 'danger' };
      if (data.pipeline) return { icon: '⇄', text: k('pipeline', { pipeline: nameOf(data.pipeline), stage: nameOf(data.to) }) };
      return { icon: '→', text: k('stage', { from: nameOf(data.from), to: nameOf(data.to) }) };
    }
    case 'deal.won':
      return { icon: '🏆', text: k('won', { stage: nameOf(data.to) }), tone: 'ok' };
    case 'deal.lost':
      return { icon: '✕', text: data.lostReason ? k('lostReason', { reason: data.lostReason }) : k('lost'), tone: 'danger' };
    case 'deal.owner':
      return { icon: '👤', text: k('owner', { to: nameOf(data.to) }) };
    case 'deal.activity':
      return { icon: '📌', text: k('activity', { title: data.title || '' }) };
    case 'deal.activity_due':
      return { icon: '⏰', text: k('activityDue', { title: data.title || '' }), tone: 'warn' };
    default:
      return { icon: '•', text: k('changed') };
  }
});
