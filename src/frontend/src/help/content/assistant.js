export default {
  id: 'assistant',
  icon: 'robot',
  title: { ru: 'Робот-помощник', en: 'Robot assistant' },
  tagline: { ru: 'Дружелюбный помощник на каждой странице.', en: 'A friendly helper on every page.' },
  summary: {
    ru: 'Робот в углу экрана подсказывает, что умеет раздел, в котором вы находитесь, и отвечает на вопросы по справке. Его можно перетащить в любое место, сменить или выключить.',
    en: 'The robot in the corner tells you what the section you’re in can do and answers questions from the help. Drag it anywhere, change it or turn it off.',
  },
  highlights: [
    { icon: '💬', title: { ru: 'Помощь по разделу', en: 'Help for the section' }, text: { ru: 'Нажмите на робота: совет, краткая и полная справка, частые вопросы.', en: 'Click the robot: a tip, the short and full guide, frequent questions.' } },
    { icon: '🔎', title: { ru: 'Спросите', en: 'Ask' }, text: { ru: 'Напишите вопрос своими словами — робот найдёт ответ во всей справке.', en: 'Type a question in your own words — the robot finds the answer across all help.' } },
    { icon: '✋', title: { ru: 'Где удобно', en: 'Where it suits you' }, text: { ru: 'Перетащите робота мышью или пальцем — он запомнит место на этом устройстве.', en: 'Drag the robot with the mouse or a finger — it remembers the spot on this device.' } },
    { icon: '🎨', title: { ru: '17 персонажей и свой цвет', en: '17 characters and your colour' }, text: { ru: 'Роботы, профессии, дети, герои в кыргызском стиле, супергерои и животные — нажмите на аватар в панели робота, выберите персонажа и при желании его цвет. Администратор может оставить только некоторых или одного для всех.', en: 'Robots, professions, kids, characters in Kyrgyz style, superheroes and animals — tap the avatar in the robot’s panel, pick a character and, if you like, its colour. An administrator may allow only some, or one for everyone.' } },
  ],
  tips: [
    { ru: 'Робот мешает? Перетащите его к краю экрана или выберите размер «Маленький».', en: 'In the way? Drag the robot to the edge or choose the “Small” size.' },
    { ru: '«Спрятать до перезагрузки» убирает робота ненадолго, «Отключить» — насовсем (включить снова можно в Профиль → Оформление).', en: '“Hide until reload” removes it for a while, “Turn off” for good (turn it back on under Account → Appearance).' },
  ],
  sections: [
    {
      id: 'settings',
      title: { ru: 'Настройка', en: 'Settings' },
      body: {
        ru: 'В [Профиль → Оформление](/account/appearance#assistant): показывать ли помощника, какого робота, размер, вернуть в угол и снова получать предложения помощи. Администратор в Настройки → Модули → Робот-помощник выбирает робота по умолчанию и может выключить модуль для всех.',
        en: 'Under [Account → Appearance](/account/appearance#assistant): show the assistant, which robot, size, back to the corner, offers again. Administrators choose the default robot under Settings → Modules → Robot assistant and can switch the module off for everyone.',
      },
    },
  ],
  faq: [
    { q: { ru: 'Как убрать робота?', en: 'How do I remove the robot?' }, a: { ru: 'Нажмите на робота → ⋯ → «Отключить помощника». Вернуть — в Профиль → Оформление.', en: 'Click the robot → ⋯ → “Turn the assistant off”. Bring it back under Account → Appearance.' } },
    { q: { ru: 'Робот закрывает кнопку', en: 'The robot covers a button' }, a: { ru: 'Перетащите его в другое место — оно запомнится.', en: 'Drag it elsewhere — the spot is remembered.' } },
  ],
  related: ['start', 'account'],
};
