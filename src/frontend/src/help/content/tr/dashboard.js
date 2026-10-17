export default {
  title: 'Pano',
  tagline: 'Gününüz tek bakışta: görevler, toplantılar, dosyalar ve rakamlar tek sayfada.',
  summary: 'Pano, portalın diğer modüllerinden önemli olanları pencere öğeleri olarak bir araya getirir. Onları galeriden ekleyin, düzenleyin ve boyutlandırın, filtrelerini ayarlayın — her şey otomatik olarak kaydedilir.',
  highlights: [
    {
      title: 'Her şey için pencere öğeleri',
      text: 'Görevler, ajanda, dosyalar, bilgi bankası, şirketler, saat, not ve daha fazlası.',
    },
    {
      title: 'Rakamlar ve grafikler',
      text: 'Görev istatistikleri ve eğilimleri, etkinlik — tek bakışta, seçtiğiniz dönem için.',
    },
    {
      title: 'Sürükleyin ve boyutlandırın',
      text: 'Bir pencere öğesini başlığından sürükleyin, sağ alt köşesinden boyutlandırın.',
    },
    {
      title: 'Kendi filtreleriniz',
      text: 'Her pencere öğesinin kendi başlığı ve ayarları vardır: proje, son tarih, dönem, takvimler.',
    },
    {
      title: 'Yalnızca görebildikleriniz',
      text: 'Pencere öğeleri verileri sizin izinlerinizle gösterir — hiçbir zaman modülün kendisinden fazlasını değil.',
    },
    {
      title: 'Kendiliğinden kaydedilir',
      text: 'Değişiklikler otomatik olarak kaydedilir ve tüm cihazlarınızda görünür.',
    },
  ],
  tips: [
    'Aynı pencere öğesini birkaç kez ekleyin — örneğin iki farklı proje için “Görevlerim”.',
    'Karıştırmamak için her kopyaya kendi başlığını verin: “Görevler · Web sitesi”, “Görevler · CRM”.',
    'Bir pencere öğesini yanlışlıkla mı kaldırdınız? Açılan bildirimde “Geri al”a tıklayın — 5 saniyeniz var.',
    'Pencere öğesinin ⋯ menüsünde hazır boyutlar bulunur: küçük, orta, büyük, geniş, tam genişlik.',
    '“Ajanda”da çevrimiçi bir toplantıdan 15 dakika önce “Katıl” düğmesi belirir.',
    'Kayboldunuz mu? “Özelleştir” → “Sıfırla” başlangıç setini geri getirir.',
  ],
  sections: [
    {
      title: 'Pencere öğeleri ve verileri',
      body: `Pencere öğesi, portal modüllerinden birinin verilerini içeren bir karttır:

- **Karşılama** — bugünün görevleri ve etkinlikleri, gecikmiş işler, geri sayımlı bir sonraki toplantı;
- **Görevlerim** — son tarihli açık görevler; tek tıklamayla tamamlayın, hızlıca yenisini ekleyin;
- **Görev istatistikleri** ve **Görev dinamikleri** — duruma, önceliğe, projeye ve güne göre grafikler;
- **Ajanda** ve **Ay** — toplantılar ve görev son tarihleri;
- **Son dosyalar**, **Dosya sunucusu**, **Bilgi bankası**, **Çevrimiçi kaynaklar**, **Şirketler**;
- **Bildirimler**, **Hızlı erişim**, **Dünya saati**, **Not**.

Veriler birkaç dakikada bir ve sekmeye döndüğünüzde yenilenir. Pencere öğeleri yalnızca modülün kendisinde görebildiklerinizi gösterir.`,
      note: 'Bir modül kapalıysa veya size açık değilse pencere öğeleri gösterilmez. Modül yeniden açıldığında yerlerine geri dönerler.',
    },
    {
      title: 'Galeriden pencere öğesi ekleme',
      body: `Galeri, size açık tüm pencere öğelerini kategorilere göre listeler: **Genel bakış**, **Görevler**, **Takvim**, **Dosyalar ve bilgi**, **İş**, **Araçlar** ve diğerleri. Her birinin önizlemesi ve kısa açıklaması vardır; arama da bulunur.

Yeni pencere öğesi panonun en üstünde görünür ve kısa bir süre vurgulanır.`,
      steps: [
        'Sayfanın üstündeki **“Pencere öğesi ekle”**ye tıklayın.',
        'Soldan bir kategori seçin veya aramaya bir ad yazın.',
        'Pencere öğesi kartına tıklayın — panoya eklenir.',
        'Uyarlamak için pencere öğesindeki ⚙ simgesini açın.',
      ],
      example: {
        title: 'İki projenin görevleri yan yana',
        body: 'Bir ekip lideri “Görevlerim”i iki kez ekler. Birincisinin ⚙ ayarlarında “Web sitesi” projesini seçer ve başlığını “Web sitesi” yapar; ikincisinde “CRM” projesini. Artık iki liste yan yana durur.',
      },
    },
    {
      title: 'Taşıma ve boyutlandırma',
      body: `**“Özelleştir”** modunda:

- **taşıma** — pencere öğesini başlığından sürükleyin;
- **boyutlandırma** — sağ alt köşeyi sürükleyin; boyut ızgaraya oturur ve sürüklerken gösterilir;
- **hazır boyutlar** — ⋯ menüsü → “Boyut”: küçük, orta, büyük, geniş, tam genişlik.

Geniş ekranlarda 12 sütunlu, tabletlerde 6 sütunlu bir ızgara vardır. Boşluklar kendiliğinden kapanır. Özelleştirme modundan çıkmak için **“Bitti”**ye tıklayın.`,
      note: 'Panonun üstündeki durum “Kaydediliyor…”, “Kaydedildi ✓” gösterir. Kaydet’e basmanız gerekmez.',
    },
    {
      title: 'Pencere öğesi ayarları ve filtreler',
      body: `**⚙** düğmesi bir pencere öğesinin ayarlarını açar. Her pencere öğesinin bir **Başlığı** vardır — kart için kendi adınız. Gerisi pencere öğesine bağlıdır:

- **Görevlerim** — kimin görevleri (benim / atanmamış / tümü), proje, son tarih, sıra, kaç tane, hızlı ekleme;
- **İstatistikler** ve **Dinamikler** — dönem (7, 30, 90 gün), ne gösterileceği, grafik türü;
- **Ajanda** ve **Ay** — ileriye dönük gün, takvimler, görev son tarihleri;
- **Çevrimiçi kaynaklar** — kategori ve görünüm (kutucuklar veya liste);
- **Dünya saati** — diğer şehirler (en fazla 6), 24/12 sa, analog saat;
- **Not** — renk.

Ayarlar penceresinde **“Kaydet”**e tıklayın — pencere öğesi hemen güncellenir.`,
      example: {
        title: 'Ekipte gecikenler',
        body: '“Lojistik” projesinin tüm gecikmiş görevlerini görmek için “Görevlerim”de **Kimin görevleri → Tümü**, **Proje → Lojistik**, **Son tarih → Gecikmiş**, **Sıra → Önceliğe göre** seçin ve pencere öğesine “Acil durum” başlığını verin.',
      },
    },
    {
      title: 'Çoğaltma, kaldırma, geri alma',
      body: `Özelleştirme modunda bir pencere öğesinin **⋯** menüsü:

- **Çoğalt** — aynı ayarlarla yanına bir kopya eklenir; başka bir filtreyle benzer bir pencere öğesi için kullanışlıdır;
- **Modülü aç** — verilerin geldiği modüle gidin;
- **Kaldır** — pencere öğesi kaybolur ve 5 saniye boyunca bir **“Geri al”** düğmesi görünür.

**“Sıfırla”** tüm pencere öğelerinizi, boyutlarınızı ve ayarlarınızı başlangıç setiyle değiştirir — portal önce sorar.`,
      note: 'Sıfırlama geri alınamaz. Emin değilseniz pencere öğelerini tek tek kaldırın.',
    },
    {
      title: 'Yöneticiden başlangıç seti',
      body: `Herhangi bir değişiklik yapana kadar **başlangıç setini** görürsünüz: karşılama, hızlı erişim, görevler, ajanda, istatistikler, bildirimler, ay, kaynaklar, bilgi bankası, dosyalar ve diğerleri. Kullanamadığınız modüllerin pencere öğeleri gizlenir.

Bir pano yöneticisi kendi panosunu, kendi panosu olmayan herkes için başlangıç panosu yapabilir: **“Özelleştir” → “Yönetim” → “Başlangıç düzeni yap”**. **“Yerleşik başlangıç düzenine dön”** bunu geri alır.

**Ayarlar → Modüller → Pano** bölümünde **“Kişisel panolar”** kapalıysa herkes başlangıç setini görür ve değiştiremez.`,
      steps: [
        'Panoyu herkesin görmesi gerektiği gibi düzenleyin.',
        '**“Özelleştir”** → **“Yönetim”**e tıklayın.',
        '**“Başlangıç düzeni yap”**ı seçin ve onaylayın.',
      ],
      example: {
        title: 'Yeni başlayanlar için pano',
        body: 'Yönetici “Karşılama”, “Çevrimiçi kaynaklar” ve “Bilgi bankası”nı üste, “Görevlerim” ve “Ajanda”yı alta yerleştirir ve bunu başlangıç seti yapar. Her yeni çalışan ilk günden doğru bağlantıları ve kılavuzları görür.',
      },
      note: 'Kendi panosu olan kişiler etkilenmez — “Sıfırla”ya tıklayana kadar.',
    },
    {
      title: 'Telefonda',
      body: `Dar ekranda pencere öğeleri bilgisayardakiyle aynı sırada **tek sütun** hâlinde dizilir. Telefonda genişlik değiştirilemez — düzenlemek büyük ekranda daha kolaydır.

Tüm cihazlarda tek bir panonuz vardır: bilgisayarda değiştirdiğiniz her şey telefonunuzda da olur.`,
    },
  ],
  faq: [
    {
      q: '“Özelleştir” düğmesi yok.',
      a: 'Yönetici **kişisel panoları** kapatmış — herkeste aynı başlangıç seti vardır.',
    },
    {
      q: 'Bir pencere öğesi neden galeride yok?',
      a: 'Modülü kapalıdır veya modüle erişiminiz yoktur. Örneğin “Kullanıcılar ve oturum açmalar” yalnızca kullanıcıları görüntüleme izni olanlar içindir.',
    },
    {
      q: 'Pencere öğesi tüm görevleri göstermiyor.',
      a: '⚙ içindeki filtreleri kontrol edin: **Kimin görevleri**, **Proje**, **Son tarih** ve **Gösterilecek sayı**. Pencere öğesi yalnızca Görevler’de görebildiğiniz görevleri gösterir.',
    },
    {
      q: 'İş arkadaşlarım panomu görür mü?',
      a: 'Hayır, pano kişiseldir. Ayrıca herkesin pencere öğeleri verileri kendi izinlerine göre gösterir.',
    },
    {
      q: 'Nasıl baştan başlarım?',
      a: '**“Özelleştir” → “Sıfırla”** başlangıç setini geri getirir. Pencere öğeleriniz ve ayarlarınız kaybolur.',
    },
    {
      q: '“Not”taki metin kaydediliyor mu?',
      a: 'Evet, not siz yazdıkça kaydedilir. Yalnızca siz görürsünüz.',
    },
    {
      q: 'Pano portalın adresinde açılabilir mi?',
      a: 'Evet, yönetici **Ayarlar → Site erişimi → Ana sayfa** bölümünde “Pano”yu seçerse.',
    },
  ],
  fields: {
    widgetTitle: {
      title: 'Başlık',
      text: 'Kart için kendi adınız. Boşsa — pencere öğesinin standart adı. Aynısından birkaç tane olduğunda kullanışlıdır.',
    },
    scope: {
      title: 'Kimin görevleri',
      text: '**Benim** — size atananlar; **Atanmamış** — henüz kimsenin olmayanlar; **Tümü** — görebildiğiniz her görev.',
    },
    period: {
      title: 'Dönem',
      text: 'Rakamların ve grafiğin kapsadığı son gün sayısı.',
    },
    gallery: {
      title: 'Pencere öğesi galerisi',
      text: 'Yalnızca size açık pencere öğeleri listelenir. Aynı pencere öğesi farklı ayarlarla birkaç kez eklenebilir.',
    },
    personalize: {
      title: 'Kişisel panolar',
      text: 'Açık — herkes kendi panosunu oluşturur. Kapalı — herkes başlangıç setini görür ve değiştiremez.',
    },
  },
};
