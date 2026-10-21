/*
 * What a QR code holds, per type. The browser turns the fields into the
 * payload (src/frontend/src/modules/qr/engine/encode.js); the server keeps
 * only the whitelisted fields of the type, clipped to their limits.
 * Numbers are maximum lengths; `true` marks a yes/no field.
 */

export const TYPES = {
  url: { url: 2000 },
  text: { text: 1500 },
  vcard: {
    firstName: 80, lastName: 80, org: 120, title: 120, phone: 40, mobile: 40, email: 160, website: 300, address: 300, note: 400,
  },
  wifi: { ssid: 64, password: 128, security: 8, hidden: true },
  email: { to: 160, subject: 200, body: 1000 },
  phone: { phone: 40 },
  sms: { phone: 40, message: 600 },
  whatsapp: { phone: 40, message: 600 },
  telegram: { username: 64 },
  geo: { lat: 20, lng: 20, label: 120 },
  event: { title: 160, location: 200, start: 20, end: 20, allDay: true, description: 600 },
};

export const TYPE_IDS = Object.keys(TYPES);

/** The fields of `type` from any input; unknown keys and control characters go. */
export function cleanContent(type, input = {}) {
  const spec = TYPES[type];
  if (!spec) return null;
  const out = {};
  for (const [key, limit] of Object.entries(spec)) {
    const value = input?.[key];
    if (limit === true) out[key] = Boolean(value);
    else if (value != null) out[key] = String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, limit);
  }
  if (type === 'wifi' && !['WPA', 'WEP', 'nopass'].includes(out.security)) out.security = 'WPA';
  return out;
}

/** http(s) address of a website code, or null (dynamic codes redirect only to these). */
export function targetUrl(content) {
  const raw = String(content?.url || '').trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}
