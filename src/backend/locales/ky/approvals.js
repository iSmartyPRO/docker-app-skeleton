export default {
  notify: {
    quoted: '«{title}»',
    by: 'Жөнөткөн: {actor}',
    due: 'Мөөнөт: {date}',
    stage: 'Баскыч: {stage}',
    request: {
      title: 'Сиздин макулдашууңузду күтүүдө: {doc}',
      delegated: '{actor} Сизге макулдашууну өткөрүп берди: {doc}',
    },
    question: {
      title: '{actor} суроо берди: {doc}',
      body: 'Макулдашууга кайтаруу үчүн жооп бериңиз.',
    },
    answer: {
      title: '{actor} жооп берди: {doc}',
      body: 'Документ кайра Сиздин макулдашууңузда.',
    },
    approved: { title: 'Макулдашылды: {doc}' },
    progress: { title: '«{stage}» баскычы макулдашылды: {doc}' },
    rejected: { title: 'Четке кагылды: {doc}' },
    returned: {
      title: 'Кайра иштеп чыгууга кайтарылды: {doc}',
      body: 'Өзгөртүүлөрдү киргизип, кайра жөнөтүңүз.',
    },
    withdrawn: { title: 'Автор кайра чакыртып алды: {doc}' },
    reminder: { title: 'Эскертүү: {doc} Сиздин чечимиңизди күтүүдө' },
    overdue: { title: 'Мөөнөтү өттү: {doc}' },
    escalation: {
      title: 'Жогору жиберүү: {doc} мөөнөтү өттү',
      waiting: 'Күтүлүүдө: {approvers}',
    },
    noApprovers: {
      title: '{doc} документин макулдаша турган эч ким жок',
      body: '«{stage}» баскычында активдүү макулдашуучулар жок. Маршрутту текшериңиз.',
    },
  },
};
