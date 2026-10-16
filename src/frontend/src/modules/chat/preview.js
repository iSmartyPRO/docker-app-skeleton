import { systemView } from './system';
import { fmtTime, inZone, intlOptions, nowInZone } from '../../lib/datetime';

/** One-line preview of a room's last message (author prefix in group chats). */
export function lastText(room, t, locale) {
  const last = room.lastMessage;
  if (!last) return room.kind === 'entity' ? t('chat.noMessagesYet') : '';
  if (last.deleted) return t('chat.deleted');
  if (last.kind === 'system') return systemView(last.data, { t, locale, actor: last.author?.name || t('chat.someone') })?.text || '';
  const text = last.text || (last.files ? `📎 ${t('chat.filesN', { n: last.files })}` : '');
  if (room.kind === 'direct' || !last.author) return text;
  return `${last.author.name.split(' ')[0]}: ${text}`;
}

/** Short time of the last message: time today, weekday this week, else the date. */
export function when(value, locale) {
  // Days, the time and the hour cycle are the person's (their zone and formats).
  const date = new Date(value);
  const zoned = inZone(value);
  if (!zoned) return '';
  const tag = locale === 'ru' ? 'ru-RU' : 'en-GB';
  if (zoned.isSame(nowInZone(), 'day')) return fmtTime(value);
  if (Date.now() - date < 6 * 86400000) return date.toLocaleDateString(tag, intlOptions({ weekday: 'short' }));
  return date.toLocaleDateString(tag, intlOptions({ day: 'numeric', month: 'short' }));
}
