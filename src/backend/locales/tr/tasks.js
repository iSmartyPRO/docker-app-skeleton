export default {
  priority: ['Düşük', 'Normal', 'Yüksek', 'Acil'],
  noProject: 'Proje yok',
  starter: {
    name: 'Genel',
    description: 'Belirli bir projeye ait olmayan ekip görevleri.',
  },
  // Statuses of a new project, in order (to do → done).
  statuses: ['Yapılacak', 'Devam ediyor', 'İnceleme', 'Tamamlandı'],
  notify: {
    deadline: 'Son tarih: {due}',
    assigned: {
      title: 'Size atandı: {ref}',
      acceptBy: 'Lütfen şu zamana kadar kabul edin: {time}',
    },
    accepted: {
      title: 'Kabul edildi: {ref}',
      comment: ': “{comment}”',
    },
    acceptOverdue: {
      title: 'Kabul edin: {ref} — {hours} saattir bekliyor',
      body: 'Oluşturan, görevi kabul etmenizi veya görüşmenizi bekliyor.',
    },
    notAccepted: {
      title: '{hours} saattir kabul edilmedi: {ref}',
      assignee: 'Sorumlu: {name}',
    },
    status: { title: '{ref}: durum “{status}” olarak değişti' },
    comment: { title: 'Yeni yorum: {ref}' },
    mention: {
      title: '{actor} sizden bahsetti: {ref}',
      body: '{actor}: {snippet}\n{title}',
    },
    priority: { title: '{ref}: öncelik artık {priority}' },
    dueSoon: { title: 'Son tarihe 24 saatten az kaldı: {ref}' },
    projectNew: { title: 'Yeni görev — {project}: {ref}' },
    projectDone: { title: 'Tamamlandı: {ref} ({project})' },
    overdue: { title: 'Gecikmiş: {ref}' },
    reminder: { title: 'Hatırlatma: {ref}' },
    result: { title: 'Sonuç eklendi: {ref}' },
  },
};
