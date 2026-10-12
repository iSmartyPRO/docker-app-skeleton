/** Human-readable message from an axios error (API `{ error }` first). */
export function errorMessage(err, fallback = 'Request failed') {
  const data = err?.response?.data;
  if (err?.response?.status === 429 && data?.code === 'RATE_LIMITED') {
    const minutes = Math.max(1, Math.ceil((Number(data.retryAfter) || 60) / 60));
    return document.documentElement.lang === 'ru'
      ? `Слишком много запросов подряд. Повторите через ${minutes} мин.`
      : `Too many requests in a row. Try again in ${minutes} min.`;
  }
  if (data?.code === 'CONTACT_TAKEN') return contactTaken(data.info || {});
  return data?.error || err?.message || fallback;
}

const CONTACT_NAMES = {
  ru: { phone: 'Этот номер телефона', email: 'Этот e-mail', mattermost: 'Это имя в Mattermost', instagram: 'Этот Instagram' },
  en: { phone: 'This phone number', email: 'This e-mail', mattermost: 'This Mattermost name', instagram: 'This Instagram' },
};

/*
 * A contact identifies one person at sign-in and receives their notifications,
 * so it cannot sit on two accounts. Administrators see whose it is.
 */
function contactTaken({ field, username }) {
  const ru = document.documentElement.lang === 'ru';
  const name = (ru ? CONTACT_NAMES.ru : CONTACT_NAMES.en)[field] || (ru ? 'Этот контакт' : 'This contact');
  if (ru) return `${name} уже указан у другой учётной записи${username ? ` (@${username})` : ''}. Уберите его там или укажите другой.`;
  return `${name} already belongs to another account${username ? ` (@${username})` : ''}. Remove it there or use another one.`;
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
