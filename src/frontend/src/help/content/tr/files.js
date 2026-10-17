export default {
  title: 'Dosyalar',
  tagline: 'Kişisel ve paylaşılan dosyalar, paylaşım ve herkese açık bağlantılar',
  summary: 'İş belgelerinizi portalda tutun: kişisel Dosyalarım alanınızda veya ekibinizin paylaşılan alanlarında. Herhangi bir dosyayı veya klasörü iş arkadaşlarınızla paylaşın ya da parolalı ve süreli herkese açık bir bağlantıyla dışarıya gönderin. Dosyalar doğrudan tarayıcıda açılır: PDF, Word, Excel, görseller, video.',
  highlights: [
    {
      title: 'Dosyalarım',
      text: 'Kişisel depolama alanı: bir şey paylaşana kadar yalnızca siz görürsünüz.',
    },
    {
      title: 'Paylaşılan alanlar',
      text: 'Kendi kuralları olan ekip sürücüleri: görüntüleme, düzenleme, yönetme.',
    },
    {
      title: 'İş arkadaşlarıyla paylaşın',
      text: 'Bir dosyayı veya klasörü kişilere ve gruplara görüntüleme veya düzenleme için açın.',
    },
    {
      title: 'Herkese açık bağlantılar',
      text: 'Portal hesabı olmayan iş ortakları için bir bağlantı: yalnızca görüntüleme, dosya bırakma kutusu veya tam erişim, parola ve geçerlilik süresiyle.',
    },
    {
      title: 'Tarayıcıda görüntüleme',
      text: 'PDF, Office, görseller, video ve ses indirmeden açılır; PDF’ler sunum olarak bile.',
    },
    {
      title: 'Çöp kutusu',
      text: 'Silinen öğeler 30 gün saklanır, böylece yanlışlıkla yapılan bir silme geri alınabilir.',
    },
  ],
  tips: [
    'Dosyaları veya bütün bir klasörü Gezgin’den doğrudan klasör penceresine sürükleyin: alt klasörler dahil her şey oraya yüklenir.',
    'Tek tek dosyalar yerine bir klasör paylaşın: daha sonra eklediğiniz her şey otomatik olarak erişilebilir olur.',
    'İş arkadaşlarınıza herkese açık bağlantı değil, dosya sayfasındaki Bağlantı düğmesini gönderin: yalnızca erişimi olanlar için açılır.',
    'Önemli belgelerin herkese açık bağlantılarına parola ve geçerlilik süresi verin.',
    'Tüm eylemleri içeren menüyü açmak için bir dosyaya sağ tıklayın.',
    'Şirketin dosya sunucusundaki bir dosyaya mı ihtiyacınız var? O, [Dosya sunucusu](/app/drive) bölümündedir.',
  ],
  sections: [
    {
      title: 'Dosyalarım ve konumlar',
      body: `Konumlar soldadır:

- **Dosyalarım**: kişisel klasörünüz. Alt klasörler oluşturun ve burada her şeyi tutun.
- **Benimle paylaşılanlar**: iş arkadaşlarınızın sizinle veya gruplarınızla paylaştığı her şey, sahibiyle birlikte gösterilir.
- **Paylaşılan alanlar**: erişiminiz olan ekip alanları.
- **Son kullanılanlar**: en son yüklemeleriniz ve değişiklikleriniz.
- **Çöp kutusu**: silinen dosyalar.

Listeyi ızgara veya tablo olarak gösterin, birkaç dosya seçin ve birlikte taşıyın ya da silin. Listenin üstündeki gezinti yolu nerede olduğunuzu gösterir. Telefonda konumlar yan çekmeceden açılır.`,
      note: '[Bilgi bankasına](/app/kb) yüklenen dosyalar da burada, Dosyalarım → Bilgi bankası sistem klasöründe bulunur.',
    },
    {
      title: 'Yükleme ve sürükle-bırak',
      body: `**Yükle** düğmesiyle yükleyin veya dosyaları Gezgin’den klasör penceresine sürüklemeniz yeterlidir; bir bırakma ipucu görürsünüz. Birçok dosya aynı anda yüklenebilir.

**Bütün klasörler** de bırakılabilir veya düğmenin yanındaki okla → **Klasör yükle** seçilebilir. Alt klasörler sizin için oluşturulur ve her dosya yerine düşer; aynı adlı klasörler birleştirilir, boş klasörler korunur. Sağ alttaki panel kaç dosyanın tamamlandığını gösterir, iptal etmenizi sağlar ve yüklenemeyen dosyaları nedeniyle listeler. Telefonlarda klasör seçilemez (iOS ve Android sınırlaması).

Klasörde aynı adlı bir dosya zaten varsa hiçbir şeyin üzerine yazılmaz: yeni dosya “Rapor (2).pdf” olarak kaydedilir.`,
      steps: [
        'Klasörü Dosyalarım’da veya bir paylaşılan alanda açın.',
        'Dosyaları klasörlere ayırmak istiyorsanız Yeni klasör’e basın.',
        'Dosyaları veya bütün bir klasörü pencereye sürükleyin ya da Yükle’ye basıp seçin.',
      ],
      note: 'En büyük dosya boyutunu ve izin verilen türleri yönetici belirler. Bir dosya yüklenmiyorsa boyutunu ve biçimini kontrol edin.',
    },
    {
      title: 'Paylaşılan alanlar ve erişim',
      body: `Paylaşılan alan, *Muhasebe* veya *Pazarlama* gibi bir ekip sürücüsüdür. İçindeki dosyalar yükleyen kişiye değil alana aittir; böylece biri ayrıldığında hiçbir şey kaybolmaz.

Bir alan oluştururken kimin erişeceğini seçin:

- **Herkes ekleyebilir ve düzenleyebilir**: tüm ekip için ortak bir sürücü;
- **Herkes görüntüleyebilir**: dosyaları yalnızca eklediğiniz kişiler değiştirebilir;
- **Yalnızca ben**: kişileri daha sonra ekleyin.

Kuralları daha sonra alan menüsü → **Erişim** bölümünden değiştirin. Düzeyler: **Görüntüleme** (açma ve indirme), **Düzenleme** (yükleme, yeniden adlandırma, taşıma, silme), **Yönetme** (bunların hepsi ve ayrıca erişim, bağlantılar ve alanın çöp kutusu).`,
      example: {
        title: 'Satış ekibi için bir alan',
        body: 'Satış müdürü “Herkes görüntüleyebilir” ayarıyla bir *Satış* alanı oluşturur, ardından Erişim’de *Satış ekibi* grubuna Düzenleme düzeyini verir. Tüm şirket fiyat listelerini ve sözleşme şablonlarını görür, ancak bunları yalnızca satış ekibi değiştirebilir.',
      },
      note: 'Alanları herkesin mi yoksa yalnızca yöneticilerin mi oluşturabileceğine portal yöneticisi karar verir.',
    },
    {
      title: 'Dosyaları görüntüleme, PDF slaytları ve sunum',
      body: `Tıklamak dosyayı **kendi sayfasında** açar: ‹ › klasördeki diğer dosyalar arasında geçiş yapar, **Bağlantı** düğmesi iş arkadaşları için sayfa adresini kopyalar (erişimi olan herkes için açılır).

PDF, Word, Excel ve diğer Office belgeleri, görseller, metin ve Markdown, video ve ses tarayıcıda açılır. Bilinmeyen biçimler yalnızca indirilir.

PDF’lerin üç modu vardır: **Sayfalar** (normal kaydırma), **Slaytlar** (her seferinde bir sayfa) ve **Sun** (tam ekran). Sunumda geçiş için ← → veya Boşluk, çıkmak için Esc kullanın.`,
      example: {
        title: 'Toplantıda bir sunum gösterin',
        body: 'Sunumu PDF olarak kaydedin ve ekibinizin alanına yükleyin. Toplantıda dosyayı açın ve Sun’a basın: slaytlar ekranı doldurur, PowerPoint gerekmez.',
      },
      note: 'Yönetici, dosyaların kendi sayfaları yerine klasörün üzerinde bir pencerede açılmasını ayarlayabilir.',
    },
    {
      title: 'Kişilerle paylaşma',
      body: `Dosya veya klasör menüsünü açın → **Paylaş…** → **Kişiler** sekmesi. İş arkadaşlarını veya grupları ekleyin ve bir düzey seçin:

- **Görüntüleyebilir**: açma, önizleme ve indirme;
- **Düzenleyebilir**: ayrıca içeride yükleme, yeniden adlandırma, taşıma ve silme.

Bir klasöre erişim, daha sonra eklenen dosyalar dahil içindeki her şeyi kapsar. Alıcılar bir bildirim alır ve öğeyi **Benimle paylaşılanlar** altında bulur.`,
      steps: [
        'Dosyaya veya klasöre sağ tıklayın → Paylaş….',
        '“Kişi veya grup ekleyin” alanında bir iş arkadaşı veya grup bulun.',
        'Görüntüleyebilir veya Düzenleyebilir’i seçin ve Kaydet’e basın.',
      ],
      example: {
        title: 'Bir rapor için klasör',
        body: 'Dosyalarım’da bir *Yıllık rapor 2026* klasörü oluşturun ve *Finans* grubuna Düzenleyebilir izni verin. İş arkadaşlarınız tablolarını oraya bırakır, siz de her şeyi tek yerde görürsünüz.',
      },
      note: 'Erişimi değiştirebilen, bağlantı oluşturabilen ve kalıcı olarak silebilen yalnızca sahiptir.',
    },
    {
      title: 'Herkese açık bağlantılar: izinler, parola ve geçerlilik süresi',
      body: `Herkese açık bir bağlantı, bir dosyayı veya klasörü **oturum açmadan**, örneğin bir müşteri veya yüklenici için açar. Klasör bağlantısı yalnızca içindekileri gösterir; ziyaretçiler daha üst bir düzeye çıkamaz.

Paylaş… → **Herkese açık bağlantılar** sekmesinde ana ayarlar hemen oradadır:

- **Alıcı neler yapabilir**: Görüntüleme veya Görüntüleme ve indirme; klasörler için Diğer… diğer seçenekleri açar (bkz. [Bağlantı izinleri](#link-permissions));
- **Geçerlilik süresi**: süresiz, 1, 7 veya 30 gün ya da bir tarih (bağlantı o günün sonuna kadar çalışır);
- **Parola**: isteğe bağlı, en az 4 karakter; Oluştur kolay bir parola üretir;
- **Bağlantı adresi**: \`/l/dogovor-keykompani\` gibi okunabilir bir adres (bkz. [Kendi bağlantı adresiniz](#link-address)).

Diğer her şey (yükleme kuralları, ziyaretçinin adı, bildirimler, bağlantının adı) daraltılmış **Gelişmiş ayarlar** bölümündedir.

Listedeki her bağlantı adresini, izinlerini, geçerlilik süresini, parola kilidini ve görüntülenme sayısını gösterir. Bağlantıyı kopyalayın veya düzenleyin; ⋯ menüsü bir QR kod gösterir, bağlantıyı “alıcı olarak” açar, etkinliği listeler, bağlantıyı **iptal eder** (ve daha sonra geri yükler) veya siler. İptal etmek veya parolayı değiştirmek, bağlantıyı zaten açmış olan herkesin erişimini keser.`,
      steps: [
        'Dosya menüsü → Paylaş… → Herkese açık bağlantılar.',
        'Alıcının neler yapabileceğini, geçerlilik süresini ve isterseniz bir parola ve kendi adresinizi seçin.',
        'Oluştur ve kopyala’ya basın: bağlantı panodadır.',
        'Bağlantıyı ve parolayı farklı kanallardan gönderin.',
      ],
      example: {
        title: 'Bir müşteriye bir haftalığına sözleşme',
        body: 'Sözleşme PDF’ine “Yalnızca görüntüleme”, bir parola ve “7 gün” ile bir bağlantı oluşturun. Bağlantıyı e-postayla, parolayı mesajlaşma uygulamasıyla gönderin. Bir hafta sonra bağlantı kendiliğinden çalışmayı durdurur.',
      },
      note: 'Yönetici herkese açık bağlantıları kapatabilir, parolayı zorunlu yapabilir veya sürelerini sınırlayabilir. Çöp kutusundaki öğelere giden bağlantılar çalışmaz.',
    },
    {
      title: 'Kendi bağlantı adresiniz',
      body: `Rastgele bir adres yerine okunabilir bir adres belirleyebilirsiniz: \`portal…/l/dogovor-keykompani\`. Herhangi bir dilde yazın: portal bunu Latin harflerine dönüştürür; Addan, dosya adını doldurur.

- Yalnızca Latin harfleri, rakamlar ve kısa çizgiler, 3 ile 64 karakter arası; hizmet sözcükleri (\`admin\`, \`login\`, \`api\`…) kullanımdadır;
- adres siz yazarken kontrol edilir: **Kullanılabilir** veya **Kullanımda**, alternatiflerle (\`-2\`, \`-2026\`…);
- rastgele adres de çalışmaya devam eder;
- adresi değiştirirseniz veya bağlantıyı silerseniz eski adres **hemen açılmaz olur**; 90 gün boyunca onu yalnızca siz yeniden alabilirsiniz.

İptal edilmiş veya süresi dolmuş bir bağlantı adresini korur; böylece gönderdiğiniz bir bağlantı hiçbir zaman başkasının dosyasını açmaz.`,
      note: 'Okunabilir bir adres daha kolay tahmin edilir. Önemli dosyalar için parolayı açın.',
    },
    {
      title: 'Bağlantı izinleri: görüntüleme, yükleme, değiştirme',
      body: `Her bağlantı için alıcının neler yapabileceğini seçin:

- **Yalnızca görüntüleme**: dosyaları tarayıcıda açma, indirme yok;
- **Görüntüleme ve indirme**: önceki gibi, varsayılan;
- **Yalnızca yükleme**: bir dosya bırakma kutusu. Alıcı “Dosya gönderin” sayfasını görür ve dosya gönderebilir, ancak klasörde ne olduğunu hiçbir zaman görmez (yalnızca kendi gönderdiklerini);
- **Görüntüleme ve yükleme**: görme, indirme ve yeni dosya ekleme;
- **Tam erişim**: ayrıca klasörler, yeniden adlandırma, yeni sürümle değiştirme ve silme;
- **Özelleştir…**: görüntüleme, indirme, yükleme, klasör oluşturma, yeniden adlandırma ve taşıma, değiştirme, silme için ayrı anahtarlar.

Yüklemeye izin veren bağlantıların **kuralları** vardır: en büyük dosya boyutu, izin verilen türler (örneğin \`.pdf, .jpg\`), bağlantı için toplam sınır, **ziyaretçinin adını sor** (ve e-postasını) ve ziyaret başına bir bildirimle **bana bildir**.

Bir bağlantı üzerinden gelenler size aittir ve kotanızdan düşer. Dosyalarda “bağlantı ile · Ad” yazar, bağlantı menüsü → **Etkinlik** kimin ne yaptığını listeler. Bir ziyaretçinin sildiği öğeler çöp kutunuza gider; değiştirmede önceki sürüm de çöp kutusunda kalır.`,
      example: {
        title: 'Bir müşteriden belge toplama',
        body: '“Müşteri belgeleri” klasörü oluşturun, “.pdf, .jpg”, “en fazla 20 MB” ve “Ziyaretçinin adını sor” ayarlarıyla “Yalnızca yükleme” bağlantısı yapın ve “Bana bildir”i açın. Müşteri taramaları sayfaya bırakır; siz tek bir bildirim alır ve dosyaları adıyla birlikte görürsünüz.',
      },
      note: 'Yalnızca kendiniz yapabildiklerinizi verebilirsiniz: yükleme ve değişiklikler düzenleme izni gerektirir. Yönetici, değişikliğe izin veren bağlantıları kapatabilir veya bunlar için parola zorunlu tutabilir.',
    },
    {
      title: 'Çöp kutusu',
      body: `Silinen dosyalar ve klasörler **çöp kutusuna** gider ve orada 30 gün kalır (süreyi yönetici belirler), ardından kalıcı olarak kaybolur.

Çöp kutusunda bir öğeyi bulunduğu yere **geri yükleyebilir**, **kalıcı olarak silebilir** veya **çöp kutusunu boşaltabilirsiniz**.`,
      note: 'Bilgi bankasının kullandığı bir dosya silinemez: portal önce dosyanın kaldırılması gereken makaleleri ve klasörleri listeler.',
    },
    {
      title: 'Arama',
      body: '**Dosyalarda ara** kutusu açabildiğiniz her konumda adları arar: Dosyalarım, sizinle paylaşılan öğeler ve paylaşılan alanlar. Her sonuç klasör yolunu gösterir, böylece nerede olduğunu bilirsiniz.',
    },
    {
      title: 'Kota ve depolama',
      body: `Konumların altında kişisel dosyalarınızın ne kadar yer kapladığını görürsünüz, örneğin “120 MB / 2 GB”. Kota, **çöp kutusu dahil** Dosyalarım’ı sayar; paylaşılan alanlar sayılmaz.

Yeriniz biterse artık ihtiyacınız olmayanları silin ve **çöp kutusunu boşaltın**: alan ancak o zaman boşalır.`,
    },
    {
      title: 'Modül ayarları (yöneticiler)',
      body: `**Ayarlar → Modüller → Dosyalar**:

- **En büyük dosya boyutu**: varsayılan 200 MB;
- **Kullanıcı başına kişisel depolama**: Dosyalarım kotası, 0 sınırsız demektir;
- **Silinen dosyaları sakla**: çöp kutusu süresi, varsayılan 30 gün;
- **Her dosya türüne izin ver** veya yalnızca seçilen gruplar (görseller, PDF, Office, metin, medya, arşivler);
- **Paylaşılan alanları kimler oluşturur**: herkes veya yalnızca yöneticiler;
- **Herkese açık bağlantılar**, **Her bağlantıda parola iste**, **En uzun bağlantı süresi**;
- **Bağlantıları kimler yayımlar**: yalnızca sahipler veya erişimi olan herkes (kendi izinleri dahilinde);
- **Değişikliğe izin veren bağlantılar** ve **Değişikliğe izin veren bağlantılar için parola**;
- **Dosyaların açılışı**: kendi sayfası veya açılır pencere.

Dosya yöneticisi izni tüm paylaşılan alanları yönetir. Çalışanların kişisel dosyaları yöneticilere karşı da gizli kalır.`,
    },
  ],
  faq: [
    {
      q: 'Kişisel dosyalarımı biri görebilir mi?',
      a: 'Hayır. Dosyalarım’ı yalnızca siz görürsünüz, yöneticiler bile görmez. Başkaları yalnızca bir öğeyi paylaştığınızda veya bir bağlantı oluşturduğunuzda erişim kazanır.',
    },
    {
      q: 'Bir dosyayı yanlışlıkla sildim. Nasıl geri alırım?',
      a: 'Çöp kutusunu açın, dosyayı bulun ve Geri yükle’ye basın. Yönetici başka bir süre belirlemediyse dosyalar orada 30 gün kalır.',
    },
    {
      q: 'Herkese açık bağlantı, dosya sayfasındaki Bağlantı düğmesinden nasıl farklı?',
      a: 'Bağlantı düğmesi, yalnızca erişimi olan iş arkadaşları için açılan portal sayfası adresini kopyalar. Herkese açık bağlantı oturum açmadan herkes için açılır; bu yüzden onu parola ve geçerlilik süresiyle koruyun.',
    },
    {
      q: 'Alıcı bağlantının açılmadığını söylüyor.',
      a: 'Durumunu Paylaş… → Herkese açık bağlantılar bölümünde kontrol edin: süresi dolmuş veya iptal edilmiş olabilir. Dosya çöp kutusuna taşındığında da bağlantı çalışmayı durdurur.',
    },
    {
      q: 'Bir dosyayı neden silemiyorum?',
      a: 'Ya yalnızca görüntüleme erişiminiz var ya da dosya Bilgi bankasında kullanılıyor. İkinci durumda portal, dosyanın önce kaldırılması gereken makaleleri listeler.',
    },
    {
      q: 'Kotamın aşıldığı yazıyor. Ne yapmalıyım?',
      a: 'Artık ihtiyacınız olmayan dosyaları silin ve çöp kutusunu boşaltın: silinen öğeler çöp kutusu boşaltılana kadar sayılır. Ekip materyallerini kotanızdan düşmeyen bir paylaşılan alanda tutun.',
    },
    {
      q: 'Dosyalar, Dosya sunucusundan nasıl farklı?',
      a: 'Dosyalar portalın kendisinde saklanır. [Dosya sunucusu](/app/drive), izinleri BT tarafından verilen şirket ağ klasörlerini (Windows Gezgini’ndeki bir sürücü gibi) gösterir.',
    },
  ],
  fields: {
    sharePeople: {
      title: 'Kişiler için erişim',
      text: 'İş arkadaşlarını veya grupları ekleyin: Görüntüleyebilir açma ve indirmeye, Düzenleyebilir ayrıca değiştirme ve silmeye izin verir. Klasör erişimi içindeki her şeyi kapsar.',
    },
    linkPassword: {
      title: 'Bağlantı parolası',
      text: 'En az 4 karakter. Bağlantıdan ayrı gönderin, örneğin mesajlaşma uygulamasıyla.',
    },
    linkExpires: {
      title: 'Geçerlilik süresi',
      text: 'Bu tarihten sonra bağlantı kendiliğinden çalışmayı durdurur. Boşsa, yönetici bir sınır koymadıysa süresizdir.',
    },
    linkSlug: {
      title: 'Bağlantı adresi',
      text: 'Rastgele bir adres yerine okunabilir bir adres: Latin harfleri, rakamlar ve kısa çizgiler, 3–64 karakter. Boşsa kimsenin tahmin edemeyeceği rastgele bir adres kullanılır.',
    },
    linkPermissions: {
      title: 'Alıcı neler yapabilir',
      text: 'Hazır bir seçenek seçin veya Özelleştir…. Yalnızca yükleme bir dosya bırakma kutusudur: alıcı dosya gönderir ama klasörde ne olduğunu hiçbir zaman görmez.',
    },
    allowDownload: {
      title: 'İndirmeye izin ver',
      text: 'Dosyanın yalnızca tarayıcıda görüntülenebilmesi için kapatın.',
    },
    spaceVisibility: {
      title: 'Kimler erişir',
      text: 'Alanın başlangıç kuralları. Bunları daha sonra alan menüsü → Erişim bölümünde ayrıntılı ayarlayın.',
    },
    quota: {
      title: 'Kişisel depolama',
      text: 'Her kişinin Dosyalarım alanı için sınır, çöp kutusu dahil. Paylaşılan alanlar sayılmaz.',
    },
    requirePassword: {
      title: 'Zorunlu parola',
      text: 'Yeni herkese açık bağlantılar parolasız oluşturulamaz. Mevcut bağlantılar değişmez.',
    },
  },
};
