export default {
  notify: {
    clearance: {
      expired: 'süresi doldu: {date}',
      today: 'süresi bugün doluyor',
      expires: 'süresi doluyor: {date} ({days} gün kaldı)',
      own: 'Yetki belgeniz «{clearance}» — {state}',
      other: 'Yetki belgesi «{clearance}»: {employee} — {state}',
      ownBody: 'Yenilemek için insan kaynaklarına başvurun.',
      otherBody: 'Belgeyi yenileyin veya kişiyi bu belgeyi gerektiren işlerden uzak tutun.',
    },
  },
  csv: {
    head: ['Soyadı', 'Adı', 'İkinci adı', 'Pozisyon', 'Birim', 'Şantiye', 'Durum', 'İş e-postası', 'İş telefonu', 'Cep telefonu'],
    hrHead: ['Sicil numarası', 'İstihdam türü', 'İşe giriş tarihi', 'İşten çıkış tarihi', 'Portal hesabı'],
    status: { active: 'Çalışıyor', vacation: 'İzinde', terminated: 'İşten ayrıldı', candidate: 'Aday' },
    employment: { staff: 'Kadrolu', part_time: 'Yarı zamanlı', contractor: 'Sözleşmeli', seasonal: 'Mevsimlik' },
  },
};
