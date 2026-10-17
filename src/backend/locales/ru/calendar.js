export default {
  personal: 'Мой календарь',
  lead: {
    days_one: '{count} день',
    days_few: '{count} дня',
    days_many: '{count} дней',
    days_other: '{count} дня',
    hours_one: '{count} час',
    hours_few: '{count} часа',
    hours_many: '{count} часов',
    hours_other: '{count} часа',
    minutes_one: '{count} мин',
    minutes_few: '{count} мин',
    minutes_many: '{count} мин',
    minutes_other: '{count} мин',
  },
  notify: {
    invited: {
      title: 'Приглашение: {title}',
      by: 'Приглашает {actor}',
    },
    updated: { title: 'Событие изменено: {title}' },
    cancelled: { title: 'Событие отменено: {title}' },
    rsvp: {
      accepted: '{actor} примет участие: {title}',
      declined: '{actor} отказался(-ась): {title}',
      tentative: '{actor} возможно, придёт: {title}',
    },
    followNew: { title: 'Новое в «{calendar}»: {title}' },
    followUpdated: { title: 'Изменено в «{calendar}»: {title}' },
    followDeleted: { title: 'Удалено из «{calendar}»: {title}' },
    reminder: {
      now: 'Начинается: {title}',
      in: 'Через {lead}: {title}',
    },
  },
};
