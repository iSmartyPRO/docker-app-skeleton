export default {
  priority: ['Төмөн', 'Кадимки', 'Жогору', 'Шашылыш'],
  noProject: 'Долбоорсуз',
  starter: {
    name: 'Жалпы',
    description: 'Белгилүү бир долбоорго кирбеген команданын тапшырмалары.',
  },
  // Statuses of a new project, in order (to do → done).
  statuses: ['Аткарылышы керек', 'Иште', 'Текшерүүдө', 'Даяр'],
  notify: {
    deadline: 'Мөөнөт: {due}',
    assigned: {
      title: 'Сизге {ref} тапшырмасы дайындалды',
      acceptBy: 'Сураныч, аны {time} чейин кабыл алыңыз',
    },
    accepted: {
      title: '{ref} тапшырмасы ишке кабыл алынды',
      comment: ': «{comment}»',
    },
    acceptOverdue: {
      title: '{ref} тапшырмасын кабыл алыңыз: {hours} саат күтүүдө',
      body: 'Тапшырма берүүчү Сиздин тапшырманы кабыл алышыңызды же талкуулашыңызды күтүүдө.',
    },
    notAccepted: {
      title: '{ref} тапшырмасы {hours} саат ичинде кабыл алынган жок',
      assignee: 'Аткаруучу: {name}',
    },
    status: { title: '{ref}: статус «{status}» болуп өзгөрдү' },
    comment: { title: '{ref} тапшырмасына жаңы комментарий' },
    mention: {
      title: '{actor} Сизди {ref} тапшырмасында эскерди',
      body: '{actor}: {snippet}\n{title}',
    },
    priority: { title: '{ref}: приоритет эми {priority}' },
    dueSoon: { title: '{ref} тапшырмасынын мөөнөтү 24 сааттын ичинде бүтөт' },
    projectNew: { title: '{project} долбоорунда жаңы тапшырма: {ref}' },
    projectDone: { title: '{ref} тапшырмасы аткарылды ({project})' },
    overdue: { title: '{ref} тапшырмасынын мөөнөтү өттү' },
    reminder: { title: 'Эскертүү: {ref}' },
    result: { title: '{ref} тапшырмасына натыйжа кошулду' },
  },
};
