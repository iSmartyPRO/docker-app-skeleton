import { t } from '../i18n/translations';

/** Human-readable message from an axios error (API `{ error }` first). */
export function errorMessage(err, fallback = 'Request failed') {
  const data = err?.response?.data;
  if (err?.response?.status === 429 && data?.code === 'RATE_LIMITED') {
    const minutes = Math.max(1, Math.ceil((Number(data.retryAfter) || 60) / 60));
    return t('errors.tooManyRequests', { minutes });
  }
  // nginx answers an over-limit upload with an HTML 413 page before the app sees it.
  if (err?.response?.status === 413 && !data?.code) return t('errors.fileTooLarge');
  if (data?.code === 'CONTACT_TAKEN') return contactTaken(data.info || {});
  // API error codes shown in the UI language instead of the server text (locales/<lang>/errors.js).
  if (data?.code && /^[A-Z0-9_]+$/.test(data.code)) {
    const key = `errors.codes.${data.code}`;
    const known = t(key);
    if (known !== key) return known;
  }
  return data?.error || err?.message || fallback;
}

/*
 * A contact identifies one person at sign-in and receives their notifications,
 * so it cannot sit on two accounts. Administrators see whose it is.
 */
function contactTaken({ field, username }) {
  const key = `errors.contact.${field}`;
  const name = /^[a-z]+$/.test(field || '') && t(key) !== key ? t(key) : t('errors.contact.other');
  return t('errors.contactTaken', { name, owner: username ? ` (@${username})` : '' });
}

/**
 * Sign-in errors carry a machine `code`; show it in the UI language and fall
 * back to the server text for anything unknown.
 */
export function authErrorMessage(err, t) {
  const code = err?.response?.data?.code;
  if (code) {
    const key = `signin.errors.${code}`;
    const text = t(key);
    if (text !== key) return text;
  }
  return errorMessage(err);
}
