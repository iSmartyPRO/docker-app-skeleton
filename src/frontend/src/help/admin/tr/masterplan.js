export default {
  purpose: 'Master plan bir konut projesini bütün olarak gösterir: tıklanabilir sınırlarıyla vaziyet planı, binaların daire tablosu, bağımsız bölüm kaydı, süreli rezervasyonlu satış durumları, geçmişiyle fiyatlar ve fotoğraflı raporlarla inşaat ilerlemesi.',
  audience: 'Geliştirici firmalar: satış, finans, hukuk, inşaat, pazarlama ve yönetim.',
  setup: [
    {
      title: 'Modülü açın',
      text: 'Varsayılan olarak kapalıdır.',
    },
    {
      title: 'Proje oluşturun',
      text: 'Vaziyet planı arka planını yükleyin, sınırları çizin, binaları, girişleri, katları ve bağımsız bölümleri ekleyin (veya içe aktarın).',
    },
    {
      title: 'Roller',
      text: 'masterplan.* izinlerini roller aracılığıyla verin veya bir projede bölgeye (alt ağaca) bağlı bir rol atayın.',
    },
    {
      title: 'Satış',
      text: '[Ayarlar](/admin/settings/masterplan) bölümünde: durumlar, rezervasyon süreleri, para birimleri, satış müdürünün indirim sınırı.',
    },
    {
      title: 'CRM',
      text: 'Bağımsız bölümleri fırsatlara ve alıcılara bağlamak için CRM’i ve Cari hesapları açın.',
    },
  ],
  roles: {
    'masterplan.admin': 'Yapı ve ayarlar dahil her şey.',
    'masterplan.sales': 'Rezervasyonlar ve bağımsız bölüm satışları.',
    'masterplan.foreman': 'İnşaat ilerlemesi ve fotoğraflı raporlar.',
  },
  scenarios: [
    {
      title: 'Daire rezervasyonu',
      text: 'Bir satış temsilcisi bir CRM fırsatından bir bağımsız bölümü 3 günlüğüne rezerve eder; süre dolduğunda bölüm serbest kalır.',
    },
    {
      title: 'İnşaat raporu',
      text: 'Bir şantiye şefi kat ilerlemesini işaretler ve «Kuzey Mahallesi» şantiyesinden fotoğraflar ekler.',
    },
  ],
  faq: [
    {
      q: 'Fiyatları kim görür?',
      a: 'Role bağlıdır: alanlar sunucuda gizlenir.',
    },
    {
      q: 'CRM olmadan?',
      a: 'Evet, ancak bağımsız bölümler fırsatlara bağlanamaz.',
    },
  ],
};
