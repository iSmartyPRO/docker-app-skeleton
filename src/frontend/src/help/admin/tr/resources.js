export default {
  purpose: 'Çevrimiçi kaynaklar, şirket hizmetlerine bağlantı veren kutucuklardan oluşan bir panodur: e-posta, CRM, formlar, web sitesi ve portal modülleri. İyi bir ana sayfadır: misafirler herkese açık bağlantıları, çalışanlar kendi bağlantılarını görür.',
  audience: 'Tüm çalışanlar ve açık bir portalın misafirleri; kaynak yöneticisi doldurur.',
  setup: [
    {
      title: 'Kaynak ekleyin',
      text: 'Bir bağlantı veya bir portal modülü, bir simge, iki dilde başlık ve açıklama, bir kategori.',
    },
    {
      title: 'Görünürlüğü ayarlayın',
      text: 'Misafirler herkese açık kaynakları görür; diğerleri rollere ve gruplara göre görünür.',
    },
    {
      title: 'Ana sayfa yapın',
      text: '[Site erişimi](/admin/settings/access) bölümünde ana sayfa olarak «Çevrimiçi kaynaklar»ı seçin.',
    },
    {
      title: 'Görünüm',
      text: 'Başlık, alt başlık, kutucuk yoğunluğu, arama ve kişisel düzenler — [ayarlar](/admin/settings/resources) bölümünde.',
    },
  ],
  roles: {
    'resources.admin': 'Kaynakları ve kategorileri ekleme, düzenleme ve sıralama.',
  },
  scenarios: [
    {
      title: 'Ofis başlangıç sayfası',
      text: 'Ana sayfada e-posta, muhasebe, bilgi bankası ve BT talepleri bulunur; herkes kutucukları kendine göre düzenler.',
    },
    {
      title: 'Misafirler için herkese açık bağlantılar',
      text: 'Açık bir portal misafirlere web sitesini ve bir iletişim formunu, çalışanlara ise oturum açtıktan sonra iç hizmetleri gösterir.',
    },
  ],
  faq: [
    {
      q: 'Bir modül kutucuğu kayboldu',
      a: 'Modül kutucuğu, modül kapalıyken gizlenir ve modül açıldığında geri gelir.',
    },
    {
      q: 'Kişisel düzenler sıfırlanır mı?',
      a: 'Hayır. Yeni kaynaklar sona eklenir, kaldırılanlar yalnızca kaybolur.',
    },
  ],
};
