export default {
  title: 'Dosya sunucusu',
  tagline: 'Şirketin ağ klasörleri doğrudan tarayıcıda',
  summary: 'Şirketin dosya sunucusundaki tüm klasörler tek bir ağ sürücüsünde toplanır: Windows Gezgini gibi, ancak tarayıcıda ve her cihazda. Belgeleri ve çizimleri görüntüleyin, dosya yükleyin, yeniden adlandırın ve taşıyın, klasörleri ZIP olarak indirin ve bağlantıyla paylaşın. Neyi açıp değiştirebileceğinize, iş bilgisayarınızda olduğu gibi dosya sunucusu karar verir.',
  highlights: [
    {
      title: 'Tüm klasörler tek yerde',
      text: 'Farklı sunuculardaki klasörler, izinleriniz ve boş alanla birlikte tek ekranda.',
    },
    {
      title: 'Etki alanı hesabınız',
      text: 'Windows kullanıcı adınızla oturum açın; izinler Gezgin’dekiyle aynıdır.',
    },
    {
      title: 'İndirmeden görüntüleme',
      text: 'PDF, Word, Excel, görseller, video ve hatta AutoCAD çizimleri tarayıcıda açılır.',
    },
    {
      title: 'ZIP olarak indirme',
      text: 'Bütün bir klasör veya seçilen dosyalar tek bir arşivde.',
    },
    {
      title: 'İş ortakları için bağlantılar',
      text: 'Bir dosyayı veya klasörü bağlantıyla paylaşın: parolalı, süreli veya yalnızca çalışanlar için.',
    },
    {
      title: 'Sık kullanılanlar ve son kullanılanlar',
      text: 'İhtiyacınız olan klasörleri yıldızlayın ve tek tıklamayla onlara geri dönün.',
    },
  ],
  tips: [
    'Sık kullandığınız klasörleri ☆ ile yıldızlayın: Sık kullanılanlar’da görünürler.',
    'Ağ yolunu kopyala, \\\\server\\share gibi bir adres verir: bunu Windows Gezgini’ne yapıştırın.',
    'Etki alanı parolanızı mı değiştirdiniz? Bağlantılar’a gidin ve yeniden oturum açın.',
    'Sunucuda silme kalıcıdır, çöp kutusu yoktur. Önce seçiminizi kontrol edin.',
    'Bir klasöre erişiminiz yok mu? Amirinizden veya BT’den sizi doğru gruba eklemesini isteyin.',
    'Kendi belgelerinizi [Dosyalar](/app/files) bölümünde tutun.',
  ],
  sections: [
    {
      title: 'Bir sunucuya bağlanma ve kimlik bilgileri',
      body: `Dosya sunucusu sizi **etki alanı hesabınızla**, yani Windows’ta oturum açmak için kullandığınız hesapla içeri alır. Portalda Active Directory üzerinden oturum açtıysanız bağlantı genellikle otomatik kurulur.

Bir klasör kutucuğunda **Oturum açılması gerekiyor** yazıyorsa **Oturum aç**’a basın ve kullanıcı adınızı ve parolanızı girin. Her biçim çalışır: ivan.petrov, CORP\\ivan.petrov veya ivan@corp.local. Etki alanı alanı genellikle boş bırakılır.

**Bağlantılar** her sunucuyu hangi hesabın açtığını gösterir. Orada hesap değiştirebilir veya **Bu kimlik bilgilerini unut**’a basabilirsiniz.`,
      steps: [
        'Bağlantılar’ı açın veya bir klasör kutucuğunda Oturum aç’a basın.',
        'Etki alanı kullanıcı adınızı ve parolanızı girin.',
        'Oturum aç’a basın: sunucu bilgileri kontrol eder ve klasörler açılır.',
      ],
      note: 'Parola şifreli olarak saklanır ve görüntülenemez. Sunucu parolayı reddederse (örneğin değiştirdiyseniz) portal onu denemeyi bırakır, böylece etki alanı hesabınız kilitlenmez. Yeniden oturum açmanız yeterlidir.',
    },
    {
      title: 'Klasörlere göz atma',
      body: `**Genel bakış** sayfası her klasör için izinlerinizi (**Okuma ve yazma** veya **Salt okunur**) ve boş alanı gösteren bir kutucuk, ayrıca sık kullanılanları ve son dosyaları gösterir.

Bir klasörün içinde:

- gezinti yolu konumu gösterir ve yukarı geri götürür;
- ada, tarihe, boyuta veya türe göre sıralanan ızgara veya liste görünümü;
- **Bu klasörde ara** klasörde ve tüm alt klasörlerinde arar;
- sistem dosyaları için **Gizli dosyaları göster**;
- aynı yeri Gezgin’de açmak için **Ağ yolunu kopyala**.`,
      note: 'Bir klasör eksikse sunucuda ona erişiminiz yoktur. BT erişimi Active Directory güvenlik grupları aracılığıyla verir.',
    },
    {
      title: 'Görüntüleme, indirme ve yükleme',
      body: `Bir dosya, tam pencere olarak **kendi sayfasında** açılır: ‹ › komşu dosyalar arasında geçiş yapar, adres yer imlerine eklenebilir veya bir iş arkadaşına gönderilebilir.

PDF (sayfalar, slaytlar ve tam ekran sunum), görseller, Word, Excel, diğer Office dosyaları, video ve ses tarayıcıda açılır. Metin ve Markdown dosyaları **doğrudan portalda düzenlenebilir**: Ctrl+S sunucuya kaydeder.

Düğmeyle veya sürükle-bırakla yükleyin. Klasörde aynı adlı dosyalar zaten varsa **Değiştir**, **İkisini de koru** veya **Atla**’yı seçin.

**Bütün klasörler** de bırakılabilir veya düğmenin yanındaki okla → **Klasör yükle** seçilebilir: alt klasörler sunucuda oluşturulur ve her dosya yerine düşer. Klasör zaten varsa içerikler birleştirilir ve içerideki dosyalara *Değiştir / İkisini de koru / Atla* uygulanır. İlerleme, iptal ve yüklenemeyen dosyaların listesi sağ alttaki paneldedir.`,
      example: {
        title: 'Fiyat listesini güncelleme',
        body: 'Yeni “Fiyatlar.xlsx” dosyasını *Satış* klasörüne sürükleyin. Portal dosyanın zaten var olduğunu söyler; Değiştir’i seçin. Bir iş arkadaşınız dosyayı şu anda Excel’de açık tutuyorsa portal daha sonra yeniden denemenizi ister.',
      },
      note: 'Değişiklik düğmeleri yalnızca sunucunun size yazma erişimi verdiği yerlerde görünür. Salt okunur klasörlerde görüntüleyebilir ve indirebilirsiniz.',
    },
    {
      title: 'Yeniden adlandırma, taşıma ve silme',
      body: `Dosya menüsü (sağ tıklama veya ⋯) **yeniden adlandırma**, **taşıma veya kopyalama** ve **silme** sağlar. Aynı anda işlem yapmak için birkaç dosya seçin.

Taşıma ve kopyalama yalnızca **aynı sunucunun** klasörleri arasında çalışır. Adlar \\ / : * ? " < > | karakterlerini içeremez.`,
      steps: [
        'Dosyaları seçin ve Taşı veya kopyala’yı seçin.',
        'Hedef penceresinde hedef klasörü açın.',
        'Buraya taşı veya Buraya kopyala’ya basın.',
      ],
      note: 'Silme doğrudan dosya sunucusunda gerçekleşir; çöp kutusu yoktur. Bir dosyayı yedekten yalnızca BT geri yükleyebilir.',
    },
    {
      title: 'ZIP olarak indirme',
      body: 'Birçok dosyayı aynı anda almak için onları seçin ve **ZIP indir**’e basın veya bir klasörün menüsünde **Klasörü ZIP olarak indir**’i seçin. Arşiv anında oluşturulur ve alt klasörleri korur.',
      example: {
        title: 'Bir belge setini gönderme',
        body: 'Bir muhasebecinin çeyreğin tüm tutanaklarını denetçiye iletmesi gerekiyor. “Tutanaklar\\2026-Q3” klasörünü açar, Klasörü ZIP olarak indir’i seçer ve e-postaya tek bir dosya ekler.',
      },
    },
    {
      title: 'Herkese açık bağlantılar',
      body: `Bir dosya veya klasör menüsünde **Bağlantıyla paylaş**’ı seçin. Ana ayarlar hemen oradadır:

- **Alıcı neler yapabilir**: Görüntüleme veya Görüntüleme ve indirme (varsayılan); klasörler için Diğer… diğer seçenekleri açar;
- **Geçerlilik süresi**: süresiz, 1, 7 veya 30 gün ya da bir tarih;
- **Parola**: isteğe bağlı, en az 4 karakter, Oluştur düğmesiyle;
- **Bağlantı adresi**: \`/d/chertezhi-sever\` gibi okunabilir bir adres, siz yazarken kontrol edilir (Kullanılabilir / Kullanımda); boşsa rastgele bir adres kullanılır.

**Gelişmiş ayarlar** şunları içerir: Yalnızca yükleme (alıcı dosya gönderir ve klasörde ne olduğunu hiçbir zaman görmez), Görüntüleme ve yükleme, Tam erişim veya tek tek eylemler (yükleme, klasör oluşturma, yeniden adlandırma, değiştirme, silme); yükleme kuralları (boyut, türler, toplam sınır, ziyaretçinin adı ve e-postası, bildirimler); alıcı için bir başlık ve mesaj; **kimler açabilir** (Bağlantıya sahip herkes veya Yalnızca çalışanlar); ve alıcının sayfasının önizlemesi.

Oluştur ve kopyala bağlantıyı panoya koyar ve bir QR kod ile Alıcı olarak aç seçeneğini gösterir. Bir bağlantıyı daha sonra bağlantı penceresinde veya **Bağlantılarım** altında değiştirebilirsiniz. Adresi değiştirmek eskisini hemen durdurur.

Bir bağlantı üzerinden yapılan değişiklikler sizin dosya sunucusu hesabınızla yapılır; bu yüzden yalnızca kendiniz yapabildiklerinizi verebilirsiniz. **Dosya sunucularında geri dönüşüm kutusu yoktur**: bir bağlantı üzerinden silme geri alınamaz, bu izni dikkatle verin.`,
      example: {
        title: 'Bir yüklenici için çizimler',
        body: 'Bir mühendis “Kuzey projesi\\Çizimler” klasörünü herkes için, parolalı ve 30 günlük bir bağlantıyla paylaşır. Yüklenici DWG dosyalarını tarayıcıda görüntüler ve ihtiyacı olanları indirir, ancak bu klasörün dışında hiçbir şey görmez. Bir müşteriden tarama toplamak için bir satış temsilcisi ad soran bir “Yalnızca yükleme” bağlantısı oluşturur: müşteri dosyaları bırakır, yalnızca kendi yüklediklerini görür ve satış temsilcisi tek bir bildirim alır.',
      },
      note: 'Bağlantı sizin adınıza çalışır: siz çalışan olduğunuz ve sunucuda öğeye erişiminiz olduğu sürece. Erişiminizi kaybederseniz veya şirketten ayrılırsanız bağlantı otomatik olarak kapanır.',
    },
    {
      title: 'AutoCAD çizimlerini görüntüleme',
      body: `**DWG** ve **DXF** dosyaları yerleşik CAD görüntüleyicide açılır, AutoCAD gerekmez:

- kaydırmak için sürükleyin, yakınlaştırmak için tekerleği çevirin;
- **Ekrana sığdır** tüm çizimi yeniden gösterir;
- **Katmanlar** ihtiyacınız olmayanları gizlemenizi sağlar.

Büyük bir çizim ilk seferde birkaç saniye sürebilir.`,
      note: 'Bir çizim gösterilmiyorsa biçimi henüz desteklenmiyordur: indirin ve AutoCAD’de açın.',
    },
    {
      title: 'Etkinlik günlüğü (yöneticiler)',
      body: `**Etkinlik günlüğü** dosya sunucusunda kimin ne yaptığını gösterir: açma, arama, indirme, yükleme, yeniden adlandırma, taşıma, silme, bağlantı oluşturma ve oturum açma. Zamanı, kişiyi (veya bağlantı ziyaretçisini ve IP’yi), klasörü, yolu ve sonucu görürsünüz.

“Dosya sunucusu etkinlik günlüğü” izni gerekir. Bir dosya veya klasör menüsündeki **Etkinlik geçmişi**, günlüğü o öğeye göre filtrelenmiş olarak açar.

Filtreler: dönem, arama, kişiler, eylemler, klasörler, sonuç, portal veya herkese açık bağlantılar. **CSV dışa aktar** eşleşen her şeyi (en fazla 100 000 satır) Excel için indirir.`,
      example: {
        title: 'Sözleşmeyi kim sildi?',
        body: '*Sözleşmeler* klasörünün menüsünü açın → Etkinlik geçmişi, Silme grubunu ve “7 gün”ü seçin. Liste dosyayı kimin ve ne zaman sildiğini gösterir.',
      },
      note: 'Aynı dosyayı veya klasörü birkaç dakika içinde yeniden açmak tek bir olay sayılır.',
    },
    {
      title: 'Sunucular ve klasörler (yöneticiler)',
      body: `**Ayarlar → Modüller → Dosya sunucusu** (“Dosya sunucusu yöneticisi” izni).

**Genel:** sürücü adı ve alt başlık, dosyaları açma (kendi sayfası veya klasörün üzerinde pencere), “Portal oturum açma bilgilerini kullan”, “Erişim olmayan klasörleri gizle”, en büyük yükleme boyutu, herkese açık bağlantılar ve bunları kimlerin açabileceği, etkinlik günlüğü ve ne kadar süre saklanacağı.

**Bir dosya sunucusu:** ad, adres (DNS veya IP), etki alanı, 445 numaralı bağlantı noktası ve oturum açma modu:

- **Kişisel etki alanı hesapları** (önerilir): NTFS izinleri ve AD grupları her kişiye uygulanır;
- **Tek bir hizmet hesabı**: herkes tek bir hesapla çalışır; klasörlerin görünürlüğünü portal gruplarıyla sınırlayın.

**Test et** bağlantıyı kontrol eder ve paylaşımları listeler.

**Bir klasör:** sürücüdeki adı, paylaşım, isteğe bağlı bir alt klasör, kişilere gösterilen yol (örneğin DFS), “Görebilenler” grupları ve “Herkese açık bağlantılara izin ver”. Klasörler yeniden sıralanabilir.

**Tüm herkese açık bağlantılar** her bağlantıyı oluşturanıyla birlikte listeler; herhangi biri kapatılabilir.`,
      example: {
        title: 'Muhasebe klasörünü yayımlama',
        body: 'fs01 sunucusunda içinde Departments\\Accounting bulunan bir Data paylaşımı var. Bir klasör ekleyin: ad *Muhasebe*, paylaşım Data, alt klasör Departments\\Accounting, “Herkese açık bağlantılara izin ver” kapalı. Kişiler bir *Muhasebe* kutucuğu görür ve onu yalnızca sunucunun izin verdiği kişiler açabilir.',
      },
      note: 'Bir portal yöneticisi bile klasörlerin içinde yalnızca dosya sunucusunun izin verdiklerini görür.',
    },
  ],
  faq: [
    {
      q: 'Hangi kullanıcı adını ve parolayı girmeliyim?',
      a: 'Windows iş bilgisayarınızda kullandıklarınızı (etki alanı hesabınız). Etki alanı alanı genellikle boş bırakılabilir.',
    },
    {
      q: 'Sunucunun kayıtlı parolayı reddettiği yazıyor. Ne yapmalıyım?',
      a: 'Büyük olasılıkla etki alanı parolanızı değiştirdiniz. Bağlantılar’ı açın ve yenisiyle yeniden oturum açın. Portal eski parolayı denemeyi bırakır, böylece hesabınız kilitlenmez.',
    },
    {
      q: 'Bir klasörü neden göremiyorum veya neden kilitli görünüyor?',
      a: 'Hesabınızın sunucuda o klasöre izni yok. Amirinizden veya BT’den sizi doğru güvenlik grubuna eklemesini isteyin.',
    },
    {
      q: 'Silinen bir dosyayı geri yükleyebilir miyim?',
      a: 'Portalda hayır: dosya sunucusunda çöp kutusu yoktur. BT ile iletişime geçin; dosyayı yedekten geri yükleyebilirler.',
    },
    {
      q: '“Dosya başka bir programda açık” yazıyor.',
      a: 'Bir iş arkadaşınız dosyayı açık tutuyor, örneğin Word’de veya Excel’de. Görüntüleyebilirsiniz; o kapattığında değiştirebilirsiniz.',
    },
    {
      q: 'Gönderdiğim bir bağlantı neden çalışmayı durdurdu?',
      a: 'Süresi dolmuş, siz kapatmış olabilirsiniz, dosya sunucuda taşınmış veya silinmiş ya da ona erişiminizi kaybetmiş olabilirsiniz. Bağlantılarım her bağlantının durumunu gösterir.',
    },
    {
      q: 'Aynı klasörü Windows Gezgini’nde nasıl açarım?',
      a: 'Ağ yolunu kopyala’ya basın ve Gezgin’in adres çubuğuna yapıştırın.',
    },
  ],
  fields: {
    linkAudience: {
      title: 'Kimler açabilir',
      text: '“Bağlantıya sahip herkes” iş ortakları ve müşteriler içindir. “Yalnızca çalışanlar” yalnızca portalda oturum açtıktan sonra açılır.',
    },
    linkExpires: {
      title: 'Geçerlilik süresi',
      text: 'Bu tarihten sonra bağlantı kendiliğinden kapanır. Yönetici süreyi sınırlayabilir.',
    },
    linkWrite: {
      title: 'Değişikliğe izin veren bağlantılar',
      text: 'Kişilerin bağlantılar üzerinden yükleme, yeni klasör, yeniden adlandırma, değiştirme ve silme izni vermesini sağlar. Her şey bağlantıyı oluşturanın hesabıyla ve onun sunucudaki izinleri dahilinde çalışır; her eylem ziyaretçinin adıyla günlüğe yazılır.',
    },
    username: {
      title: 'Kullanıcı adı',
      text: 'Windows kullanıcı adınız: ivan.petrov, CORP\\ivan.petrov veya ivan@corp.local.',
    },
    domain: {
      title: 'Etki alanı',
      text: 'Genellikle boş bırakılır: şirket etki alanı kullanılır. Yalnızca BT istediyse doldurun.',
    },
    authMode: {
      title: 'Kişiler nasıl oturum açar',
      text: 'Kişisel hesaplar her kişinin NTFS ve AD grubu izinlerini korur. Bir hizmet hesabı herkese aynı izinleri verir, bu yüzden klasörleri portal gruplarıyla sınırlayın.',
    },
    activityLog: {
      title: 'Etkinlik günlüğü',
      text: 'Kimin neyi açtığını, indirdiğini, değiştirdiğini ve sildiğini kaydeder. “Dosya sunucusu etkinlik günlüğü” iznine sahip kişiler okuyabilir.',
    },
  },
};
