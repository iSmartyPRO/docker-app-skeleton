export default {
  groups: {
    console: 'Konsol',
    people: 'Kişiler ve erişim',
    audit: 'Denetim',
    settings: 'Ayarlar',
    module_kb: 'Bilgi bankası',
    module_tasks: 'Görevler',
    module_calendar: 'Takvim',
    module_files: 'Dosyalar',
    module_drive: 'Dosya sunucusu',
    module_dashboard: 'Pano',
    module_chat: 'Sohbetler',
    api: 'API',
    module_resources: 'Çevrimiçi kaynaklar',
    module_qr: 'QR kodları',
    module_companies: 'Cari hesaplar',
    module_crm: 'CRM',
    module_masterplan: 'Master plan',
    module_approvals: 'Onaylar',
    module_contracts: 'Modül: Sözleşmeler',
    module_procurement: 'Satın alma',
    module_warehouse: 'Depo',
    module_org: 'Organizasyon yapısı',
    module_employees: 'Çalışanlar',
    module_directory: 'AD dizini',
  },
  console_access: {
    title: 'Yönetim konsolunu açma',
    desc: '/admin içindeki her iş için gereklidir.',
  },
  users_view: {
    title: 'Kullanıcıları görüntüleme',
    desc: 'Hesapları, grupları ve rolleri görme.',
  },
  users_manage: {
    title: 'Kullanıcıları yönetme',
    desc: 'Hesap oluşturma, profil düzenleme, parola sıfırlama, engelleme, kendinde olan grupları ve rolleri atama.',
  },
  users_delete: {
    title: 'Kullanıcıları silme',
    desc: 'Hesapları kalıcı olarak kaldırma.',
  },
  groups_manage: {
    title: 'Grupları yönetme',
    desc: 'Grup oluşturma, rollerini ve üyelerini belirleme.',
  },
  roles_manage: {
    title: 'Rolleri yönetme',
    desc: 'Rol oluşturma ve hangi izinleri verdiklerini değiştirme.',
  },
  activity_view: {
    title: 'Günlüğü görüntüleme',
    desc: 'Güvenlik olayları ve oturum açma geçmişi.',
  },
  settings_view: {
    title: 'Ayarları görüntüleme',
    desc: 'Tüm ayar ekranlarını değiştirmeden okuma.',
  },
  settings_general: {
    title: 'Marka ve görünüm',
    desc: 'Ad, logolar, tema, tipografi, simgeler.',
  },
  settings_security: {
    title: 'Güvenlik ilkesi',
    desc: 'Site erişimi, kilitlemeler, oturumlar, IP filtreleme.',
  },
  settings_auth: {
    title: 'Oturum açma yöntemleri',
    desc: 'Parola, Active Directory, Telegram, tek kullanımlık kodlar.',
  },
  settings_integrations: {
    title: 'Entegrasyonlar',
    desc: 'E-posta, Telegram, WhatsApp, Wazzup, Active Directory.',
  },
  settings_system: {
    title: 'Sistem',
    desc: 'API istek sınırları ve çalışma ortamı bilgileri.',
  },
  settings_modules: {
    title: 'Modüller',
    desc: 'Modülleri açma veya kapatma ve sistem ayarlarını değiştirme.',
  },
  kb_admin: {
    title: 'Bilgi bankası yöneticisi',
    desc: 'Klasör erişiminden bağımsız olarak tüm klasör ve materyallere tam erişim.',
  },
  tasks_admin: {
    title: 'Görev yöneticisi',
    desc: 'Proje erişiminden bağımsız olarak tüm projeleri, görevlerini ve erişimlerini yönetme.',
  },
  calendar_admin: {
    title: 'Takvim yöneticisi',
    desc: 'Tüm paylaşılan takvimleri ve erişimlerini yönetme. Kişisel takvimler gizli kalır.',
  },
  files_admin: {
    title: 'Dosya yöneticisi',
    desc: 'Tüm paylaşılan alanları ve erişimlerini yönetme. Kişisel dosyalar gizli kalır.',
  },
  drive_admin: {
    title: 'Dosya sunucusu yöneticisi',
    desc: 'Dosya sunucuları ve klasörler ekleme, tüm herkese açık bağlantıları görme. İçeriğe erişime yine sunucu karar verir.',
  },
  drive_audit: {
    title: 'Dosya sunucusu etkinlik günlüğü',
    desc: 'Dosya sunucusunda kimin neyi açtığını, indirdiğini, değiştirdiğini veya sildiğini görme ve günlüğü dışa aktarma.',
  },
  drive_access: {
    title: 'Dosya sunucusu: klasör erişim grupları (sistem yöneticisi)',
    desc: 'Dosya sunucusu → «Erişim»: korumalı kök gruplar dışında klasör güvenlik gruplarına (sg_…) kişi ekleme ve çıkarma. Değişiklikler yöneticinin kendi AD hesabıyla yapılır.',
  },
  dashboard_admin: {
    title: 'Pano yöneticisi',
    desc: 'Herkesin, kendi düzenini yapana kadar göreceği başlangıç panosunu belirleme.',
  },
  chat_admin: {
    title: 'Sohbet yöneticisi',
    desc: 'Sınırlandırıldığında grup sohbeti oluşturma, herhangi bir mesajı silme.',
  },
  api_tokens: {
    title: 'Kişisel API belirteçleri',
    desc: 'Kendi izinlerinizle, kapsamlarla daraltılmış olarak çalışan belirteçler oluşturma.',
  },
  api_admin: {
    title: 'API yönetimi',
    desc: 'Herkesin belirteçleri, erişim şablonları, web kancaları, istek günlüğü ve API ayarları.',
  },
  resources_admin: {
    title: 'Çevrimiçi kaynakları yönetme',
    desc: 'Kaynak ekleme, düzenleme ve sıralama; her birini kimlerin göreceğini seçme.',
  },
  qr_admin: {
    title: 'QR şablonlarını yönet',
    desc: 'Kullanıcıların seçtiği şablonları hazırlar, kurumsal renkleri ve logoyu kilitler.',
  },
  companies_admin: {
    title: 'Cari hesap yöneticisi',
    desc: 'Herhangi bir kartı değiştirme, kalıcı olarak silme ve modülü yapılandırma.',
  },
  crm_admin: {
    title: 'CRM yöneticisi',
    desc: 'Ayarlar, satış hatları ve aşamalar; tüm fırsatları görür ve düzenler.',
  },
  crm_all: {
    title: 'Tüm fırsatlar',
    desc: 'Sorumlusu kim olursa olsun tüm fırsatları görür ve düzenler.',
  },
  masterplan_admin: {
    title: 'Yönetici',
    desc: 'Her şey: hiyerarşi, vaziyet planları, ekip, rehberler, rezervasyon kuralları.',
  },
  masterplan_executive: {
    title: 'Üst yönetim',
    desc: 'Asgari fiyatlar ve para dahil her şeyi görür; satışları kapatır / açar, durumları geri alır, fiyatları sınırsız değiştirir.',
  },
  masterplan_sales_head: {
    title: 'Satış müdürü',
    desc: 'Bölgedeki tüm satışlar: ön rezervasyonlar, rezervasyonlar, uzatmalar, serbest bırakmalar, sözleşmeler, gerekçeli geri almalar; sınır dahilinde fiyatlar; asgari fiyatları görür.',
  },
  masterplan_sales: {
    title: 'Satış temsilcisi',
    desc: 'Boştaki bölümlere ön rezervasyon ve rezervasyon yapar, kendi rezervasyonunu bir kez uzatır, kendi rezervasyonunu gerekçeyle serbest bırakır; yalnızca kendi rezervasyonlarının müşterilerini görür.',
  },
  masterplan_finance: {
    title: 'Finans',
    desc: 'Kaparoları ve tam ödemeyi onaylar (Rezervasyon → Kaparo, Sözleşme → Satıldı); tutarları görür.',
  },
  masterplan_legal: {
    title: 'Hukuk',
    desc: 'Sözleşmeler (numara ve tarih) ve teslim tutanakları; müşterileri ve tutarları görür.',
  },
  masterplan_construction_head: {
    title: 'İnşaat müdürü',
    desc: 'Bölgedeki inşaat: aşamalar, günlük, moderasyon; durumları müşteri ve tutar olmadan görür; teslim eder.',
  },
  masterplan_foreman: {
    title: 'Şantiye şefi',
    desc: 'Yalnızca kendi bölgesinde raporlar ve aşama ilerlemesi; satış verisi yok.',
  },
  masterplan_marketing: {
    title: 'Pazarlama',
    desc: 'Bağımsız bölümlerin medyası ve özellikleri; müşteriler olmadan durumlar ve fiyatlar.',
  },
  approvals_admin: {
    title: 'Onay yöneticisi',
    desc: 'Tüm belge türlerinin onay akışları, aciliyet düzeyleri, herkesin vekilleri; tüm onayları görür ve yönetir.',
  },
  contracts_create: {
    title: 'Sözleşme oluşturma',
    desc: 'Sözleşmeleri kayda ekleme ve onaya gönderme.',
  },
  contracts_view_all: {
    title: 'Tüm sözleşmeleri görme',
    desc: 'Yönetim: tüm kayıt. Diğerleri kendi sözleşmelerini, grubunun sözleşmelerini ve onayladıklarını görür.',
  },
  contracts_legal: {
    title: 'Hukukçu',
    desc: 'Tüm sözleşmeler; riskler; sözleşmeleri imzalandı, yürürlükte, tamamlandı ve feshedildi olarak işaretler.',
  },
  contracts_admin: {
    title: 'Sözleşme yöneticisi',
    desc: 'Ayarlar, sözleşmelerin onay akışı, hukukçunun yapabildiği her şey.',
  },
  contracts_finance: {
    title: 'Finans (sözleşmeler)',
    desc: 'Kaparoları onaylar, tahsilatları kaydeder, tahsilat kaydı. Kaparosu veya ödeme planı olan sözleşmeleri görür.',
  },
  procurement_create: {
    title: 'Satın alma talebi oluşturma',
    desc: 'Modül ayarlarında «herkes talep oluşturabilir» kapalıyken gereklidir.',
  },
  procurement_view_all: {
    title: 'Tüm talepleri görme',
    desc: 'Yönetim: tüm talepler ve özetleri. Diğerleri kendi taleplerini, gruplarının taleplerini ve onayladıklarını görür.',
  },
  procurement_pay: {
    title: 'Muhasebe: ödemeler',
    desc: 'Ödeme kaydı, ödemeleri ödeme talimatlarıyla işaretleme; onaylanan talepleri görür.',
  },
  procurement_admin: {
    title: 'Satın alma yöneticisi',
    desc: 'Kategoriler, para birimleri, numaralandırma, onay akışı; tüm talepleri yönetir.',
  },
  warehouse_view: {
    title: 'Stoku görme',
    desc: 'Tutarlar olmadan stok ve kullanılabilirlik, «aletlerim», kendi belgeleri. Tüm depolarda (veya atamayla depo bazında).',
  },
  warehouse_request: {
    title: 'Malzeme talebi oluşturma',
    desc: 'Çıkış talebi oluşturma (taslak → depo sorumlusu).',
  },
  warehouse_operate: {
    title: 'Depo sorumlusu',
    desc: 'Giriş, çıkış, transfer ve iadeleri oluşturma ve kaydetme.',
  },
  warehouse_writeoff: {
    title: 'Hurdaya ayırma',
    desc: 'Hurdaya ayırmalar (eşiğin üzerinde onayla).',
  },
  warehouse_inventory: {
    title: 'Sayım',
    desc: 'Stok sayımları ve tutanaklar.',
  },
  warehouse_cost: {
    title: 'Maliyetleri ve tutarları görme',
    desc: 'Her ekranda, raporda, dışa aktarmada ve API yanıtında maliyet ve tutarlar.',
  },
  warehouse_backdate: {
    title: 'Geçmiş tarihli belgeler',
    desc: 'Açık dönem içinde geçmiş tarihli belgeler.',
  },
  warehouse_admin: {
    title: 'Depo yöneticisi',
    desc: 'Rehberler, depolar, lokasyonlar, normlar, düzeltmeler, ayarlar.',
  },
  org_manage: {
    title: 'Organizasyon yapısını yönetme',
    desc: 'Birimleri düzenleme ve taşıma, yönetici atama, birim türleri ve amaçları, hesapları birimlere yerleştirme.',
  },
  employees_view: {
    title: 'Çalışan rehberi',
    desc: 'Çalışan kişilerin adları, pozisyonları, birimleri, şantiyeleri ve iş iletişim bilgileri.',
  },
  employees_hr: {
    title: 'İK: çalışanlarla ilgili her şey',
    desc: 'Tüm kartlar ve durumlar, kişisel iletişim bilgileri ve doğum günleri, belgeler, yetki belgeleri, İK notları; kart ve portal hesabı oluşturma.',
  },
  employees_admin: {
    title: 'Çalışanlar yöneticisi',
    desc: 'Pozisyon rehberi ve modül ayarları.',
  },
  ad_view: {
    title: 'AD dizini: görüntüleme',
    desc: 'Yönetilen kök altındaki OU’ları, kullanıcıları, grupları ve bilgisayarları, günlüğü inceleme.',
  },
  ad_manage: {
    title: 'AD dizini: hesapları yönetme',
    desc: 'Kullanıcı oluşturma, öznitelik düzenleme, taşıma, etkinleştirme / devre dışı bırakma, kilit açma, grup üyeliği (klasör erişim grupları hariç). Yöneticinin kendi AD hesabıyla çalışır.',
  },
  ad_passwords: {
    title: 'AD dizini: parola sıfırlama',
    desc: 'Parolaları sıfırlama («sonraki oturum açışta değiştirmeli» ile) ve hesapların kilidini açma. LDAPS veya StartTLS gerekir.',
  },
  ad_admin: {
    title: 'AD dizini: yönetici',
    desc: 'Korumalı (yönetici) hesaplar dahil modüldeki her şey.',
  },
};
