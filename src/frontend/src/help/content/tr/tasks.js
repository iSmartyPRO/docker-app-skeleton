export default {
  title: 'Görevler',
  tagline: 'Atamalar, son tarihler ve sonuçlar tek yerde, her görev için bir sohbetle.',
  summary: 'Kendinize ve iş arkadaşlarınıza görev verin, son tarihleri takip edin ve hatırlatmalar alın. Her görevin kontrol listeleri, dosyaları, bir sonucu ve tüm geçmişiyle kendi sohbeti vardır. Görevler panolu projelerde gruplanabilir, bir takvime göre yinelenebilir ve akışlar aracılığıyla bir ekibe dağıtılabilir.',
  highlights: [
    {
      title: 'Hızlı veya ayrıntılı',
      text: 'Hızlı form beş saniye sürer; «Tam form» kontrol listelerini, gözlemcileri, hatırlatıcıları ve diğer her şeyi ekler.',
    },
    {
      title: 'Açık roller',
      text: 'Oluşturan, sorumlu, ortak sorumlular ve gözlemciler: herkes kendi iş payını Görevlerim sekmelerinde görür.',
    },
    {
      title: 'Son tarihler ve hatırlatmalar',
      text: 'Portal son tarihleri kendisi hatırlatır; kendi hatırlatıcılarınız uygulamaya, e-postaya, Telegram’a, WhatsApp’a veya Mattermost’a gidebilir.',
    },
    {
      title: 'Yalnızca bir onay işareti değil, bir sonuç',
      text: '«Sonuç gerekli» seçeneğini açın; sorumlu neyin yapıldığını gösterene kadar görev kapatılamaz.',
    },
    {
      title: 'Her görevde bir sohbet',
      text: 'Tartışma, dosyalar ve göreve yapılan her değişiklik tek bir akışta, e-posta yazışmaları olmadan.',
    },
    {
      title: 'Görevi kabul etme',
      text: 'Sorumlu görevi üstlendiğini onaylar; zamanında kabul edilmeyen görev kırmızıya döner ve oluşturan bundan haberdar olur.',
    },
    {
      title: 'Şablonlar ve yinelemeler',
      text: 'Rutin görevler tek tıklamayla şablondan oluşturulur, yinelenenler ise takvime göre kendiliğinden belirir.',
    },
  ],
  tips: [
    'Tam formu doğrudan açmak veya şablondan görev oluşturmak için «＋ Oluştur»un yanındaki oka tıklayın.',
    'Açıklamadaki satırları seçin ve kontrol listesi maddelerine dönüştürmek için «Kontrol listesi»ne tıklayın.',
    'Görev sohbetindeki herhangi bir mesaj sonuç olabilir: «⋯ → Sonuca ekle».',
    'Son tarihi olan bir görev Takvim’de kendi tarihinde görünür; son tarihi taşımak için onu başka bir güne sürükleyin.',
    'Gecikiyor musunuz? Görevin sessizce gecikmesine izin vermeyin: son tarihi taşıyın veya görev sohbetinde oluşturana yazın.',
    'HR-12 gibi bir görev bağlantısı herhangi bir sohbete yapıştırılabilir; iş arkadaşınız onu tek tıklamayla açar.',
  ],
  sections: [
    {
      title: 'Görev oluşturma: hızlı ve tam form',
      body: `**«＋ Oluştur»** düğmesi hızlı formu açar: başlık, kısa bir açıklama, sorumlu ve son tarih. Varsayılan olarak sorumlu sizsiniz ve son tarih bir hafta sonra saat 19:00’dur. Altta **Dosyalar**, **Kontrol listeleri** ve **Proje** düğmeleri bulunur.

Görevin ortak sorumlulara, gözlemcilere, hatırlatıcılara veya bir sonuca ihtiyacı varsa **«Tam form →»**a tıklayın: yazdığınız her şey aktarılır. «Oluştur»un yanındaki ok tam formu doğrudan açar veya **şablondan** görev oluşturur.

Tam formda ek bloklar ana alanların altındaki düğmelerle açılır: «Sonuçlar», «Kontrol listeleri», «Ortak sorumlular», «Hatırlatıcılar» ve diğerleri. Form hangi blokları açtığınızı hatırlar ve bir dahaki sefere gösterir.

Başlığın yanındaki **alev** görevi **önemli** olarak işaretler: listelerde öne çıkar ve diğerleri arasında daha kolay fark edilir.`,
      steps: [
        '«＋ Oluştur»a tıklayın ve ne yapılması gerektiğini yazın.',
        'Sorumluyu ve son tarihi seçin veya olduğu gibi bırakın.',
        'Gerekirse «Tam form →»u açın ve ihtiyacınız olan blokları etkinleştirin.',
        '«Oluştur»a tıklayın veya Enter’a basın. Görev HR-12 gibi bir numara alır.',
      ],
      example: {
        title: 'Örnek: «Sözleşmeyi hukuk ekibiyle uzlaştır»',
        body: 'Bir yönetici görevi hızlı formda oluşturur, sorumlu olarak bir hukukçuyu ve son tarih olarak «Hafta sonu»nu seçer. Ardından tam formu açar, sözleşme taslağını ekler ve departman amirini gözlemci olarak ekler.',
      },
      note: 'Birkaç sorumlu seçerseniz (sorumlunun yanındaki «＋») her biri görevin **kendi kopyasını** alır; aynı işi birkaç kişiye vermek için kullanışlıdır.',
    },
    {
      title: 'Roller: kim neden sorumlu',
      body: `- **Oluşturan**: görevi veren kişi. Son tarih dahil görevdeki her şeyi değiştirebilir, sonucu kabul eder ve değerlendirir, görevi silebilir.
- **Sorumlu**: görevi yapmaktan sorumlu kişi. Görevi başlatır ve tamamlar, devredebilir. Son tarihi yalnızca oluşturan izin verirse değiştirebilir.
- **Ortak sorumlular**: sorumluya yardım eder ve görevi aynı şekilde düzenleyip tamamlayabilir.
- **Gözlemciler**: ilerlemeyi takip eder. Görevi görür, sohbetinde yazar ve bildirim alır, ancak hiçbir şeyi değiştirmez.

Görev katılımcıları, projesine erişimleri olmasa bile görevi görür.

**Devret** (görevin altındaki «⋯» menüsü) görevi başka bir kişiye verir. Önceki sorumlu gözlemci olur ve olanları görmeye devam eder.`,
      example: {
        title: 'Örnek: yönetim için bir rapor',
        body: 'Finans direktörü «Çeyrek raporu»nun oluşturanıdır. Baş muhasebeci sorumlu, rakamları toplayan bir ekonomist ortak sorumludur ve genel müdür sormadan ilerlemeyi görmek için gözlemci olarak eklenmiştir.',
      },
    },
    {
      title: 'Görevi kabul etme',
      body: `**Başka birine** verilen görev önce **kabul bekler**. Sorumlu görevin üstünde iki düğmeli bir bant görür:
- **«Kabul et»** görevin anlaşıldığını ve üstlenildiğini onaylar. Oluşturan için kısa bir yorum ekleyebilirsiniz;
- **«Tartış»** görevi üstlenmeden önce bazı şeyleri netleştirmek için görev sohbetini açar.

Görevi **başlatmak**, «Devam ediyor» türündeki bir duruma taşımak veya doğrudan **tamamlamak** da onu kabul eder. Sohbette bir «Kabul eden: ad · saat» işareti kalır ve oluşturan bir bildirim alır.

**Kendinize** verdiğiniz görevler otomatik olarak kabul edilir. Bir görev **devredildiğinde** veya başka bir sorumlu aldığında yeni sorumlu onu yeniden kabul eder. Ortak sorumlular sorumluya yardım eder ve ayrıca kabul etmez.

**Kabul süresi** 24 saattir, önemli görevler için (alevli) 4 saat. Bunu yönetici modül ayarlarında, proje yöneticisi kendi projesi için (proje menüsü → «Projeyi düzenle») değiştirir. Zamanında kabul edilmeyen görev listelerde, panoda, görevde ve Görevlerim’de «N saattir kabul edilmedi» etiketiyle **kırmızıya döner**; sorumlu bir hatırlatma, oluşturan bir bildirim alır (her biri bir kez). Kaçırılan son tarih, son tarihte ayrı bir kırmızı etikettir.`,
      steps: [
        'Görevi bildirimden, Görevlerim’den («Kabulümü bekleyenler» grubu) veya «Beni bekleyenler» sayfasından açın.',
        'Açıklamayı okuyun. Bir şey belirsizse «Tartış»a tıklayın ve sohbette sorun.',
        '«Kabul et»e tıklayın (veya önce «Yorum ekle»).',
      ],
      example: {
        title: 'Örnek: «Bir yönetici bul, 5 gün»',
        body: 'Direktör İK uzmanına bir talimat verir. 24 saat sonra görev hâlâ kabul edilmemiştir: «24 saattir kabul edilmedi» etiketiyle kırmızıya döner, İK uzmanı bir hatırlatma, direktör bir bildirim alır. İK uzmanı «Tartış»a tıklar, gereksinimleri netleştirir ve görevi kabul eder.',
      },
    },
    {
      title: 'Talimatlar',
      body: `**Talimat** («поручение») yönetimin verdiği bir görevdir. Bir görev şu durumlarda talimattır:
- oluşturanı «Yönetim grupları»ndan birine aitse (yönetici bunları modül ayarlarında seçer) ve sorumlu başka biriyse;
- veya **«Talimat»** işareti açıksa (alevin yanındaki yer imi simgesi; oluşturan veya proje yöneticisi koyar).

Talimatlar kartlarda ve listelerde bir rozet taşır. Görevlerim’de ve bir projede listenin üstündeki **«Talimatlar»** çipi yalnızca onları gösterir.

Listelerin üstünde **sayaçlı hızlı filtreler** bulunur: «Acil», «Gecikmiş», «Kabul edilmemiş», «Devam eden», «Tamamlanan» ve «Talimatlar». Temizlemek için bir çipe yeniden tıklayın.`,
    },
    {
      title: 'Son tarihler ve planlama',
      body: `Son tarih tek tıklama ister: **Bugün**, **Yarın**, **Hafta sonu**, **Bir hafta sonra**, **Ay sonu** veya takvimde herhangi bir tarih ve tam bir saat. «Son tarih yok» son tarihi kaldırır.

Gecikmiş bir görev, ne kadar geciktiği yanında yazılı olarak vurgulanır. Görevlerim’de görevler son tarihe göre gruplanır: gecikmiş, bugün, yarın, önümüzdeki 7 gün ve daha sonra.

**«Planlama»** bloğu (son tarihin yanındaki 🗓 düğmesi) daha uzun görevler içindir:
- planlanan **Başlangıç** ve **Bitiş** tarihleri ve süreleri;
- **Sorumlunun planlanan tarihleri değiştirmesine izin ver**: kapalıyken son tarihi yalnızca oluşturan taşıyabilir;
- **Hafta sonlarını atla**;
- **Son tarih alt görevlere bağlı**: görevin son tarihi alt görevlerinin en geç son tarihi olur.

Bir görev şimdilik güncel değilse onu **erteleyebilirsiniz** (görevin altındaki «⋯» menüsü): ertelenen görevler hatırlatma göndermez ve ayrı bir grupta gösterilir.`,
      note: 'Son tarih taşındığında hatırlatmaları yeni tarih için yeniden kurulur.',
    },
    {
      title: 'Hatırlatmalar',
      body: `Portal son tarihleri kendisi hatırlatır: sorumluya son tarihten bir gün önce, görev geciktiğinde ise sorumluya ve oluşturana bildirim gider. Bu hatırlatmalar görev sohbetinde de **«Tamamla»** ve **«Son tarihi değiştir»** düğmeleriyle görünür.

Kendi hatırlatıcılarınız tam formun **«Hatırlatıcılar»** bloğunda eklenir. Şunları seçersiniz:
- **Kime hatırlatılsın**: kendinize, sorumluya, oluşturana veya ortak sorumlulara;
- **Ne zaman**: belirli bir tarih ve saatte veya **son tarihten önce** belirli bir süre;
- **Nasıl**: **Uygulamada** (zil ve anlık bildirim), **E-posta**, **Mesajlaşma uygulamaları** (Telegram, WhatsApp ve Mattermost).

**Bir hatırlatmanın gelmesi için kanalın bağlı olması gerekir:**
- mesajlaşma uygulamaları için Telegram’ı [Profil → Güvenlik](/account/security) bölümünden bağlayın veya Mattermost adınızı [Profil](/account) bölümüne girin;
- anlık bildirimler için kullandığınız cihazda tarayıcıda veya uygulamada bildirimlere izin verin ([bildirim ayarları](/account/notifications));
- e-posta için profilinizde bir adres olmalıdır.

Bir kanal bağlı değilse hatırlatıcı formu bir «Düzelt» bağlantısıyla uyarı gösterir.`,
      steps: [
        'Görevi açın ve «Hatırlatıcılar» bloğunu etkinleştirin.',
        '«＋ Hatırlatıcı ekle»ye tıklayın.',
        'Kime hatırlatılacağını işaretleyin, zamanı ve kanalları seçin.',
        '«Hatırlat»a tıklayın. Gönderilen bir hatırlatıcı «gönderildi» olarak işaretlenir.',
      ],
      example: {
        title: 'Örnek: imzayı unutmayın',
        body: '«Sözleşmeyi hukuk ekibiyle uzlaştır» görevi için oluşturan, sorumluya uygulamada ve Telegram’da «son tarihten 1 gün önce», kendisine ise toplantı günü saat 10:00’da bir hatırlatıcı kurar.',
      },
      note: 'Tamamlanmış görevler için hatırlatma gönderilmez. «Son tarihten önce» hatırlatıcısı yalnızca görevin son tarihi olduğunda kullanılabilir.',
    },
    {
      title: 'Kontrol listeleri',
      body: `Kontrol listesi görevi adımlara böler ve ilerlemeyi gösterir: «3/5 tamamlandı». Bir görevin birkaç kontrol listesi olabilir, örneğin «Hazırlık» ve «İnceleme».

- **Enter** bir madde ekler; aynı anda birkaç satır yapıştırabilirsiniz.
- Maddeler sürüklenebilir, iç içe yerleştirmek için sağa kaydırılabilir ve başka bir kontrol listesine taşınabilir.
- Her maddenin bir «⋯» menüsü vardır: önemli olarak işaretleme, dosya ekleme, bir ortak sorumlu veya gözlemci atama.
- **Toplu eylemler** birkaç maddeyi aynı anda işaretler veya taşır, **Tamamlananları gizle** kalabalığı kaldırır.

Bir kontrol listesinin tüm maddeleri işaretlendiğinde görev sohbeti kontrol listesinin tamamlandığını gösterir.`,
      example: {
        title: 'Örnek: yeni bir çalışan başlıyor',
        body: '«Yeni yönetici 1 Mart’ta başlıyor» görevinde İK bir kontrol listesi tutar: sözleşmeyi hazırla, giriş kartı sipariş et, dizüstü bilgisayar ver, hesap oluştur. «Dizüstü bilgisayar ver» maddesi BT’den birine atanır.',
      },
    },
    {
      title: 'Görevi tamamlama ve sonucu',
      body: `Sorumlu görevi üstlendiğinde **«Başlat»**a, bittiğinde **«Tamamla»**ya tıklar. Tamamlanan bir görev **«Yeniden işleme al»** ile geri gönderilebilir.

**Sonuç gerekli**: oluşturan bunu «Sonuçlar» bloğunda açar («⋯ → Sonuç iste» menüsü). Görev bu durumda sorumlu neyin yapıldığını açıklayana kadar tamamlanamaz: sonuçlar, bağlantılar, nihai belge.

Sonuç «Sonuç ekle» ile veya doğrudan sohbetten eklenir: herhangi bir mesajda **«⋯ → Sonuca ekle»**yi seçin. Yeni bir sonuç oluşturana bildirilir.

Görev tamamlandığında oluşturan onu «İyi» veya «Zayıf» olarak **değerlendirebilir**.`,
      example: {
        title: 'Örnek: rakip fiyat incelemesi',
        body: 'Satış müdürü görevi «Sonuç gerekli» ile verir. Analist tabloyu ve kısa bir sonucu ekleyene kadar görevi kapatamaz; yönetici sonucu doğrudan görev kartında görür.',
      },
    },
    {
      title: 'Dosyalar ve görev sohbeti',
      body: `Görevin sağında **sohbeti** bulunur. Kişiler işi orada tartışır, birbirini arar, dosya paylaşır ve **@** ile iş arkadaşlarından bahseder. Her değişiklik orada otomatik olarak kaydedilir: son tarih, sorumlu ve durum değişiklikleri, eklenen dosyalar, sonuç ve hatırlatmalar. Ayrı yorumlar veya geçmiş yoktur: her şey tek bir akıştadır.

Sohbeti yalnızca görev katılımcıları görür. Görevin ≡ menüsü → «Görev sohbetini sessize al» ile sessize alabilirsiniz.

**Dosyalar** «Dosyalar» bloğunda eklenir: **bilgisayardan**, **Dosyalar’dan** veya **dosya sunucusundan**. Dosyaları bloğun üzerine de bırakabilirsiniz. Telefonda görev ve sohbeti iki ayrı sekmedir.`,
    },
    {
      title: 'Alt görevler, bağlantılar ve Gantt',
      body: `Büyük bir görevi **alt görevler** hâlinde yönetmek daha kolaydır: görevin ≡ menüsünde «Alt görev oluştur»u seçin veya «Alt görevler» bloğunda «＋ Alt görev»e tıklayın. Alt görevin kendi sorumlusu ve son tarihi vardır ve kartı üst göreve geri bağlanır.

**«Üst görev»** bloğu mevcut görevi başka bir görevin alt görevi yapar. **«İlgili görevler»** görevleri yalnızca iki yönlü olarak birbirine bağlar, örneğin bir talep ve faturası.

**«Gantt»** bloğu görevler arasındaki iş sırasını belirler:
- **Bitiş → Başlangıç**: bu görev, bağlantılı görev bittiğinde başlar (en yaygın durum);
- **Başlangıç → Başlangıç**: birlikte başlarlar;
- **Bitiş → Bitiş**: birlikte biterler;
- **Başlangıç → Bitiş**: bu görev, bağlantılı görev başladığında biter.`,
      example: {
        title: 'Örnek: ofis taşınması',
        body: '«Ofis taşınması» görevinin «Kira sözleşmesi», «Mobilya» ve «Ağ ve telefonlar» alt görevleri vardır. «Mobilya», «Kira sözleşmesi»ne bir «Bitiş → Başlangıç» Gantt bağlantısına sahiptir: mobilya ancak kira sözleşmesi imzalandıktan sonra sipariş edilir.',
      },
      note: 'Alt görevler, görev oluşturulduktan sonra eklenebilir.',
    },
    {
      title: 'Şablonlar ve yinelenen görevler',
      body: `**Şablon** kaydedilmiş bir görev formudur: başlık, açıklama, kişiler, kontrol listeleri. Tam formda **«📄 Şablonlar» → «Şablon olarak kaydet»**e tıklayın, ardından bu tür görevleri «＋ Oluştur»un yanındaki ok → «Şablondan görev» ile oluşturun.

**Yinelenen görev** bir takvime göre kendiliğinden oluşturulur. «Yinelenen» bloğunu açın ve şunları ayarlayın:
- **Tekrarlama sıklığı**: N gün, hafta, ay veya yıl ve haftalar için haftanın günleri;
- **Başlangıç tarihi** ve her kopyanın **oluşturma saati**;
- **Bitiş**: elle, N kez sonra veya bir tarihte;
- **Her kopyanın son tarihi**: oluşturulduktan ne kadar sonra teslim edileceği;
- gün **hafta sonlarına ve tatillere** denk geldiğinde ne yapılacağı.

Mevcut bir görev için ≡ menüsü → «Görevleri otomatikleştir» → «Yinelenen yap»ı kullanın. Takvim değişiklikleri gelecekteki tüm kopyalara uygulanır.`,
      example: {
        title: 'Örnek: aylık mutabakat',
        body: 'Muhasebe «Tedarikçi mutabakatı» yinelenen görevini kurar: her ayın 1’inde saat 9:00’da, 3 gün sonra teslim, hafta sonuna denk gelirse pazartesiye taşınır.',
      },
    },
    {
      title: 'Akışlar: ekip için görevler',
      body: `**Akış**, «BT talepleri» veya «İncelenecek sözleşmeler» gibi bir ekibin ortak görev kuyruğudur. Belirli bir kişiyi atamak yerine görevi akışa koyarsınız ve görev üyelerden birine gider:
- **Sırayla**: üyeler birbiri ardına;
- **En az yüklü**: açık görevi daha az olana;
- **Elle**: görevleri biri elle atar.

Akış doğrudan «Akış» bloğunda → «Akış oluştur» ile oluşturulur. Seçilen akışın altında kaç görevin açık ve gecikmiş olduğunu ve zamanında yapılanların oranını görürsünüz.`,
      example: {
        title: 'Örnek: BT talepleri',
        body: 'Ofis yöneticisi «3. kattaki yazıcı bozuk» görevini «En az yüklü» olarak ayarlanmış «BT talepleri» akışına koyar: talep kim boştaysa ona gider ve kimsenin sorumlu seçmesi gerekmez.',
      },
    },
    {
      title: 'Zaman takibi',
      body: `Görevin gerçekte ne kadar sürdüğünü görmek için **«Zaman takibi»** bloğunu ve **«Zamanı takip et»** anahtarını açın.

- **Planlanan süre**: kaç saat ve dakika ayırdığınız.
- **Zamanlayıcı**: ▶ saymaya başlar, ⏸ duraklatır. Zamanlayıcı doğrudan görev başlığında gösterilir.
- Süre her katılımcı için ayrı sayılır ve tahminin yanında gösterilir.`,
    },
    {
      title: 'Görevlerim',
      body: `**Görevlerim** kişisel yapılacaklar listenizdir. Sekmeler rolünüze göredir:
- **Yürüttüklerim**: sorumlu veya ortak sorumlu sizsiniz;
- **Yardım ettiklerim**: ortak sorumlu sizsiniz;
- **Verdiklerim**: oluşturan sizsiniz ve işi başkaları yapıyor;
- **Takip ettiklerim**: gözlemci sizsiniz;
- **Tümü**: her şey bir arada.

Görevler son tarihe göre gruplanır: **Gecikmiş**, **Bugün**, **Yarın**, **Önümüzdeki 7 gün**, **Daha sonra**, **Son tarih yok**, ardından **Ertelenenler** ve **Son tamamlananlar**. Alev önemli görevleri işaretler, bir sayaç alt görevleri gösterir. Seçilen sekme hatırlanır.`,
      note: 'Güne «Yürüttüklerim» ve «Bugün» grubuyla başlayın; hiçbir şey gözden kaçmasın diye «Verdiklerim»i haftada bir kontrol edin.',
    },
    {
      title: 'Projeler, pano ve erişim',
      body: `**Proje** bir departmanın veya iş kolunun görevlerini bir araya getirir. Her projenin bir **anahtarı** vardır: görev numaralarında ve bağlantılarda kullanılan, 2–10 Latin harfi veya rakamdan oluşan kısa bir kod, örneğin HR-12. Addan önerilir («Satış departmanı» → SD) ve oluşturulduktan sonra **değiştirilemez**; böylece bağlantılar hiçbir zaman bozulmaz.

Bir projenin görevleri bir **panoda** (aşamalara göre sütunlar, kartlar sürüklenir) veya **liste** olarak gösterilir. Aşamalar proje menüsü → «İş akışı» bölümünde belirlenir: her biri «Başlanmadı», «Devam ediyor» veya «Tamamlandı» türündedir. Görev «Tamamlandı» türündeki bir aşamaya girdiğinde tamamlanmış olur.

**Kimlerin erişimi var** oluşturma sırasında seçilir: «Herkes, düzenleyebilir», «Herkes, salt okunur» veya «Yalnızca ben». Daha sonra erişim proje menüsü → «Erişim» bölümünde kişiler, gruplar veya roller için ayrıntılı ayarlanır:
- **Görüntüleme**: görevleri görme ve sohbetlerinde yazma;
- **Düzenleme**: görev oluşturma, değiştirme ve taşıma;
- **Yönetme**: ayrıca aşamalar, erişim, arşivleme ve projeyi silme.

Bir görevin **projesi olmayabilir** de: o zaman onu yalnızca katılımcıları görür.`,
      example: {
        title: 'Örnek: bir İK projesi',
        body: 'İK, HR anahtarı ve «Yalnızca ben» erişimiyle «Personel» projesini oluşturur, ardından «Erişim» bölümünde İK grubuna «Düzenleme», yöneticilere «Görüntüleme» verir.',
      },
    },
    {
      title: 'Takvimde görevler',
      body: `Katıldığınız (sorumlu, ortak sorumlu, oluşturan veya gözlemci) ve **son tarihi** olan her görev [Takvim](/app/calendar) içinde kendi tarihinde ve saatinde görünür. Gecikmiş görevler kırmızıyla işaretlenir, tamamlananların üstü çizilir. Görevi açmak için üzerine tıklayın.

- Son tarihini taşımak için bir görevi başka bir güne veya saate **sürükleyin**.
- Takvimin kenar çubuğu **«Son tarihi olmayanlar»** görevleri listeler: son tarih vermek için birini bir güne sürükleyin.
- Doğrudan takvimde görev oluşturun: boş bir alana tıklayın ve «Görev»i seçin.
- Bir görev oluşturduktan sonra bir not, son tarihini o günü açan bir **«Takvimde»** düğmesiyle gösterir.

Hangi görevlerin gösterileceği (yürüttükleriniz, tüm görevleriniz veya görebildiğiniz her şey) ve tamamlananların gösterilip gösterilmeyeceği takvim ayarlarında (⚙) belirlenir.`,
      example: {
        title: '“Bir hafta sonra” son tarihi',
        body: 'Pazartesi bir görev oluşturuyorsunuz; varsayılan son tarih bir hafta sonra saat 19:00’dur. Görev takvimin bu haftasında değil — gelecek pazartesidedir. Oluşturduktan sonra nottaki «Takvimde»ye tıklayın veya gelecek haftaya geçin.',
      },
    },
  ],
  faq: [
    {
      q: 'Bir görev neden «Kabul edilmemiş» ile kırmızı?',
      a: 'Sorumlu görevi kabul süresi içinde (varsayılan 24 saat, önemli görevler için 4 saat) kabul etmedi. Görevde «Kabul et»e tıklayın veya görevi başlatın, etiket kaybolur. Son tarihin kendisi değişmez.',
    },
    {
      q: 'Kendime verdiğim bir görevi kabul etmem gerekir mi?',
      a: 'Hayır, bunlar otomatik olarak kabul edilir. Yalnızca başka birinin size verdiği görevlerin kabul edilmesi gerekir.',
    },
    {
      q: 'Görevim neden takvimde yok?',
      a: `Görev **son tarihinin olduğu günde** görünür. Şunları kontrol edin:
- görevin son tarihi var (yoksa takvim kenar çubuğundaki «Son tarihi olmayanlar» listesindedir);
- doğru hafta gösteriliyor — varsayılan son tarih "bir hafta sonra", yani gelecek haftadır;
- takvim kenar çubuğunda «Görevlerim», ayarlarda (⚙) «Görevleri göster» açık.`,
    },
    {
      q: 'Bir hatırlatma neden gelmedi?',
      a: `Sırayla kontrol edin:
1. Hatırlatıcının tarihi ve saati; hatırlatıcı «son tarihten önce» ise görevin son tarihi olduğu.
2. Görev tamamlanmamış veya ertelenmemiş.
3. Kanallar: Telegram [Profil → Güvenlik](/account/security) bölümünde bağlı, Mattermost [Profil](/account) bölümüne girilmiş, cihazda anlık bildirimler açık, profilinizde bir e-posta var.
4. Mesajlaşma uygulamaları [bildirim ayarlarında](/account/notifications) kapatılmamış.
5. [Bildirim ayarları](/account/notifications) en altta «Son bildirimler»i gösterir: her birinin nereye gittiği ve neden gelmediği. «Test gönder» her kanalı kontrol eder.

Hatırlatma her zaman portalın zilindedir.`,
    },
    {
      q: 'Son tarihi değiştiremiyorum. Neden?',
      a: 'Sorumlu son tarihi yalnızca oluşturan izin verirse değiştirebilir («Planlama» → «Sorumlunun planlanan tarihleri değiştirmesine izin ver»). Görev sohbetinde oluşturana yazın: son tarihi taşıyabilir veya buna izin verebilir.',
    },
    {
      q: '«Tamamla» düğmesi bir hata gösteriyor. Ne yapmalıyım?',
      a: 'Büyük olasılıkla görevde «Sonuç gerekli» açık. «Sonuçlar» bloğunu açın, neyin yapıldığını açıklayın ve kaydedin; ardından görev tamamlanabilir.',
    },
    {
      q: 'Ortak sorumlu ile gözlemci arasındaki fark nedir?',
      a: 'Ortak sorumlu görev üzerinde sorumluyla birlikte çalışır ve görevi düzenleyip tamamlayabilir. Gözlemci yalnızca takip eder: görevi görür, sohbette yazar ve bildirim alır.',
    },
    {
      q: 'Üç sorumlu seçtim: neden üç görev var?',
      a: 'Bu tasarım gereğidir: her sorumlu kendi kopyasını alır ve kendi kısmından sorumludur. Tek bir ortak göreve ihtiyacınız varsa bir sorumlu seçin ve diğerlerini ortak sorumlu olarak ekleyin.',
    },
    {
      q: 'Bir iş arkadaşım görev bağlantısını açamıyor',
      a: 'Görev, katılımcılarına ve projesine erişimi olan kişilere görünür. İş arkadaşınızı gözlemci veya ortak sorumlu olarak ekleyin ya da proje yöneticisinden proje menüsü → «Erişim» bölümünde erişim vermesini isteyin.',
    },
    {
      q: 'Proje anahtarını değiştirebilir miyim?',
      a: 'Hayır. Anahtar projedeki her görev numarasının ve bağlantının bir parçasıdır, bu yüzden oluşturma sırasında bir kez belirlenir. Projenin adı, açıklaması ve rengi değiştirilebilir.',
    },
  ],
  fields: {
    important: {
      title: 'Önemli görev',
      text: 'Alev görevi listelerde ve panoda vurgular, böylece kimse onu kaçırmaz. Son tarihi değiştirmez, ancak önemli bir görevin daha erken — varsayılan olarak 4 saat içinde — kabul edilmesi gerekir.',
    },
    originator: {
      title: 'Oluşturan',
      text: 'Görevi veren kişi: son tarihi değiştirir, sonucu kabul eder ve değerlendirir. Genellikle sizsiniz.',
    },
    assignee: {
      title: 'Sorumlu',
      text: 'Görevi yapmaktan asıl sorumlu kişi. Birkaç sorumlu seçerseniz her biri görevin kendi kopyasını alır.',
    },
    deadline: {
      title: 'Son tarih',
      text: 'Görevin ne zaman yapılması gerektiği. Önceden bir hatırlatma gelir ve görev o gün sorumlunun Takvim’inde görünür.',
    },
    coassignees: {
      title: 'Ortak sorumlular',
      text: 'Sorumluya yardım eder, görevi düzenleyip tamamlayabilirler. Görev onların «Yardım ettiklerim» sekmesinde görünür.',
    },
    auditors: {
      title: 'Gözlemciler',
      text: 'Görevi takip ederler: görürler, sohbette yazarlar ve bildirim alırlar, ancak hiçbir şeyi değiştirmezler.',
    },
    results: {
      title: 'Sonuçlar',
      text: 'Neyin yapıldığı. «Sonuç gerekli» ile bir sonuç eklenene kadar görev tamamlanamaz («⋯» menüsü).',
    },
    flow: {
      title: 'Akış',
      text: 'Bir ekip görev kuyruğu: görev sırayla bir üyeye veya en az yüklü olana gider.',
    },
    reminders: {
      title: 'Hatırlatıcılar',
      text: 'Görev hakkında kime, ne zaman ve nereye hatırlatılacağı. Telegram’ı «Profil → Güvenlik» bölümünden bağlayın ve Mattermost’u «Profil»e girin.',
    },
    reminderChannels: {
      title: 'Hatırlatma kanalları',
      text: '«Uygulamada» zil ve anlık bildirim demektir (cihazda anlık bildirimlere izin verilmelidir). «Mesajlaşma uygulamaları», Telegram bağlıysa (Profil → Güvenlik) veya Mattermost Profil’de ayarlıysa çalışır.',
    },
    recurring: {
      title: 'Yinelenen görev',
      text: 'Görev bir takvime göre (günlük, haftalık, aylık veya yıllık) her kopya için kendi son tarihiyle kendiliğinden oluşturulur.',
    },
    planning: {
      title: 'Planlama',
      text: 'Planlanan başlangıç ve bitiş, hafta sonlarını atlama ve alt görevlerden son tarih. Sorumlunun son tarihi taşıyıp taşıyamayacağına da burada karar verirsiniz.',
    },
    timeTracking: {
      title: 'Zaman takibi',
      text: 'Planlanan süre ve bir zamanlayıcı: görevin her katılımcı için gerçekte ne kadar sürdüğünü görürsünüz.',
    },
    gantt: {
      title: 'Gantt bağlantıları',
      text: 'Görevler arasındaki iş sırası. En sık «Bitiş → Başlangıç» gerekir: bu görev bağlantılı görevden sonra başlar.',
    },
    acceptHours: {
      title: 'Kabul süresi',
      text: 'Sorumlunun bu projenin bir görevini kabul etmek için kaç saati olduğu. Boşsa modül ayarlarındaki gibidir.',
    },
    projectKey: {
      title: 'Proje anahtarı',
      text: 'Görev numaraları ve bağlantılar için Latin harfleri ve rakamlardan oluşan kısa bir kod, örneğin HR-12. Oluşturulduktan sonra değiştirilemez.',
    },
    projectAccess: {
      title: 'Kimlerin erişimi var',
      text: 'Projeye başlangıç erişimi. Daha sonra kişiler, gruplar ve roller için proje menüsü → «Erişim» bölümünde ayrıntılı ayarlayabilirsiniz.',
    },
  },
};
