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
  const known = CODE_MESSAGES[data?.code];
  if (known) return document.documentElement.lang === 'ru' ? known.ru : known.en;
  return data?.error || err?.message || fallback;
}

/** API error codes shown in the UI language instead of the server text. */
const CODE_MESSAGES = {
  SECRET_REQUIRED: {
    ru: 'Адрес сервера изменён — введите пароль, ключ или токен подключения заново.',
    en: 'The server address has changed — enter the password, key or token of the connection again.',
  },
  TOKEN_FORBIDDEN_FIELD: {
    ru: 'Через API-токен нельзя менять e-mail, телефон или Mattermost.',
    en: 'An API token cannot change the e-mail, phone or Mattermost.',
  },
  TARGET_TOO_POWERFUL: {
    ru: 'У этого человека больше прав, чем у вас: создать токен или вебхук от его имени нельзя.',
    en: 'This person has more access than you: you cannot create a token or webhook on their behalf.',
  },
  WEBHOOKS_OFF: {
    ru: 'Вебхуки выключены в настройках API.',
    en: 'Webhooks are turned off in the API settings.',
  },
  USE_ACCOUNT_PASSWORD: {
    ru: 'Свой пароль меняйте в профиле: Профиль → Безопасность.',
    en: 'Change your own password in your account: Account → Security.',
  },
  CANNOT_MANAGE_MEMBERS: {
    ru: 'Изменение лишит прав людей, которыми вы не можете управлять (у них больше прав, чем у вас).',
    en: 'This change would take access away from people you cannot manage (they have more access than you).',
  },
  FILE_TYPE: {
    ru: 'Такой тип файла запрещён администратором.',
    en: 'This file type is not allowed by the administrator.',
  },
  FILE_CONTENT: {
    ru: 'Содержимое файла не соответствует его расширению.',
    en: 'The file content does not match its extension.',
  },
  CALL_URL: {
    ru: 'Ссылка на звонок должна начинаться с http:// или https://.',
    en: 'A call link must start with http:// or https://.',
  },
  QUOTA_EXCEEDED: {
    ru: 'Хранилище заполнено: место по квоте закончилось.',
    en: 'Your storage is full: the quota is used up.',
  },
};

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
