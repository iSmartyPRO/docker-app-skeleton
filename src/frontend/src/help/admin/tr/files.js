export default {
  purpose: 'Dosyalar, portalın bulut depolama alanıdır: herkesin kişisel dosyaları, departman alanları, paylaşım ve parolalı, süreli herkese açık bağlantılar. Bilgi bankası da materyallerini burada tutar.',
  audience: 'Tüm çalışanlar; dosya yöneticisi alanları, kotaları ve bağlantı politikasını yönetir.',
  setup: [
    {
      title: 'Sınırlar',
      text: '[Ayarlar](/admin/settings/files) bölümünde: en büyük dosya boyutu, kişisel kota, çöp kutusunda saklama süresi, izin verilen dosya türleri.',
    },
    {
      title: 'Herkese açık bağlantı politikası',
      text: 'Bağlantılara izin verilip verilmediği, parolanın zorunlu olup olmadığı, en uzun geçerlilik süresi, ziyaretçilerin dosya yükleyip yükleyemeyeceği.',
    },
    {
      title: 'Paylaşılan alanlar',
      text: 'Bunları kimin oluşturacağına (herkes veya yöneticiler) karar verin ve grup erişimli departman alanları oluşturun.',
    },
    {
      title: 'Office belgesi önizlemeleri',
      text: 'Birebir önizleme ve çevrimiçi düzenleme için bir [belge sunucusu](/admin/settings/documents) (Collabora) bağlayın.',
    },
  ],
  roles: {
    'files.admin': 'Diğerlerine izin verilmediğinde paylaşılan alan oluşturma, tüm alanları ve modül ayarlarını yönetme. Başkalarının kişisel dosyalarını açma izni vermez.',
  },
  access: 'Erişim bir alan, klasör veya dosya üzerinde ayarlanır: görüntüleme, düzenleme, yönetme — bir kullanıcı, grup veya rol için.',
  scenarios: [
    {
      title: 'Müşteriyle dosya alışverişi',
      text: 'Bir satış temsilcisi «Müşteri için» klasörüne parolalı, 14 gün geçerli ve yükleme izinli bir bağlantı oluşturur — müşteri belgeleri e-posta olmadan gönderir.',
    },
    {
      title: 'Muhasebe alanı',
      text: 'Alan, «Muhasebe» grubuna düzenleme, yönetime ise görüntüleme için açıktır.',
    },
  ],
  faq: [
    {
      q: 'Dosyalar nerede saklanıyor?',
      a: 'Portal sunucusunun yükleme klasöründe; yalnızca erişim kontrolünden sonra sunulur.',
    },
    {
      q: 'Herkese açık bağlantılar kapatılırsa ne olur?',
      a: 'Mevcut tüm bağlantılar anında çalışmayı durdurur.',
    },
    {
      q: 'Silinen bir dosya geri yüklenebilir mi?',
      a: 'Evet, saklama süresi içinde çöp kutusundan.',
    },
  ],
};
