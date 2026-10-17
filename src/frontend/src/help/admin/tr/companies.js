export default {
  purpose: 'Cari hesaplar, şirketlerin ve kişilerin tek rehberidir: vergi numarasıyla kamu sicillerinden alınan bilgiler, çalışanlar ve kariyerleri, değişiklik geçmişi ve puan. CRM, satın alma, sözleşmeler, depo ve master plan bu rehberi kullanır.',
  audience: 'Satış, satın alma, hukuk ve muhasebe.',
  setup: [
    {
      title: 'Ülkeler',
      text: '[Ayarlar](/admin/settings/companies) bölümünde varsayılan ülkeyi ve listeyi seçin — her ülkenin kendi kimlik numaraları ve sicili vardır.',
    },
    {
      title: 'Şirket rolleri',
      text: 'Müşteri, tedarikçi, iş ortağı… — bunları yeniden adlandırın veya renkli kendi rollerinizi ekleyin.',
    },
    {
      title: 'Özel alanlar',
      text: 'Şirketler ve kişiler için ek alanlar; isterseniz yalnızca bazı ülkeler için.',
    },
    {
      title: 'Kimler düzenleyebilir',
      text: '«Herkes» veya «Sahipler» (sorumlu kişi, oluşturan ve yöneticiler).',
    },
  ],
  roles: {
    'companies.admin': 'Herhangi bir kartı düzenleme ve kalıcı olarak silme, modül ayarları.',
  },
  scenarios: [
    {
      title: 'Yeni tedarikçi',
      text: 'Satın almacı vergi numarasını girer — kart sicilden doldurulur ve mükerrer kayıtlar otomatik olarak bulunur.',
    },
    {
      title: 'Bir kişi iş değiştirdi',
      text: 'Kişi yeni bir pozisyon alır — eski şirketteki geçmişi korunur.',
    },
  ],
  faq: [
    {
      q: 'Cari hesaplar olmadan CRM’e ne olur?',
      a: 'CRM çalışmaya devam eder, ancak müşteriler rehberden seçilemez.',
    },
    {
      q: 'Kartlar silinir mi?',
      a: 'Genellikle arşivlenir; yalnızca modül yöneticisi kalıcı olarak silebilir.',
    },
  ],
};
