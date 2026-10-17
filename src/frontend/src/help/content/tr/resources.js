export default {
  title: 'Çevrimiçi kaynaklar',
  tagline: 'Tüm şirket hizmetleri — e-posta, CRM, İK formları, web sitesi — kutucuklar hâlinde tek yerde.',
  summary: 'Çevrimiçi kaynaklar, iş hizmetlerine giden bağlantılardan oluşan bir panodur. İhtiyacınız olanı arayarak veya kategoriye göre bulun ve kutucukları kendinize göre düzenleyin. Çoğu zaman portalın adresinde açılan sayfa budur.',
  highlights: [
    {
      title: 'Bir tık uzakta',
      text: 'E-posta, CRM, bilgi bankası ve diğer hizmetler, anlaşılır simgeli kutucuklar olarak.',
    },
    {
      title: 'Arama ve kategoriler',
      text: 'Başlığa, açıklamaya veya adrese göre arayın; kategori çipleriyle filtreleyin.',
    },
    {
      title: 'Kendi düzeniniz',
      text: 'Kutucukları istediğiniz sıraya sürükleyin, ihtiyacınız olmayanları gizleyin — bunu yalnızca siz görürsünüz.',
    },
    {
      title: 'Her cihazda',
      text: 'Oturum açtığınızda düzeniniz sunucuda tutulur ve bilgisayarda ve telefonda aynıdır.',
    },
    {
      title: 'Herkese doğru bağlantılar',
      text: 'Bir kaynağı kimin göreceğine yönetici karar verir: herkes, çalışanlar veya seçilen kişiler.',
    },
    {
      title: 'Kendi dilinizde',
      text: 'Yönetici başlıkları ve açıklamaları kullandığınız dilde yazdıysa bunlar o dilde görünür.',
    },
  ],
  tips: [
    '“Kaynak bul” alanına yazmaya başlayın — kutucuklar anında filtrelenir.',
    'Kutucuktaki ↗ işareti bağlantının yeni sekmede açıldığı anlamına gelir.',
    'Bir kutucuğu yanlışlıkla mı gizlediniz? “Özelleştir” → “Gizli” → geri getirmek için kutucuğa tıklayın.',
    'Düzeninizin yalnızca bu tarayıcıda değil, her cihazda sizinle olması için oturum açın.',
    'En çok kullandığınız hizmetleri ilk satıra koyun — portal açılır açılmaz görünürler.',
    'Bir hizmet eksik mi? Portal yöneticisinden onu kataloğa eklemesini isteyin.',
  ],
  sections: [
    {
      title: 'Kutucuklar',
      body: `Her kaynak; simgesi, başlığı, kısa açıklaması ve adresi olan bir kutucuktur.

- Adresin yanındaki **↗** — bağlantı yeni sekmede açılır ve portal açık kalır.
- **Portal modüllerinin** kutucukları (Görevler, Takvim, Bilgi bankası ve diğerleri) doğrudan burada, portalda açılır.
- Bir portal modülü kapatılırsa kutucuğu kaybolur ve modül yeniden açıldığında geri gelir.

Kutucukların üstünde günün saatine göre bir karşılama bulunur. Yönetici sıkışık kutucukları seçebilir ve açıklamaları gizleyebilir.`,
    },
    {
      title: 'Arama ve kategoriler',
      body: `**“Kaynak bul”** alanı başlıklarda, açıklamalarda ve adreslerde arar. Kutucukların üstündeki kategori çipleri (örneğin “İş”, “İK”, “BT”) yalnızca o kategoriyi bırakır; **“Tümü”** filtreyi temizler.

Arama ve kategoriler birlikte kullanılabilir.`,
      example: {
        title: 'İzin formunu bulma',
        body: '**“İK”** kategorisine tıklayın ve “izin” yazın — kelime yalnızca açıklamasında geçse bile “İzin talebi” kutucuğu kalır.',
      },
      note: 'Arama ve kategorileri görmüyorsanız yönetici bunları modül ayarlarında kapatmıştır.',
    },
    {
      title: 'Kendi düzeniniz',
      body: `**“Özelleştir”** düğmesi düzenleme modunu açar. Orada şunları yapabilirsiniz:

- kutucukları fareyle veya telefonda kısa bir basıştan sonra sürükleyin;
- klavyeyle yeniden sıralayın;
- ihtiyacınız olmayanları **“Gizle”** ile gizleyin — gizli kutucuklar **“Gizli”** bloğunda toplanır;
- **“Varsayılana sıfırla”** ile yöneticinin sırasına dönün.

Bitirdiğinizde **“Bitti”**ye tıklayın. Düzeninizi yalnızca siz görürsünüz.`,
      steps: [
        'Kutucukların üstündeki **“Özelleştir”**e tıklayın.',
        'Kutucukları istediğiniz sıraya sürükleyin.',
        'İhtiyacınız olmayan kutucuklarda **“Gizle”**ye tıklayın.',
        '**“Bitti”**ye tıklayın — düzen kaydedilir.',
      ],
      example: {
        title: 'Bir muhasebeci panoyu ayarlıyor',
        body: 'Maria “1C”, “Banka müşteri sistemi” ve “E-posta”yı ilk satıra koyar ve “Şirket web sitesi” ile “Geliştirici wiki”sini gizler. Sabah portalı dizüstü bilgisayarında açar ve dün işte gördüğü panonun aynısını görür.',
      },
      note: '**Düzen nerede tutulur.** Oturum açtıysanız — sunucuda, her cihazda. Konuklar için — yalnızca bu tarayıcıda. Yeni kaynaklar düzeninizin sonunda görünür; kaldırılanlar yalnızca kaybolur.',
    },
    {
      title: 'Hangi kaynağı kim görür',
      body: `Her kaynağın bir **“Kimler görür”** ayarı vardır:

- **Herkes** — site açıksa oturum açmamış konuklar dahil;
- **Çalışanlar** — oturum açmış herkes;
- **Seçilenler** — seçilen kullanıcılar, gruplar ve roller.

**“Göster”** anahtarı bir kaynağı silmeden herkesten gizler. Kaynak yöneticileri her şeyi görür.`,
      example: {
        title: 'Yalnızca satış ekibi için bir bağlantı',
        body: 'Yönetici “CRM”i ekler, **“Seçilenler”**i işaretler ve “Satış” grubunu seçer. Satış temsilcileri kutucuğu görür; diğer çalışanlar ve konuklar görmez.',
      },
      note: 'Bir iş arkadaşınızın gördüğü bir kaynağı göremiyor musunuz? Muhtemelen bir grupla sınırlıdır — yöneticiye sorun.',
    },
    {
      title: 'Simgeler',
      body: `Simge, kaynak oluşturulurken seçilir — önizleme kutucuğu açık ve koyu arka planlarda gösterir. Kaynaklar:

- **Simgeler** — aramalı binlerce çizgi simge (e-posta, grafik, kamyon…);
- **Markalar** — marka renklerinde hizmet logoları (Gmail, Jira, Telegram…);
- **Kendi simgeniz** — 1 MB’a kadar PNG, SVG, WebP veya JPEG, isteğe bağlı olarak koyu tema için ayrı bir sürüm;
- **Portal** — portalın menü ve modül simgeleri;
- **Harf** — renkli bir kutucukta bir veya iki karakter.

Stiller: **Degrade**, **Yumuşak**, **Dolgulu**, **Düz**. Renk paletten veya istediğiniz herhangi bir renk, isteğe bağlı olarak koyu tema için ayrı.`,
      note: 'Bazı markalar (örneğin Slack, Microsoft) kütüphanede yoktur — logolarını “Kendi simgeniz” altından yükleyin.',
    },
    {
      title: 'Kaynakları yönetme (yöneticiler)',
      body: `Panodaki **“Yönet”** düğmesi **kaynak kataloğunu** açar. “Çevrimiçi kaynakları yönetme” izni gerekir.

- **“Kaynak ekle”** — bir bağlantı veya bir portal modülü;
- **“Modül ekle”** — simgeleri ve renkleriyle birlikte tek tıklamayla birkaç portal modülü;
- satırları ⋮⋮ ile sürüklemek **varsayılan sırayı** belirler — herkes kendi düzenini oluşturana kadar bunu görür;
- **kategoriler** — iki dilde bir ad ve bir renk; bir kategoriyi silmek kaynaklarını kategorisiz bırakır.

Kaynağın başlığı ve açıklaması **Русский / English** sekmelerinde doldurulur (✓ doldurulanları işaretler). Bir dil boşsa diğeri gösterilir.`,
      steps: [
        '**“Yönet”** → **“Kaynak ekle”**yi açın.',
        '**“Bağlantı”**yı seçip adresi girin veya **“Portal modülü”**nü seçip modülü belirleyin.',
        'Başlığı ve açıklamayı her iki dilde doldurun.',
        'Kategoriyi, nasıl açılacağını ve **“Kimler görür”** ayarını belirleyin.',
        'Sağdan bir simge seçin ve **“Kaydet”**e tıklayın.',
      ],
      example: {
        title: 'Kurumsal e-postayı ekleme',
        body: 'Adres `https://mail.company.com`, başlık “Kurumsal e-posta”, kategori “İş”, **“Çalışanlar”**, “Markalar”dan bir simge veya “Degrade” stilinde “M” harfi. Açılış — **“Yeni sekmede”**.',
      },
      note: 'Adres `https://…`, `mailto:`, `tel:` veya `/app/kb` gibi bir portal sayfası olabilir. Diğer bağlantı türleri güvenlik nedeniyle reddedilir.',
    },
    {
      title: 'Modül ayarları ve ana sayfa',
      body: `**Ayarlar → Modüller → Çevrimiçi kaynaklar** bölümünde yönetici şunları ayarlar:

- kutucukların üstündeki **Başlık** ve **Alt başlık**;
- **Kutucuk boyutu** — rahat veya sıkışık;
- **Açıklamaları göster**;
- **Arama ve kategoriler**;
- **Kişisel düzen** — kişilerin kutucukları yeniden sıralayıp gizleyip gizleyemeyeceği.

Panoyu sitenin adresinde göstermek için **Ayarlar → Site erişimi → Ana sayfa** bölümünde “Çevrimiçi kaynaklar”ı seçin. Site açıksa konuklar “Herkes” kaynaklarını görür.`,
    },
  ],
  faq: [
    {
      q: 'Bir kutucuğu gizledim. Nasıl geri getiririm?',
      a: '**“Özelleştir”**e tıklayın, **“Gizli”** bloğunu açın ve kaynağa tıklayın.',
    },
    {
      q: 'İş arkadaşlarım düzenimi görür mü?',
      a: 'Hayır. Sıranız ve gizli kutucuklarınız yalnızca size aittir. Diğerleri kendi düzenlerini veya yöneticinin sırasını görür.',
    },
    {
      q: 'Başka bir bilgisayarda düzenim farklı. Neden?',
      a: 'Muhtemelen panoyu oturum açmadan düzenlediniz — bu durumda düzen yalnızca o tarayıcıda tutulur. Oturum açın ve yeniden düzenleyin: bundan sonra tüm cihazlarda ortak olur.',
    },
    {
      q: '“Özelleştir” düğmesi yok.',
      a: 'Yönetici **kişisel düzeni** kapatmış — herkes aynı sırayı görür.',
    },
    {
      q: 'Bir portal modülünün kutucuğu (örneğin “Görevler”) kayboldu.',
      a: 'Modül portal ayarlarında kapatılmış. Modül yeniden açıldığında kutucuk geri gelir.',
    },
    {
      q: 'Kendi kaynağımı nasıl eklerim?',
      a: 'Kaynakları bir yönetici ekler — adresi, bir başlığı ve kimin ihtiyaç duyduğunu ona gönderin. “Çevrimiçi kaynakları yönetme” izniniz varsa [Kaynakları yönetme](/help/resources#admin) bölümüne bakın.',
    },
  ],
  fields: {
    url: {
      title: 'Adres',
      text: 'Kutucuğun gittiği yer: `https://…`, `mailto:`, `tel:` veya `/app/kb` gibi bir portal sayfası. Diğer bağlantılar reddedilir.',
    },
    category: {
      title: 'Kategori',
      text: 'Kişiler panoyu kutucukların üstündeki çiplerle kategoriye göre filtreler. “Kategori yok” da olabilir.',
    },
    visibility: {
      title: 'Kimler görür',
      text: '**Herkes** — konuklar da; **Çalışanlar** — oturum açmış herkes; **Seçilenler** — seçilen kişiler, gruplar ve roller.',
    },
    active: {
      title: 'Göster',
      text: 'Kaynağı veya ayarlarını silmeden şimdilik herkesten gizlemek için kapatın.',
    },
    personalize: {
      title: 'Kişisel düzen',
      text: 'Açık — herkes kutucukları kendisi için yeniden sıralayabilir ve gizleyebilir. Kapalı — herkes katalog sırasını görür.',
    },
  },
};
