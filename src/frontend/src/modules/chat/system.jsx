/*
 * System events in conversations. A module registers how its events read:
 *
 *   registerSystemEvents('task.', (data, ctx) => ({ icon: '⏰', text: '…', tone: 'warn', actions: [...] }))
 *
 * `ctx` has t, locale, actor (who did it) and navigate. Unknown events show a
 * neutral line instead of breaking the chat.
 */

const renderers = [];

export function registerSystemEvents(prefix, render) {
  renderers.push({ prefix, render });
}

export function systemView(data, ctx) {
  const event = data?.event || '';
  const entry = renderers.find((item) => event.startsWith(item.prefix));
  try {
    return entry ? entry.render(data, ctx) : null;
  } catch {
    return null;
  }
}

registerSystemEvents('chat.', (data, { t, actor }) => {
  const names = (data.users || []).map((user) => user.name).join(', ');
  switch (data.event) {
    case 'chat.created':
      return { icon: '✦', text: t('chat.sys.created', { actor, title: data.title }) };
    case 'chat.renamed':
      return { icon: '✎', text: t('chat.sys.renamed', { actor, title: data.title }) };
    case 'chat.joined':
      return { icon: '＋', text: t('chat.sys.joined', { actor, names }) };
    case 'chat.removed':
      return { icon: '−', text: t('chat.sys.removed', { actor, names }) };
    case 'chat.left':
      return { icon: '←', text: t('chat.sys.left', { names }) };
    default:
      return null;
  }
});
