/** Strings of the "technical works" screen and the crash screen. Keep EN and RU in parity. */

export const outageEn = {
  outage: {
    update: { title: 'The portal is updating', text: 'The server is restarting with a new version — this usually takes under a minute. The page continues by itself; what you typed stays.' },
    works: { title: 'Technical works', text: 'The portal’s database is temporarily unavailable. We are already on it; the page continues by itself as soon as it is back.' },
    network: { title: 'No connection to the portal', text: 'The server does not answer. Check your internet; if it works, technical works are going on — the page continues by itself.' },
    offline: { title: 'You are offline', text: 'Check your internet connection — the portal continues as soon as you are back online.' },
    checking: 'Checking…',
    nextCheck: 'Next check in {s} s',
    waiting: 'Waiting for the server…',
    code: 'Code',
    request: 'Request',
    session: 'Session',
    since: 'Started',
    retry: 'Check now',
    copy: 'Copy details',
    copied: 'Copied',
    note: 'If this lasts long, send these details to your administrator',
  },
  incidents: { title: 'Failures and errors', desc: 'Server errors and app crashes since the last restart, with the ids people see on error screens.', search: 'Code, request or session id…', code: 'Code', request: 'Request', session: 'Session', where: 'Where', empty: 'No failures — all good' },
  appError: { details: 'Details for support', copy: 'Copy details', copied: 'Copied', code: 'Code', session: 'Session', incident: 'Incident' },
};

export const outageRu = {
  outage: {
    update: { title: 'Портал обновляется', text: 'Сервер перезапускается с новой версией — обычно это меньше минуты. Страница продолжит работу сама, введённые данные сохранятся.' },
    works: { title: 'Технические работы', text: 'База данных портала временно недоступна. Мы уже занимаемся этим; страница продолжит работу сама, как только всё восстановится.' },
    network: { title: 'Нет связи с порталом', text: 'Сервер не отвечает. Проверьте интернет; если он в порядке — идут технические работы, страница продолжит работу сама.' },
    offline: { title: 'Нет подключения к интернету', text: 'Проверьте подключение — портал продолжит работу, как только связь вернётся.' },
    checking: 'Проверяем…',
    nextCheck: 'Следующая проверка через {s} с',
    waiting: 'Ждём сервер…',
    code: 'Код',
    request: 'Запрос',
    session: 'Сессия',
    since: 'Начало',
    retry: 'Проверить сейчас',
    copy: 'Скопировать данные',
    copied: 'Скопировано',
    note: 'Если это затянулось, отправьте эти данные администратору',
  },
  incidents: { title: 'Сбои и ошибки', desc: 'Ошибки сервера и сбои приложения с последнего перезапуска — с номерами, которые люди видят на экранах ошибок.', search: 'Код, номер запроса или сессии…', code: 'Код', request: 'Запрос', session: 'Сессия', where: 'Где', empty: 'Сбоев нет — всё в порядке' },
  appError: { details: 'Данные для поддержки', copy: 'Скопировать данные', copied: 'Скопировано', code: 'Код', session: 'Сессия', incident: 'Инцидент' },
};
