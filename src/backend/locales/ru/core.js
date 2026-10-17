export default {
  // Local names of currencies (others show their ISO code).
  currency: {
    KGS: 'сом',
  },
  email: {
    open: 'Открыть',
    footer: 'Вы получили это письмо, потому что уведомления включены в вашем профиле.',
  },
  notify: {
    test: {
      title: 'Проверка уведомлений',
      body: 'Если вы видите это сообщение, канал работает.',
    },
    adminTest: {
      title: '{app}: проверка уведомлений',
    },
  },
  signin: {
    linkSubject: 'Вход в {app}',
    linkText: '{app}: ссылка для входа (действует {minutes} минут, одноразовая):\n{link}\n\nЕсли вы не запрашивали вход — просто проигнорируйте это сообщение.',
    codeSubject: 'Код для входа: {code}',
    codeText: '{app}: код для входа {code}. Действует {minutes} минут. Никому не сообщайте его.',
  },
  pwa: {
    shortcuts: { tasks: 'Задачи', calendar: 'Календарь', kb: 'База знаний' },
    pushTest: {
      title: 'Уведомления работают',
      body: 'Так будут выглядеть уведомления на этом устройстве.',
    },
  },
};
