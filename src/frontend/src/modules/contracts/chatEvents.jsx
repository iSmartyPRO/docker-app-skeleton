import { contribute } from '../../platform/extensions';

// How these events read in conversations (the Chat module reads the «chat.systemEvents» point).
const registerSystemEvents = (prefix, render) => contribute('chat.systemEvents', { id: prefix, prefix, render });
import { fmtDate } from '../../lib/datetime';

/*
 * How contract events read in a contract's conversation («Обсуждение»):
 * status changes, prolongation, new versions and risks.
 */

registerSystemEvents('contract.', (data, { t, actor }) => {
  const k = (key, params) => t(`contracts.chat.${key}`, { actor, ...params });
  switch (data.event) {
    case 'contract.status': {
      const to = t(`contracts.status.${data.to}`);
      const tone = ['active', 'signed', 'approved', 'completed'].includes(data.to) ? 'ok' : ['rejected', 'terminated'].includes(data.to) ? 'danger' : data.to === 'expiring' ? 'warn' : undefined;
      return { icon: data.to === 'signed' ? '✍' : '→', text: actor ? k('status', { to }) : k('statusAuto', { to }), tone };
    }
    case 'contract.prolonged':
      return { icon: '↻', text: k('prolonged', { date: data.to ? fmtDate(data.to) : '' }), tone: 'ok' };
    case 'contract.version':
      return { icon: '⬆', text: k('version', { no: data.no, comment: data.comment ? ` — ${data.comment}` : '' }) };
    case 'contract.risk':
      return { icon: '!', text: k('risk', { no: data.no, importance: t(`contracts.risks.importance.${data.importance}`), text: data.text || '' }), tone: data.importance === 'high' ? 'danger' : 'warn' };
    case 'contract.risk_status':
      return { icon: data.status === 'fixed' ? '✓' : '≈', text: k('riskStatus', { no: data.no, status: t(`contracts.risks.status.${data.status}`) }), tone: data.status === 'fixed' ? 'ok' : undefined };
    default:
      return { icon: '•', text: k('changed') };
  }
});
