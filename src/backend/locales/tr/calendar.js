export default {
  personal: 'Takvimim',
  lead: {
    days_one: '{count} gün',
    days_other: '{count} gün',
    hours_one: '{count} saat',
    hours_other: '{count} saat',
    minutes_one: '{count} dk',
    minutes_other: '{count} dk',
  },
  notify: {
    invited: {
      title: 'Davet: {title}',
      by: '{actor} sizi davet etti',
    },
    updated: { title: 'Etkinlik değişti: {title}' },
    cancelled: { title: 'Etkinlik iptal edildi: {title}' },
    rsvp: {
      accepted: '{actor} kabul etti: {title}',
      declined: '{actor} reddetti: {title}',
      tentative: '{actor} belki katılacak: {title}',
    },
    followNew: { title: '“{calendar}” takviminde yeni: {title}' },
    followUpdated: { title: '“{calendar}” takviminde değişti: {title}' },
    followDeleted: { title: '“{calendar}” takviminden kaldırıldı: {title}' },
    reminder: {
      now: 'Şimdi başlıyor: {title}',
      in: '{lead} sonra: {title}',
    },
  },
};
