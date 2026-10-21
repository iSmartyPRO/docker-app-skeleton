/*
 * What each QR type puts into the code (pure; tested by
 * src/backend/test/qr.test.js). The server stores the same fields
 * (src/backend/modules/qr/content.js) and never builds the payload itself.
 *
 *   url       the address (https:// added when missing)
 *   vcard     vCard 3.0 — every phone camera offers «Add contact»
 *   wifi      WIFI:T:WPA;S:<ssid>;P:<password>;H:true;;  (Android, iOS 11+)
 *   email     mailto: with subject and body
 *   phone     tel:
 *   sms       SMSTO:<number>:<text>
 *   whatsapp  https://wa.me/<digits>?text=
 *   telegram  https://t.me/<username>
 *   geo       geo:<lat>,<lng>?q=<lat>,<lng>(<label>)
 *   event     iCalendar VEVENT (local time, or all-day dates)
 *   text      as typed
 */

export const QR_TYPES = ['url', 'vcard', 'wifi', 'text', 'email', 'phone', 'sms', 'whatsapp', 'telegram', 'geo', 'event'];

const trim = (value) => String(value ?? '').trim();

/** https:// in front of an address without a scheme. */
export function normalizeUrl(value) {
  const url = trim(value);
  if (!url) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}

/** Characters vCard 3.0 escapes in values: \ , ; and new lines. */
export function vcardEscape(value) {
  return trim(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

/** Characters the Wi-Fi format escapes: \ ; , : and ". */
export function wifiEscape(value) {
  return String(value ?? '').replace(/([\\;,:"])/g, '\\$1');
}

function icsEscape(value) {
  return trim(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

const digits = (value) => trim(value).replace(/[^\d+]/g, '');

/** "2026-10-21T18:30" → 20261021T183000; "2026-10-21" → 20261021 (all-day). */
function icsDate(value, allDay) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(trim(value));
  if (!match) return '';
  const [, y, m, d, hh = '00', mm = '00'] = match;
  return allDay ? `${y}${m}${d}` : `${y}${m}${d}T${hh}${mm}00`;
}

function nextDay(compact) {
  const date = new Date(Date.UTC(+compact.slice(0, 4), +compact.slice(4, 6) - 1, +compact.slice(6, 8) + 1));
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

const ENCODERS = {
  url: (c) => normalizeUrl(c.url),
  text: (c) => String(c.text ?? ''),
  phone: (c) => (digits(c.phone) ? `tel:${digits(c.phone)}` : ''),
  sms: (c) => (digits(c.phone) || trim(c.message) ? `SMSTO:${digits(c.phone)}:${trim(c.message)}` : ''),
  email: (c) => {
    if (!trim(c.to)) return '';
    const params = [];
    if (trim(c.subject)) params.push(`subject=${encodeURIComponent(trim(c.subject))}`);
    if (trim(c.body)) params.push(`body=${encodeURIComponent(trim(c.body))}`);
    return `mailto:${trim(c.to)}${params.length ? `?${params.join('&')}` : ''}`;
  },
  whatsapp: (c) => {
    const number = digits(c.phone).replace(/^\+/, '');
    if (!number) return '';
    return `https://wa.me/${number}${trim(c.message) ? `?text=${encodeURIComponent(trim(c.message))}` : ''}`;
  },
  telegram: (c) => {
    const name = trim(c.username).replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
    return name ? `https://t.me/${name}` : '';
  },
  geo: (c) => {
    const lat = Number(String(c.lat ?? '').replace(',', '.'));
    const lng = Number(String(c.lng ?? '').replace(',', '.'));
    if (!trim(c.lat) || !trim(c.lng) || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return '';
    const label = trim(c.label);
    return `geo:${lat},${lng}${label ? `?q=${lat},${lng}(${encodeURIComponent(label)})` : ''}`;
  },
  wifi: (c) => {
    if (!trim(c.ssid)) return '';
    const security = ['WPA', 'WEP', 'nopass'].includes(c.security) ? c.security : 'WPA';
    const parts = [`T:${security}`, `S:${wifiEscape(c.ssid)}`];
    if (security !== 'nopass' && c.password) parts.push(`P:${wifiEscape(c.password)}`);
    if (c.hidden) parts.push('H:true');
    return `WIFI:${parts.join(';')};;`;
  },
  vcard: (c) => {
    const first = trim(c.firstName);
    const last = trim(c.lastName);
    if (!first && !last && !trim(c.org) && !trim(c.phone) && !trim(c.mobile) && !trim(c.email)) return '';
    const full = [first, last].filter(Boolean).join(' ') || trim(c.org);
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vcardEscape(last)};${vcardEscape(first)};;;`, `FN:${vcardEscape(full)}`];
    if (trim(c.org)) lines.push(`ORG:${vcardEscape(c.org)}`);
    if (trim(c.title)) lines.push(`TITLE:${vcardEscape(c.title)}`);
    if (trim(c.mobile)) lines.push(`TEL;TYPE=CELL:${trim(c.mobile)}`);
    if (trim(c.phone)) lines.push(`TEL;TYPE=WORK,VOICE:${trim(c.phone)}`);
    if (trim(c.email)) lines.push(`EMAIL;TYPE=INTERNET:${trim(c.email)}`);
    if (trim(c.website)) lines.push(`URL:${normalizeUrl(c.website)}`);
    if (trim(c.address)) lines.push(`ADR;TYPE=WORK:;;${vcardEscape(c.address)};;;;`);
    if (trim(c.note)) lines.push(`NOTE:${vcardEscape(c.note)}`);
    lines.push('END:VCARD');
    return lines.join('\n');
  },
  event: (c) => {
    if (!trim(c.title) || !trim(c.start)) return '';
    const allDay = Boolean(c.allDay);
    const start = icsDate(c.start, allDay);
    if (!start) return '';
    let end = icsDate(c.end, allDay);
    if (allDay && (!end || end < start)) end = nextDay(start);
    else if (allDay) end = nextDay(end);
    const lines = ['BEGIN:VEVENT', `SUMMARY:${icsEscape(c.title)}`];
    lines.push(allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`);
    if (end && end >= start) lines.push(allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`);
    if (trim(c.location)) lines.push(`LOCATION:${icsEscape(c.location)}`);
    if (trim(c.description)) lines.push(`DESCRIPTION:${icsEscape(c.description)}`);
    lines.push('END:VEVENT');
    return lines.join('\n');
  },
};

/** The payload of a code; '' while the required fields are empty. */
export function encodeContent(type, content = {}) {
  const encoder = ENCODERS[type];
  return encoder ? encoder(content || {}) : '';
}

/** The text a dynamic code holds: the short link instead of the address. */
export function payloadFor(code, origin) {
  if (code.dynamic && code.slug && code.type === 'url') return `${origin}/q/${code.slug}`;
  return encodeContent(code.type, code.content);
}

/** A short line that tells what is inside, for lists. */
export function summarize(type, c = {}) {
  switch (type) {
    case 'url':
      return trim(c.url).replace(/^https?:\/\//i, '');
    case 'vcard':
      return [trim(c.firstName), trim(c.lastName)].filter(Boolean).join(' ') || trim(c.org) || trim(c.email);
    case 'wifi':
      return trim(c.ssid);
    case 'email':
      return trim(c.to);
    case 'phone':
    case 'sms':
    case 'whatsapp':
      return trim(c.phone);
    case 'telegram':
      return trim(c.username) ? `@${trim(c.username).replace(/^@/, '')}` : '';
    case 'geo':
      return trim(c.label) || (trim(c.lat) && trim(c.lng) ? `${trim(c.lat)}, ${trim(c.lng)}` : '');
    case 'event':
      return trim(c.title);
    default:
      return trim(c.text).slice(0, 80);
  }
}
