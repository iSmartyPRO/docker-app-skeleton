import { query } from '../../config/database.js';
import { eventAllows, notify, prefsWithZone, quietState } from '../../services/notifications.js';
import { portalRegional } from '../../services/regional.js';
import { pushToUser } from '../../services/push.js';
import { isWatching } from './realtime.js';
import { getSettings, parseSettings, recipientLocale } from '../../services/settings.js';
import { tr } from '../../services/i18n/index.js';

/*
 * Who hears about a new message and how:
 *   - @mentioned people get a regular notification (inbox, push, e-mail,
 *     messengers — whatever they chose in their profile);
 *   - everyone else in the room gets a push to their devices, grouped per chat
 *     (one notification per conversation, replaced by the newest);
 *   - nobody is pushed about a chat they muted or are looking at right now.
 */


function preview(message, lang) {
  const text = String(message.body || '').replace(/\s+/g, ' ').trim();
  if (text) return text.length > 180 ? `${text.slice(0, 177)}…` : text;
  return message.files?.length ? tr(lang, 'chat.files', { count: message.files.length }) : '';
}

export async function deliverMessage(room, message, recipients, { authorId, mentions = [], link, system = false }) {
  const others = recipients.filter((id) => id !== authorId);
  if (!others.length) return;
  const { rows: people } = await query(
    `SELECT u.id, u.username, u.locale, u.notify_prefs, u.regional, u.device_tz, m.muted,
            (SELECT COUNT(*)::int FROM notifications n WHERE n.user_id = u.id AND n.read_at IS NULL) AS unread
     FROM users u LEFT JOIN chat_members m ON m.user_id = u.id AND m.room_id = $2
     WHERE u.id = ANY($1) AND u.is_active IS NOT FALSE AND u.is_blocked IS NOT TRUE`,
    [others, room.id]
  );
  const author = message.author?.name || '';
  const where = room.kind === 'direct' ? author : room.title || author;
  const mentioned = new Set(mentions.map((name) => name.toLowerCase()));

  const tagged = people.filter((person) => mentioned.has(String(person.username).toLowerCase()));
  if (tagged.length && !system) {
    await notify({
      userIds: tagged.map((person) => person.id),
      kind: 'chat.mention',
      module: 'chat',
      link,
      actorId: authorId,
      render: (locale) => ({ title: tr(locale, 'chat.mention', { who: author, where }), body: preview(message, locale) }),
    });
  }

  const portal = await portalRegional();
  const { localization } = parseSettings(await getSettings());
  for (const person of people) {
    if (tagged.includes(person) && !system) continue;
    if (person.muted || isWatching(person.id, room.id)) continue;
    // Quiet hours in the person's own zone.
    const prefs = prefsWithZone(person, portal);
    if (!eventAllows(prefs, 'chat.message', 'push') || quietState(prefs)) continue;
    const text = preview(message, recipientLocale(person, localization));
    pushToUser(person.id, {
      title: where,
      body: room.kind === 'direct' || system || !author ? text : `${author}: ${text}`,
      url: link || '/app/chat',
      tag: `chat-${room.id}`,
      unread: person.unread || undefined,
    }).catch(() => {});
  }
}
