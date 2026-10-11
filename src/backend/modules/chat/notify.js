import { query } from '../../config/database.js';
import { notify, resolvePrefs } from '../../services/notifications.js';
import { pushToUser } from '../../services/push.js';
import { isWatching } from './realtime.js';

/*
 * Who hears about a new message and how:
 *   - @mentioned people get a regular notification (inbox, push, e-mail,
 *     messengers — whatever they chose in their profile);
 *   - everyone else in the room gets a push to their devices, grouped per chat
 *     (one notification per conversation, replaced by the newest);
 *   - nobody is pushed about a chat they muted or are looking at right now.
 */

const LABELS = {
  en: { files: (n) => `📎 ${n} file(s)`, mention: (who, where) => `${who} mentioned you in “${where}”` },
  ru: { files: (n) => `📎 Файлов: ${n}`, mention: (who, where) => `${who} упомянул(а) вас в «${where}»` },
};

function preview(message, lang) {
  const text = String(message.body || '').replace(/\s+/g, ' ').trim();
  if (text) return text.length > 180 ? `${text.slice(0, 177)}…` : text;
  return message.files?.length ? LABELS[lang].files(message.files.length) : '';
}

export async function deliverMessage(room, message, recipients, { authorId, mentions = [], link, system = false }) {
  const others = recipients.filter((id) => id !== authorId);
  if (!others.length) return;
  const { rows: people } = await query(
    `SELECT u.id, u.username, u.locale, u.notify_prefs, m.muted,
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
      render: (locale) => {
        const lang = locale === 'ru' ? 'ru' : 'en';
        return { title: LABELS[lang].mention(author, where), body: preview(message, lang) };
      },
    });
  }

  for (const person of people) {
    if (tagged.includes(person) && !system) continue;
    if (person.muted || isWatching(person.id, room.id)) continue;
    if (!resolvePrefs(person.notify_prefs).push) continue;
    const lang = person.locale === 'ru' ? 'ru' : 'en';
    const text = preview(message, lang);
    pushToUser(person.id, {
      title: where,
      body: room.kind === 'direct' || system || !author ? text : `${author}: ${text}`,
      url: link || '/app/chat',
      tag: `chat-${room.id}`,
      unread: person.unread || undefined,
    }).catch(() => {});
  }
}
