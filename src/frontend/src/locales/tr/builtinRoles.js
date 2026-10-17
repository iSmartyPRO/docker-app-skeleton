export default {
  superadmin: {
    name: 'Süper yönetici',
    desc: 'Roller, güvenlik, oturum açma yöntemleri ve sistem ayarları dahil tam erişim.',
  },
  admin: {
    name: 'Yönetici',
    desc: 'Günlük işler: kullanıcılar, gruplar, kurumsal görünüm ve entegrasyonlar.',
  },
  moderator: {
    name: 'Moderatör',
    desc: 'Kullanıcılara yardım eder: profilleri düzenler, parolaları sıfırlar, hesapları engeller.',
  },
  auditor: {
    name: 'Denetçi',
    desc: 'Kullanıcılar, günlük ve ayarlara salt okunur erişim.',
  },
  user: {
    name: 'Kullanıcı',
    desc: 'Yalnızca kişisel alan.',
  },
};
