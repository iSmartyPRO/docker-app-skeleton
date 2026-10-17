export default {
  notify: {
    quoted: '“{title}”',
    by: 'Gönderen: {actor}',
    due: 'Son tarih: {date}',
    stage: 'Aşama: {stage}',
    request: {
      title: 'Onayınızı bekliyor: {doc}',
      delegated: '{actor} size bir onay devretti: {doc}',
    },
    question: {
      title: '{actor} bir soru sordu: {doc}',
      body: 'Belgeyi onaya geri döndürmek için yanıtlayın.',
    },
    answer: {
      title: '{actor} yanıtladı: {doc}',
      body: 'Belge yeniden onayınızda.',
    },
    approved: { title: 'Onaylandı: {doc}' },
    progress: { title: '“{stage}” aşaması onaylandı: {doc}' },
    rejected: { title: 'Reddedildi: {doc}' },
    returned: {
      title: 'Düzeltmeye geri gönderildi: {doc}',
      body: 'Değişiklikleri yapın ve yeniden gönderin.',
    },
    withdrawn: { title: 'Talep eden tarafından geri çekildi: {doc}' },
    reminder: { title: 'Hatırlatma: kararınızı bekliyor — {doc}' },
    overdue: { title: 'Gecikmiş: {doc}' },
    escalation: {
      title: 'Üst makama iletildi, süresi geçti: {doc}',
      waiting: 'Beklenen: {approvers}',
    },
    noApprovers: {
      title: 'Onaylayabilecek kimse yok: {doc}',
      body: '“{stage}” aşamasında etkin onaylayan yok. Onay akışını kontrol edin.',
    },
  },
};
