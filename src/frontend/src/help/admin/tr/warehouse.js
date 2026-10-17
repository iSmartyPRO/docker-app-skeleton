export default {
  purpose: 'Depo, operasyonel stok takibidir: barkodlu stok kartları, depolar ve lokasyonlar, girişler, çıkışlar, transferler, hurdaya ayırmalar, tekil parça bazında aletler, telefondan sayım. Muhasebe kaydı değildir: veriler muhasebe sistemine aktarılır.',
  audience: 'Depo sorumluları, şantiye şefleri, tedarik ve muhasebe.',
  setup: [
    {
      title: 'Modülü açın',
      text: 'Varsayılan olarak kapalıdır; hurdaya ayırmalar Onaylar üzerinden onaylanır.',
    },
    {
      title: 'Depolar ve sorumlular',
      text: 'Depoları oluşturun, sorumlu depo görevlilerini atayın ve gerekirse lokasyonları tanımlayın.',
    },
    {
      title: 'Stok kartları',
      text: 'Excel’den içe aktarın veya elle oluşturun: birimler, ambalajlar, barkodlar, minimum stok.',
    },
    {
      title: 'Para birimi ve eşikler',
      text: 'Temel para birimi, kurlar ve hurdaya ayırma onay eşiği — [ayarlar](/admin/settings/warehouse) bölümünde.',
    },
    {
      title: 'Bağlantılar',
      text: 'Satın alma ile girişler talepleri izler; Master plan ile çıkışlar projelere gider.',
    },
  ],
  roles: {
    'warehouse.view': 'Tüm depolardaki stoku görüntüleme.',
    'warehouse.request': 'Malzeme talebi oluşturma.',
    'warehouse.operate': 'Belgeleri kaydetme (giriş, çıkış, transfer).',
    'warehouse.writeoff': 'Hurdaya ayırmalar.',
    'warehouse.inventory': 'Sayım oturumları.',
    'warehouse.cost': 'Tutarları ve maliyeti görme; bu izin olmadan parasal değerler gizlenir.',
    'warehouse.backdate': 'Geriye tarihli belgeler.',
    'warehouse.admin': 'Ayarlar, rehberler ve diğer her şey.',
  },
  access: 'İzinler geneldir (bir izin) veya depo bazındadır (bir atama); bir deponun sorumlusu o depo üzerinde izinlere sahiptir.',
  scenarios: [
    {
      title: 'Talepten giriş',
      text: 'Onaylanmış bir satın alma talebi için teslimat: depo sorumlusu malları tarar ve girişi telefondan kaydeder.',
    },
    {
      title: 'Şantiyeye alet',
      text: 'Bir matkap iade tarihiyle bir şantiye şefine çıkış yapılır; geciken iadeler bir pencere öğesinde ve bildirimlerde görünür.',
    },
  ],
  faq: [
    {
      q: 'Stok eksiye düşebilir mi?',
      a: 'Hayır, yeterli stok olmadan belge reddedilir.',
    },
    {
      q: 'Veriler muhasebeye nasıl ulaşır?',
      a: 'CSV dışa aktarmaları ve API aracılığıyla.',
    },
  ],
};
