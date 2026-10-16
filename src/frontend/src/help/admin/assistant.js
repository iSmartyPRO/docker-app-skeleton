export default {
  id: 'assistant',
  purpose: {
    ru: 'Робот-помощник — дружелюбный персонаж на каждой странице: подсказывает при первом входе в раздел, показывает краткую и полную справку и ищет ответы по справке. Снижает число вопросов «где это?» к администратору.',
    en: 'The robot assistant is a friendly character on every page: it offers tips on the first visit to a section, opens the short and full guide and searches the help. Fewer «where is it?» questions for the administrator.',
  },
  audience: { ru: 'Все сотрудники, особенно новые.', en: 'Every employee, especially newcomers.' },
  setup: [
    { title: { ru: 'Выберите персонажа по умолчанию', en: 'Pick the default character' }, text: { ru: 'В [настройках](/admin/settings/assistant). Можно разрешить любой, только выбранные или один для всех (например, талисман компании).', en: 'In the [settings](/admin/settings/assistant). Allow any, selected ones, or one for everyone (e.g. a company mascot).' } },
    { title: { ru: 'Включите подсказки в разделах', en: 'Turn on section tips' }, text: { ru: 'Робот один раз предложит помощь в каждом новом разделе.', en: 'The robot offers help once in each new section.' } },
    { title: { ru: 'Разрешите цвета', en: 'Allow colours' }, text: { ru: 'Сотрудники смогут перекрасить своего персонажа.', en: 'People can recolour their character.' } },
  ],
  scenarios: [
    { title: { ru: 'Запуск портала', en: 'Portal launch' }, text: { ru: 'В первые недели робот подсказывает в каждом разделе, потом сотрудники скрывают его в «Оформлении».', en: 'In the first weeks the robot helps in every section; later people hide it in Appearance.' } },
    { title: { ru: 'Единый стиль', en: 'One style' }, text: { ru: 'Режим «Один для всех» — у всей компании одинаковый помощник.', en: '«One for everyone» — the whole company gets the same helper.' } },
  ],
  faq: [
    { q: { ru: 'Робот мешает — как убрать?', en: 'The robot is in the way — how to hide it?' }, a: { ru: 'Каждый может скрыть его в «Кабинет → Оформление»; администратор выключает модуль целиком.', en: 'Anyone can hide it in Account → Appearance; the administrator can switch the module off.' } },
    { q: { ru: 'Откуда робот берёт ответы?', en: 'Where do the answers come from?' }, a: { ru: 'Из встроенной справки портала, без внешних сервисов.', en: 'From the portal’s built-in help, with no outside services.' } },
  ],
};
