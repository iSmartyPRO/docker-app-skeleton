export default {
  title: 'Bilgi bankası',
  tagline: 'Talimatlar, belgeler ve yanıtlar — tek yerde, düzenli bir şekilde.',
  summary: 'Bilgi bankası şirketinizin kütüphanesidir: makaleler, dosyalar ve bağlantılar içeren istenen derinlikte klasörler. Belgeler doğrudan tarayıcıda açılır, arama başlık ve metne göre bulur, erişim her klasör ve materyal için ayrı ayarlanır. Bir klasör, herkese açık bir bağlantıyla portal dışındaki kişilerle paylaşılabilir.',
  highlights: [
    {
      title: 'İstenen derinlikte klasörler',
      text: 'Solda bir ağaç, üstte gezinti yolu ve her klasörün kendi simgesi ve rengi.',
    },
    {
      title: 'Makaleler, dosyalar ve bağlantılar',
      text: 'Kullanımı kolay bir düzenleyicide kılavuzlar yazın, belgeler yükleyin veya faydalı web sitelerini kaydedin.',
    },
    {
      title: 'İndirmeden görüntüleme',
      text: 'PDF, Word, Excel, görseller ve video doğrudan portalda açılır — telefonda da.',
    },
    {
      title: 'Hızlı arama',
      text: 'Klasör ve materyal adlarında, açıklamalarda, dosya adlarında ve makale metninde arar.',
    },
    {
      title: 'Esnek erişim',
      text: 'Görüntüleme, düzenleme veya yönetme — herkes, bir grup, bir rol veya belirli bir kişi için.',
    },
    {
      title: 'Herkese açık bağlantılar',
      text: 'Bir klasörü bir iş ortağına veya yeni bir çalışana oturum açmadan açın — parola ve son kullanma tarihiyle.',
    },
  ],
  tips: [
    'Dosyaları doğrudan açık bir klasöre sürükleyin — birkaç dosya aynı anda yüklenir.',
    'Makale düzenleyicisinde yazarken sonucu görmek için “Yan yana” moduna geçin.',
    '“Açıklama”yı doldurun — arama onu da kullanır ve iş arkadaşlarınız içinde ne olduğunu bir bakışta görür.',
    'Bir klasörü yalnızca doğru kişilere özel yapmak için “Erişimi devral” seçeneğini kapatın.',
    'Bir PDF sunum olarak gösterilebilir: “Sun” düğmesi tam ekran slaytları açar.',
    'Bağlantıya artık gerek yok mu? “İptal et”e tıklayın — daha sonra geri yükleyebilirsiniz.',
  ],
  sections: [
    {
      title: 'Klasör yapısı',
      body: `Bilgi bankasındaki her şey klasörlerde bulunur. Klasörler istenen derinlikte iç içe olabilir.

- Soldaki **ağaç** erişebildiğiniz her klasörü gösterir (telefonlarda kayan bir panel).
- Üstteki **gezinti yolu** bir üst düzeye götürür.
- **Kutucuklar** veya **Liste** — beğendiğiniz görünümü seçin.
- Her klasörün bir **Adı**, **Açıklaması**, **Rengi** ve **Simgesi** vardır. Rengi veya simgeyi belirlemezseniz modül ayarlarındaki “Varsayılan” kullanılır.

Klasör işlemleri “Eylemler” menüsündedir: “Klasör ayarları”, “Taşı”, “Erişim…”, “Herkese açık bağlantılar…” ve silme.`,
      steps: [
        'Yeni klasörü içermesi gereken klasörü (veya bankanın ana sayfasını) açın.',
        '“Ekle” → “Yeni klasör”e tıklayın.',
        'Bir ad ve isterseniz bir açıklama, renk ve simge girin. Önizleme nasıl görüneceğini gösterir.',
        '“Oluştur”a tıklayın.',
      ],
      example: {
        title: 'Örnek yapı',
        body: `- 📘 **Yeni çalışanlar** — ilk gün, iletişim bilgileri, ofis kuralları
- 📊 **Muhasebe** → Sözleşme şablonları, Politikalar
- 🛠 **BT** → VPN nasıl kurulur, Yazıcılar

Genel konular için mavi, departmanlar için yeşil — klasörler bir bakışta kolayca ayırt edilir.`,
      },
      note: 'Bir klasörü silmek içindeki her şeyi de siler: alt klasörler, materyaller ve herkese açık bağlantılar. Dosyalar modülünde saklanan dosyalar orada kalır.',
    },
    {
      title: 'Materyaller: makaleler, dosyalar ve bağlantılar',
      body: `Klasörler üç tür materyal içerir:

- **Makale** — doğrudan portalda metin: bir talimat, bir politika, sık sorulan bir sorunun yanıtı. Resim yerleştirebilir ve dosya ekleyebilirsiniz.
- **Dosya** — herhangi bir belge: PDF, Word, Excel, slaytlar, görsel, video. Tarayıcıda açılır.
- **Bağlantı** — harici bir sitenin adresi (yalnızca \`http\` veya \`https\`), örneğin vergi portalı veya bir rezervasyon hizmeti.

Her şey “Ekle” düğmesiyle eklenir: “Dosya yükle”, “Dosyalar’dan ekle”, “Yeni makale”, “Yeni bağlantı”. Bir materyal, menüsünden düzenlenebilir, yeniden adlandırılabilir, başka bir klasöre taşınabilir veya silinebilir.`,
      steps: [
        'Bir klasör açın ve “Ekle”ye tıklayın.',
        'Bir tür seçin: “Dosya yükle”, “Yeni makale” veya “Yeni bağlantı”.',
        '“Başlık”ı ve isterseniz “Açıklama”yı doldurun — açıklama listede görünür ve aranabilir.',
        '“Oluştur”a tıklayın.',
      ],
    },
    {
      title: 'Makale düzenleyicisi',
      body: `Bir makalenin iki düzenleyicisi vardır — geçiş anahtarı metnin üstündedir:

- **Görsel** (yeni makaleler için varsayılan) — normal bir belge gibi: başlıklar, kalın, italik, altı çizili, vurgu, listeler, kontrol listeleri, alıntılar, kod, hizalama, bağlantılar ve tablolar. **Resimler ve dosyalar** yapıştırılabilir (Ctrl+V), doğrudan metne sürüklenebilir, bilgisayardan yüklenebilir veya Dosyalar’dan seçilebilir (🖼 ve 📎 düğmeleri). Araç çubuğunu açmak için **bir resme tıklayın**: boyut (S, M, L, 100% veya “Otomatik” — özgün boyut), metne göre konum (ortada, solda, sağda veya sola/sağa **sarmalı** — metin resmin yanından akar; telefonlarda sarmalı resimler tam genişliği kaplar), resim yazısı, açıklama (alternatif metin, ekran okuyucular ve arama için), bağlantı, değiştirme, özgününü açma, indirme ve silme. Boyutlandırmak için bir köşeyi de sürükleyebilirsiniz; çift tıklama resim yazısı ekler, Delete resmi kaldırır. Okuyucular resmi tam ekran görmek için ona tıklar. ⤢ düzenleyiciyi tam ekran açar, Esc geri döner.
- **Markdown** — işaretli düz metin ve bir araç çubuğu. Sağ üstte üç mod:

- **Yaz** — yalnızca giriş alanı;
- **Yan yana** — metin ve sonuç yan yana;
- **Önizleme** — makale okuyucuların gördüğü gibi.

Markdown biliyorsanız doğrudan yazın: \`# Başlık\`, \`**kalın**\`, \`- liste öğesi\`.

Yazılmış bir makale her an değiştirilebilir: içerik kalır; Markdown’a geçerken yalnızca hizalama ve vurgular kaybolur; tablolar ve boyutu, konumu veya resim yazısı olan resimler HTML olarak kalır.`,
      example: {
        title: 'Kısa bir kılavuz',
        body: `\`## Misafir kartı nasıl sipariş edilir\`

\`1. Güvenlik sitesindeki formu açın\`
\`2. **Ad soyad** ve ziyaret saatini girin\`
\`3. Bir gün önce saat 17:00’ye kadar gönderin\`

“Önizleme”de bu, “Ad soyad” kalın olacak şekilde bir başlığa ve numaralı bir listeye dönüşür.`,
      },
    },
    {
      title: 'Makalelerde resimler ve ekler',
      body: `[Dosyalar](/app/files) modülü açıkken bir makaleye iki şekilde dosya ekleyebilirsiniz:

- Düzenleyici araç çubuğundaki **📎 Dosya** metne bir dosya yerleştirir. Resim makalede gösterilir; diğer dosyalar bağlantıya dönüşür.
- Düzenleyicinin altındaki **Ekler → “Dosya ekle”** dosyaları makalenin altında listeler.

Metne yerleştirilen dosyalar otomatik olarak eklenir. Okuyucuların bu dosyalara Dosyalar’da erişmesine gerek yoktur — makaleye erişim yeterlidir.`,
      steps: [
        'İmleci resmin olması gereken yere koyun.',
        '“📎 Dosya”ya tıklayın ve Dosyalar’dan bir dosya seçin.',
        '“Ekle”ye tıklayın — resim metinde görünür.',
      ],
      example: {
        title: 'Ekran görüntülü bir kılavuz',
        body: '“Telefonda e-posta kurulumu” makalesinde her adımdan sonra “📎 Dosya” ile bir ekran görüntüsü yerleştirilir ve yazdırılabilir bir PDF kopya kâğıdı “Ekler”de durur.',
      },
    },
    {
      title: 'Belgeleri ve PDF’leri görüntüleme',
      body: `Çoğu dosya indirmeye gerek kalmadan doğrudan portalda açılır:

- **PDF** — sayfa küçük resimleri, “Genişliğe sığdır” / “Sayfaya sığdır”, yakınlaştırma, sayfaya atlama, metin seçme ve kopyalama, “Tam ekran”. **“Sun”** düğmesi belgeyi slayt olarak gösterir: geçiş için ← → veya Boşluk, çıkmak için Esc.
- **Görseller** — yakınlaştırma, kaydırma ve sürükleme özellikli galeri (telefonlarda hareketlerle).
- **Word (.docx)** — tarayıcıda işlenir.
- **Excel ve CSV** — sekmeli bir sayfa ızgarası (ilk 3 000 satır).
- **PowerPoint, eski .doc / .xls, OpenDocument, RTF** — yönetici bir dönüştürme sunucusu bağladığında PDF olarak gösterilir.
- **Metin ve Markdown**, **video ve ses** — yerleşik görüntüleyici ve oynatıcı.

Diğer biçimler “İndir” düğmeli bir kart gösterir.`,
      note: '“Görüntülemek için bir dönüştürme sunucusu gerekiyor” mu görüyorsunuz? Dosyayı yine de indirebilirsiniz; tarayıcıda görüntüleme için yöneticinizden belge dönüştürmeyi bağlamasını isteyin.',
    },
    {
      title: 'Arama',
      body: `Üstteki “Bilgi bankasında ara” kutusu aynı anda her yerde arar:

- klasör adları ve açıklamaları;
- materyal başlıkları ve açıklamaları;
- dosya adları;
- makale metni.

Sonuçlar yalnızca erişebildiklerinizi içerir. Özel klasörler ve materyaller hiçbir zaman görünmez.`,
      example: {
        title: 'Metindeki bir sözcükle bulma',
        body: 'Misafir Wi-Fi’sine nasıl bağlanacağınızı mı arıyorsunuz? **wi-fi** yazın — sözcük başlıkta değil yalnızca metinde geçse bile “Ofis ağı” makalesi bulunur.',
      },
      note: 'Arama PDF ve Word dosyalarının içini okumaz — bu yüzden dosyalara anlaşılır bir “Açıklama” verin.',
    },
    {
      title: 'Klasörlere ve materyallere erişim',
      body: `Erişim üç yerde ayarlanır: tüm banka (ana sayfadaki “Bankaya erişim”), bir klasör ve tek bir materyal (menüdeki “Erişim…”). Her düzey bir öncekini içerir:

- **Görüntüleme** — açma ve indirme;
- **Düzenleme** — ayrıca materyal ekleme, yeniden adlandırma, taşıma ve silme;
- **Yönetme** — ayrıca erişimi değiştirme, bağlantı paylaşma ve klasör silme.

Erişim “Oturum açmış herkes”e, bir gruba, bir role veya belirli bir kişiye verilebilir.

**Devralma.** Varsayılan olarak bir klasör üst klasörünün erişimini alır ve kendi kayıtları yalnızca buna eklenir. “Erişimi devral”ı kapatırsanız klasör **özel** olur: yalnızca kendi kayıtları geçerli olur ve alt klasörler erişimi ondan devralır.`,
      steps: [
        'Bir klasör açın ve “Erişim…”i (veya “Erişim” düğmesini) seçin.',
        '“Kişi, grup veya rol ekleyin…” alanında kime erişim verileceğini seçin.',
        'Düzeyi seçin: “Görüntüleyebilir”, “Düzenleyebilir” veya “Yönetebilir”.',
        'Klasörü özel yapmak için “Erişimi devral”ı kapatın. “Kaydet”e tıklayın.',
      ],
      example: {
        title: 'Yöneticiler için özel bir klasör',
        body: '“Maaşlar ve primler” klasörü: “Erişimi devral”ı kapatın, “Yöneticiler” grubunu “Görüntüleyebilir”, muhasebeciyi “Düzenleyebilir” ile ekleyin. Diğer çalışanlar klasörü göremez bile — ne ağaçta ne aramada.',
      },
      note: 'Kendinizi dışarıda bırakamazsınız: “Yönetme” erişiminizi kaldıran kuralları kaydederseniz bu erişim sizde kalır. Bilgi bankası yöneticileri her klasörü her zaman yönetebilir.',
    },
    {
      title: 'Bir klasöre herkese açık bağlantılar',
      body: `Herkese açık bir bağlantı, bir klasörü **portalda oturum açmadan** kişilere açar: bir yüklenici, bir aday, bir müşteri. Bağlantı klasörü ve erişimini devralan her şeyi gösterir. **Özel** alt klasörler ve materyaller bir bağlantı üzerinden hiçbir zaman görünmez.

Bağlantı ayarları:

- **Bağlantı adı** — ziyaretçiler bunu klasör adı yerine görür;
- **Adres** — \`/s/onboarding\` gibi okunabilir bir ad. Portal siz yazarken kullanılabilirliği kontrol eder ve alınmışsa bir alternatif önerir;
- **Parola** — ziyaretçiler bunu bir kez girer;
- **Geçerlilik sonu** — “Hiçbir zaman”, 1, 7, 30 gün veya belirli bir tarih;
- **İndirmeye izin ver** — yalnızca görüntüleme için kapatın.

Bir klasörün farklı ayarlarla birkaç bağlantısı olabilir. Her biri görüntülenme sayısını gösterir. Bir bağlantı kopyalanabilir, düzenlenebilir, “İptal edilebilir” (ve daha sonra “Geri yüklenebilir”) veya silinebilir.`,
      steps: [
        'Klasörü açın ve “Paylaş”a (veya menüdeki “Herkese açık bağlantılar…”a) tıklayın.',
        'Bağlantı adını ve adresini kontrol edin.',
        'Gerekirse bir parola açın ve geçerlilik süresini seçin.',
        '“Bağlantı oluştur”a tıklayın, ardından ⧉ ile kopyalayıp gönderin.',
      ],
      example: {
        title: 'Yeni bir çalışan için materyaller',
        body: 'Yeni bir çalışan başlamadan bir hafta önce “Yeni çalışanlar” klasörüne `/s/welcome` adresinde, parolalı ve 7 gün geçerli bir bağlantı oluşturun. Parolayı ayrıca gönderin. Bir hafta sonra bağlantı kendiliğinden çalışmayı durdurur.',
      },
      note: 'Parolayı değiştirmek veya bir bağlantıyı iptal etmek, bağlantıyı zaten açmış olan herkesin erişimini hemen keser. Bir klasörün bağlantılarını yalnızca o klasörde “Yönetme” erişimi olan kişiler yönetebilir.',
    },
    {
      title: 'Yükleme ve “Dosyalar’dan ekle”',
      body: `“Ekle” → “Dosya yükle” ile veya yalnızca **dosyaları klasöre sürükleyerek** yükleyin. Dosya boyutunu ve türlerini yöneticiniz sınırlar.

[Dosyalar](/app/files) modülü açıkken yüklenen dosyalar **Dosyalar → Dosyalarım → Bilgi bankası** bölümünde de görünür.

**“Dosyalar’dan ekle”**, Dosyalar’da zaten bulunan dosyaları (Dosyalarım, “Benimle paylaşılanlar” veya paylaşılan alanlar) **kopyalamadan** alır: dosyayı orada güncelleyin, bilgi bankasında da güncellenir.`,
      steps: [
        'Bir bilgi bankası klasörü açın ve “Ekle” → “Dosyalar’dan ekle”ye tıklayın.',
        'İhtiyacınız olan dosyaları işaretleyin.',
        '“Klasöre ekle”ye tıklayın.',
      ],
      note: 'Bilgi bankasında kullanılan bir dosya, materyallerden kaldırılana kadar Dosyalar’da çöp kutusuna taşınamaz. Bir materyali silmek dosyayı Dosyalar’dan silmez.',
    },
    {
      title: 'Modül ayarları (yöneticiler için)',
      body: `Yöneticiler bilgi bankasını **Ayarlar → Modüller → Bilgi bankası** bölümünde yapılandırır:

- **Açık** — bilgi bankasını uygulamalar menüsünde gösterir;
- **Klasör görünümü** — kendi rengi ve simgesi olmayan klasörler için “Varsayılan renk” ve “Varsayılan simge”;
- **En büyük dosya boyutu** — 1 ile 1024 MB arası (varsayılan 50 MB);
- **İzin verilen türler** — görüntüler, PDF, Office, metin, video ve ses, arşivler;
- **Office önizlemeleri** — Word, PowerPoint ve eski biçimlerin birebir gösterimi için bir dönüştürme sunucusunun bağlı olup olmadığı;
- **Herkese açık bağlantılar** — bunlara izin verme, parola zorunlu tutma ve “En uzun geçerlilik süresi”ni sınırlama (0 sınırsız demektir).

Bankayı kimlerin kullanabileceği burada değil, bilgi bankasının kendisinde “Bankaya erişim” ile ayarlanır.`,
      note: '“Herkese açık bağlantılara izin ver”i kapatmak mevcut tüm bağlantıları anında durdurur. Yeniden açtığınızda tekrar çalışırlar.',
    },
  ],
  faq: [
    {
      q: 'Bir iş arkadaşımın bahsettiği klasörü neden göremiyorum?',
      a: 'Büyük olasılıkla klasör özeldir ve siz erişim listesinde değilsiniz. Klasörü yöneten kişiden sizi “Erişim…” üzerinden eklemesini isteyin.',
    },
    {
      q: 'Dosyam yüklenmiyor — ne yapmalıyım?',
      a: 'Boyutunu ve biçimini kontrol edin: yönetici en büyük dosya boyutunu ve izin verilen türleri sınırlar. Başka bir biçimden yeniden adlandırılmış bir dosya (örneğin PDF gibi gösterilen bir program) reddedilir.',
    },
    {
      q: 'Bir PowerPoint sunusu tarayıcıda açılmıyor. Neden?',
      a: 'PowerPoint, eski .doc/.xls ve OpenDocument bir belge dönüştürme sunucusu gerektirir. Sunucu bağlanana kadar dosyayı indirin. Word (.docx), Excel ve PDF sunucu olmadan açılır.',
    },
    {
      q: 'Herkese açık bir bağlantı özel alt klasörleri açığa çıkarır mı?',
      a: 'Hayır. Bağlantı yalnızca klasörün erişimini devralanları gösterir. Özel alt klasörler ve kendi erişimi olan materyaller gizli kalır.',
    },
    {
      q: 'Bir ziyaretçi bağlantı parolasını unuttu. Ne yapmalıyım?',
      a: 'Parolalar hiçbir zaman gösterilmez. Bağlantıyı açın, “Düzenle”ye tıklayın, yeni bir parola belirleyin ve ziyaretçiye gönderin.',
    },
    {
      q: '“İptal et” bir bağlantıyı silmekten nasıl farklı?',
      a: '“İptal et” bağlantıyı geçici olarak kapatır — aynı adreste “Geri yükle” yapabilirsiniz. Silmek bağlantıyı kalıcı olarak kaldırır ve adresi serbest bırakır.',
    },
    {
      q: 'Bir materyali silersem dosya Dosyalar’dan da gider mi?',
      a: 'Hayır, dosya Dosyalar’da kalır. Yalnızca bilgi bankası materyali kaldırılır.',
    },
    {
      q: 'Bir materyali başka bir klasöre nasıl taşırım?',
      a: 'Materyal menüsünde “Taşı”yı seçin ve bir klasör seçin. Her iki klasörde de “Düzenleme” erişimi gerekir.',
    },
  ],
  fields: {
    attachments: {
      title: 'Ekler',
      text: 'Makalenin altında listelenen dosyalar. Bir resmi metnin içinde göstermek için düzenleyici araç çubuğundaki “📎 Dosya”yı kullanın.',
    },
    folderIcon: {
      title: 'Simge ve renk',
      text: 'Klasörü bir bakışta tanımaya yardımcı olur. “Varsayılan” modül ayarlarından gelir.',
    },
    accessLevels: {
      title: 'Erişim düzeyleri',
      text: '**Görüntüleme** — açma ve indirme. **Düzenleme** — ayrıca materyalleri değiştirme. **Yönetme** — ayrıca erişim, bağlantılar ve klasör silme.',
    },
    inherit: {
      title: 'Erişimi devral',
      text: 'Açık — üst klasörün erişimi ve aşağıdaki kayıtlar geçerlidir. Kapalı — klasör özeldir: yalnızca listelenenler girebilir.',
    },
    shareSlug: {
      title: 'Bağlantı adresi',
      text: 'Kısa, okunabilir bir ad: Latin harfleri, rakamlar ve kısa çizgiler, 3–64 karakter. Alınmışsa portal boş bir ad önerir.',
    },
    sharePassword: {
      title: 'Bağlantı parolası',
      text: 'Ziyaretçiler bunu bir kez girer. Parolayı bağlantıdan ayrı gönderin. Değiştirmek, bağlantıyı zaten açmış olan herkesin erişimini keser.',
    },
    shareExpiry: {
      title: 'Geçerlilik sonu',
      text: 'Bu tarihten sonra bağlantı “Bu bağlantının süresi doldu” mesajını gösterir. Yönetici en uzun süreyi sınırlayabilir.',
    },
    fileTypes: {
      title: 'İzin verilen türler',
      text: 'Diğer biçimlerdeki dosyalar yüklenemez. PDF’ler ve görseller içeriklerine göre de kontrol edilir.',
    },
    conversion: {
      title: 'Office önizlemeleri',
      text: 'Dönüştürme sunucusu olmadan PowerPoint ve eski biçimler yalnızca indirilebilir. Word (.docx), Excel ve CSV her durumda açılır.',
    },
    maxShareDays: {
      title: 'En uzun bağlantı süresi',
      text: 'Yeni bir herkese açık bağlantının kaç gün geçerli olabileceği. 0 sınırsız demektir ve “Hiçbir zaman” seçeneği kullanılabilir olur.',
    },
  },
};
