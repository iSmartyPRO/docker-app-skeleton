export default {
  purpose: 'Bilgi bankası; politikalar, nasıl yapılır kılavuzları ve şablonlardan oluşan bir kütüphanedir: istenen derinlikte klasörler, makaleler, dosyalar ve bağlantılar, tarayıcıda PDF ve Office önizlemeleri, klasör izinleri ve herkese açık bağlantılar.',
  audience: 'Herkes okur; departman editörleri (İK, hukuk, BT) kendi bölümlerini doldurur.',
  setup: [
    {
      title: 'Varsayılan görünüm',
      text: 'Kendi simgesi ve rengi olmayan klasörlerin simgesi ve rengi — [ayarlar](/admin/settings/kb) bölümünde.',
    },
    {
      title: 'Dosya türleri ve boyutu',
      text: 'Hangi dosya gruplarının yüklenebileceği ve en büyük boyut.',
    },
    {
      title: 'Yapı ve erişim',
      text: 'Her departman için bölümler oluşturun, editörlere kendi klasörlerinde düzenleme, diğer herkese görüntüleme izni verin.',
    },
    {
      title: 'Herkese açık bağlantılar',
      text: 'Materyaller şirket dışıyla paylaşılıyorsa bunlara izin verin; gerekirse parola zorunlu tutun.',
    },
  ],
  roles: {
    'kb.admin': 'Tüm klasörlere ve modül ayarlarına tam erişim.',
  },
  access: 'Erişim klasörler boyunca aşağıya devralınır; bir klasörün veya materyalin kendi erişimi olabilir.',
  scenarios: [
    {
      title: 'İşe alıştırma',
      text: '«İlk gününüz», «Kim ne yapar» sayfaları ve formlara bağlantılar içeren bir «Yeni başlayanlar» bölümü.',
    },
    {
      title: 'Sözleşme şablonları',
      text: 'Hukukçular bir şablon klasörü tutar; diğerleri yalnızca güncel sürümleri görür.',
    },
  ],
  faq: [
    {
      q: 'Word neden PDF olarak gösteriliyor?',
      a: 'Birebir düzen için bir belge sunucusu (Collabora) gerekir. Belge sunucusu yoksa basitleştirilmiş bir görünüm gösterilir.',
    },
    {
      q: 'Bilgi bankası dosyaları Dosyalar ile bağlantılı mı?',
      a: 'Evet, Dosyalar’da saklanırlar; bir dosya birkaç makalede görünebilir.',
    },
  ],
};
