/** Human-readable message from an axios error (API `{ error }` first). */
export function errorMessage(err, fallback = 'Request failed') {
  const data = err?.response?.data;
  if (err?.response?.status === 429 && data?.code === 'RATE_LIMITED') {
    const minutes = Math.max(1, Math.ceil((Number(data.retryAfter) || 60) / 60));
    return document.documentElement.lang === 'ru'
      ? `Слишком много запросов подряд. Повторите через ${minutes} мин.`
      : `Too many requests in a row. Try again in ${minutes} min.`;
  }
  // nginx answers an over-limit upload with an HTML 413 page before the app sees it.
  if (err?.response?.status === 413 && !data?.code) {
    return document.documentElement.lang === 'ru'
      ? 'Файл слишком большой для загрузки. Выберите файл поменьше.'
      : 'The file is too large to upload. Choose a smaller file.';
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
  DIRECTORY_LOGIN_FAILED: { ru: 'Каталог не принял этот логин и пароль.', en: 'The directory did not accept this login and password.' },
  DIRECTORY_TAKEN: { ru: 'Эта доменная учётная запись уже привязана к другому пользователю.', en: 'This domain account is already linked to another user.' },
  DIRECTORY_MISMATCH: { ru: 'Этот логин принадлежит другой доменной учётной записи, не той, что привязана.', en: 'This login belongs to another domain account than the linked one.' },
  DIRECTORY_NOT_FOUND: { ru: 'Доменная учётная запись не найдена в каталоге.', en: 'The domain account was not found in the directory.' },
  DIRECTORY_OFF: { ru: 'Active Directory не настроена.', en: 'Active Directory is not set up.' },
  SUPERADMIN_ONLY: { ru: 'Это может только суперадминистратор.', en: 'Only a superadministrator can do this.' },
  IMPERSONATION_LIMIT: { ru: 'Недоступно, пока вы вошли как другой пользователь.', en: 'Not available while signed in as another user.' },
  ALREADY_IMPERSONATING: { ru: 'Сначала вернитесь в свою учётную запись.', en: 'Return to your own account first.' },
  LOCKED: { ru: 'Слишком много неудачных попыток. Попробуйте позже.', en: 'Too many failed attempts. Try again later.' },
  SUPERADMIN_TARGET: { ru: 'Войти как другой суперадминистратор нельзя.', en: 'You cannot sign in as another superadministrator.' },
  TELEGRAM_ID: { ru: 'ID в Telegram — это число.', en: 'A Telegram id is a number.' },
  QUOTA_EXCEEDED: {
    ru: 'Хранилище заполнено: место по квоте закончилось.',
    en: 'Your storage is full: the quota is used up.',
  },
  // Masterplan: the tree and point markers on the plan.
  INVALID_MARKER: {
    ru: 'Точку нельзя сохранить: центр должен быть на плане, размер — в допустимых пределах; секции и другие уровни рисуются контуром.',
    en: 'The point cannot be saved: its centre must be on the plan and its size within bounds; sectors and other levels are drawn as contours.',
  },
  DUPLICATE: { ru: 'Такая запись уже есть.', en: 'This record already exists.' },
  INVALID_PARENT: { ru: 'Сюда перенести нельзя: родителя нет в проекте, или он внутри переносимого объекта.', en: 'Cannot move here: the parent is not in the project, or it is inside the object being moved.' },
  TOO_DEEP: { ru: 'Слишком глубокая вложенность: в дереве проекта не больше 8 уровней.', en: 'Too deep: a project tree has at most 8 levels.' },
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
