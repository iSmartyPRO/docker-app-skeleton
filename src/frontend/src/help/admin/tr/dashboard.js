export default {
  purpose: 'Pano, tüm modüllerden pencere öğeleri içeren kişisel bir sayfadır: görevlerim, toplantılar, dosyalar, talepler, stok ve rakamlar. Yönetici başlangıç düzenini belirler; herkes kendi düzenini değiştirebilir.',
  audience: 'Tüm çalışanlar; yöneticiler için — gün tek bakışta.',
  setup: [
    {
      title: 'Başlangıç düzeni',
      text: '[Ayarlar](/admin/settings/dashboard) bölümünde yeni kullanıcıların göreceği pencere öğesi setini oluşturun.',
    },
    {
      title: 'Kişisel düzenler',
      text: 'Kişilerin kendi düzenlerini değiştirmesine izin verin veya yasaklayın.',
    },
    {
      title: 'Ana sayfa yapın',
      text: '[Site erişimi](/admin/settings/access) bölümünde «Pano»yu seçin.',
    },
  ],
  roles: {
    'dashboard.admin': 'Başlangıç düzeni ve modül ayarları.',
  },
  scenarios: [
    {
      title: 'Bir yöneticinin sabahı',
      text: '«Beni bekleyenler», ekibin gecikmiş görevleri, bugünün toplantıları ve sözleşme tahsilatları tek ekranda.',
    },
    {
      title: 'Depo sorumlusu',
      text: 'Notlar ve grafikler yerine «Asgari seviyenin altında» ve «Kabul bekleyenler» pencere öğeleri.',
    },
  ],
  faq: [
    {
      q: 'Bir pencere öğesi kayboldu',
      a: 'Kapatılmış modüllerin veya kişinin kullanma izni olmadığı pencere öğeleri otomatik olarak gizlenir.',
    },
    {
      q: 'Başlangıç düzenini değiştirmek herkesi etkiler mi?',
      a: 'Yalnızca henüz kendi düzenini oluşturmamış olanları ve «Sıfırla»ya basanları.',
    },
  ],
};
