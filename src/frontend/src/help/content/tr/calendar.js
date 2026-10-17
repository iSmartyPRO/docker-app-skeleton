export default {
  title: 'Takvim',
  tagline: 'Toplantılar, görev son tarihleri ve paylaşılan takvimler tek yerde',
  summary: 'Toplantı planlayın, iş arkadaşlarınızı davet edin ve hatırlatıcılar alın. Son tarihi olan görevler takvimde kendiliğinden görünür — onları fareyle taşıyın veya doğrudan burada oluşturun. Herkes takvimi kendine göre ayarlar: görünüm, çalışma saatleri, hangi görevlerin gösterileceği.',
  highlights: [
    {
      title: 'Etkinlikler ve davetler',
      text: 'Katılımcılı, konumlu, görüntülü arama bağlantılı ve “katılıyorum / katılmıyorum” yanıtlı toplantılar.',
    },
    {
      title: 'Takvimde görevler',
      text: 'Görevlerinizin son tarihleri toplantıların yanında durur; son tarihi değiştirmek için görevi sürükleyin.',
    },
    {
      title: 'Hızlı oluşturma',
      text: 'Boş bir alana tıklayın ve “Etkinlik” veya “Görev”i seçin.',
    },
    {
      title: 'Yinelenme ve hatırlatıcılar',
      text: 'Haftalık kısa toplantılar, önceden hatırlatmalar — portala, anlık bildirim olarak, e-postayla ve mesajlaşma uygulamalarına.',
    },
    {
      title: 'Paylaşılan takvimler',
      text: 'Gruplarla paylaşılan ekip veya toplantı odası takvimleri; değişikliklerden haberdar olmak için bir takvimi takip edin.',
    },
    {
      title: 'Size göre',
      text: 'Görünüm, haftanın ilk günü, çalışma saatleri, ızgara adımı, hafta sonları, hangi görevlerin gösterileceği.',
    },
  ],
  tips: [
    'Izgarada tıklayıp sürükleyin — etkinlik hemen o uzunlukta oluşur.',
    'Son tarih vermek için bir görevi “Son tarihi olmayanlar” listesinden bir güne sürükleyin.',
    'Soldaki onay işaretleri takvimleri, davetleri ve görevleri gizler ve gösterir — seçiminiz hatırlanır.',
    'O günü açmak için gün numarasına tıklayın.',
    'Üst çubuktaki ⚙ takvim ayarlarınızı açar.',
  ],
  sections: [
    {
      title: 'Görünümler ve gezinme',
      body: `Görünümleri üstten değiştirin: **Ay**, **Hafta**, **Çalışma haftası** (cumartesi ve pazar olmadan), **Gün** ve **Ajanda** — günlere göre etkinlik listesi. **Bugün** geçerli tarihe döner, ‹ › okları ileri ve geri götürür.

Soldaki mini takvim herhangi bir tarihe atlar. Telefonda yan panel ☰ ile açılır.`,
    },
    {
      title: 'Etkinlik oluşturma',
      body: 'Etkinlik bir toplantı veya meşgul zamandır: başlık, başlangıç ve bitiş, takvim, katılımcılar, konum, görüntülü arama bağlantısı, hatırlatıcılar, açıklama ve renk.',
      steps: [
        'Boş bir alana tıklayın (veya gereken uzunlukta sürükleyin) ya da soldaki **+ Etkinlik** düğmesine basın.',
        'Hem etkinlikler hem görevler kullanılabiliyorsa **Etkinlik**’i seçin.',
        'Başlığı girin, saati kontrol edin, takvimi seçin ve katılımcıları davet edin.',
        'Bir konum veya arama bağlantısı ve bir hatırlatıcı ekleyin. **Kaydet**’e tıklayın.',
      ],
      example: {
        title: 'Ekip kısa toplantısı',
        body: 'Pazartesi 9:00–9:30 arasını sürükleyerek seçin, “Kısa toplantı” adını verin, “Satış” takvimini seçin, “Yinelenme”yi “Her hafta” yapın, katılımcıları ve 10 dakika önceden bir hatırlatıcı ekleyin. İş arkadaşlarınız bir davet alır ve “Evet” yanıtını verebilir.',
      },
    },
    {
      title: 'Davetler ve yanıtlar',
      body: `Katılımcılar bir davet bildirimi alır. Etkinlik, o takvimi göremeseler bile onların takviminde (soldaki “Davetler”) görünür.

Etkinlik kartında **Evet**, **Belki** veya **Hayır** yanıtını verin — düzenleyen yanıtları görür. Reddedilen etkinlikler üstü çizili kalır; bunları takvim ayarlarından gizleyebilirsiniz.`,
    },
    {
      title: 'Yinelenen etkinlikler',
      body: '“Yinelenme” alanında hazır bir seçenek (her gün, iş günleri, her hafta, her ay, her yıl) seçin veya kendiniz ayarlayın: aralık, haftanın günleri ve bitiş. Bir tekrarı değiştirdiğinizde veya sildiğinizde portal sorar: yalnızca bu mu, yoksa tüm seri mi?',
      note: 'Yinelenen bir etkinliği sürüklediğinizde de neyin taşınacağı sorulur — tek bir tekrar mı, tüm seri mi.',
    },
    {
      title: 'Hatırlatıcılar',
      body: `Hatırlatma, başlangıçtan seçilen süre kadar önce gelir: portaldaki zile, anlık bildirim olarak, e-postayla ve Telegram/WhatsApp/Mattermost’a — [bildirim ayarlarınıza](/account/notifications) göre. Yeni etkinlikler için varsayılan hatırlatıcı takvim ayarlarında belirlenir.

Bir hatırlatma gelmediyse bildirim ayarlarını açın: en altta her bildirimin nereye gittiğini ve nedenini görürsünüz; “Test gönder” kanalları kontrol eder.`,
    },
    {
      title: 'Takvimdeki görevler',
      body: `**Son tarihi** olan görevler, o tarih ve saatte etkinliklerin yanında görünür: ☐ — açık, ✓ ve üstü çizili — tamamlandı, kırmızı çubuk — gecikmiş. Görevi açmak için tıklayın.

- Son tarihini değiştirmek için bir görevi başka bir güne veya saate **sürükleyin** (değiştirme izniniz varsa).
- Soldaki **“Son tarihi olmayanlar”** listesi son tarihi olmayan açık görevlerinizi gösterir. Planlamak için herhangi birini bir güne sürükleyin.
- Soldaki “Görev” ile veya boş bir alana tıklayıp “Görev”i seçerek **görev oluşturun**. Görev size atanır; ayrıntılar görev kartına girilir.

Hangi görevlerin gösterileceği — yürüttükleriniz, katıldığınız tüm görevler veya görebildiğiniz tüm görevler — ve tamamlananların gösterilip gösterilmeyeceği ayarlarda (⚙) belirlenir.`,
      example: {
        title: 'Haftayı planlayın',
        body: 'Pazartesi sabahı “Çalışma haftası”nı açın. “Son tarihi olmayanlar” beş görev gösteriyor — her birini toplantılar arasındaki boş zamanlara sürükleyin. Görevler son tarih alır ve onları veren iş arkadaşlarınız tarihleri görev kartlarında görür.',
      },
      note: 'Yeni bir görev varsayılan olarak “bir hafta sonra” son tarihini alır — onu gelecek haftada arayın veya oluşturduktan sonra çıkan nottaki “Takvimde” bağlantısına tıklayın.',
    },
    {
      title: 'Kişisel ve paylaşılan takvimler',
      body: `Herkesin kişisel bir takvimi vardır. Paylaşılan takvimler — örneğin “Satış” veya “Toplantı odası 1” — takvim listesindeki **+** ile oluşturulur (yönetici izin veriyorsa).

Takvim menüsü (⋯) üzerinden sahibi **erişimi** ayarlar: kim yalnızca görüntüler, kim etkinlik ekler, kim yönetir. Adın yanındaki onay işareti takvimi gizler veya gösterir.`,
      example: {
        title: 'Toplantı odası takvimi',
        body: '“Toplantı odası 1” adlı bir takvim oluşturun, ⋯ → Erişim’i açın ve herkesin etkinlik eklemesine izin verin. Artık bir rezervasyon bu takvimdeki bir etkinliktir ve herkes odanın ne zaman dolu olduğunu görür.',
      },
    },
    {
      title: 'Bir takvimi takip etme',
      body: 'Katılımcı olmadan paylaşılan bir takvimin yeni ve değişen etkinliklerinden haberdar olmak için yanındaki ⋯ → **Değişiklikleri bana bildir** seçeneğini açın. Aboneliği orada veya [bildirim ayarlarında](/account/notifications) → “Abonelikler” bölümünde iptal edebilirsiniz.',
    },
    {
      title: 'Ayarlarınız',
      body: `Üst çubuktaki ⚙ yalnızca sizin için geçerli olan ayarları açar:
- Açılıştaki **görünüm**, haftanın ilk günü, **çalışma saatleri** (vurgulanır ve gün o saate kaydırılır), ızgara adımı, hafta sonları, hafta numaraları, reddedilen etkinlikler;
- **Görevler**: gösterilip gösterilmeyeceği, hangileri (yürüttüklerim / tüm görevlerim / görünen tüm görevler), tamamlananlar, görev bloğu uzunluğu;
- **Yeni etkinlikler**: varsayılan takvim, süre ve hatırlatıcı.

“Varsayılanlara sıfırla” portal ayarlarını geri getirir.`,
    },
    {
      title: 'Google Takvim',
      body: 'Yönetici Google’ı etkinleştirdiyse Google hesabınızı bağlayın — takvimleri solda ayrı bir blok olarak görünür. Google etkinlikleri doğrudan burada oluşturulabilir, taşınabilir ve silinebilir.',
    },
  ],
  faq: [
    {
      q: 'Bir görev oluşturdum ama takvimde yok',
      a: 'Büyük olasılıkla son tarihi gelecek haftadır: varsayılan “bir hafta sonra”dır. Oluşturduktan sonra çıkan nottaki “Takvimde” bağlantısına tıklayın veya gelecek haftaya geçin. Ayrıca kenar çubuğunda “Görevlerim”in ve ⚙ içinde “Görevleri göster”in açık olduğunu kontrol edin. Son tarihi olmayan görevler “Son tarihi olmayanlar” listesindedir.',
    },
    {
      q: 'Bir görevi neden sürükleyemiyorum?',
      a: 'Tamamlanan görevler taşınmaz. Oluşturan son tarihi kilitlediyse portal görevi yerine geri koyar ve nedenini gösterir.',
    },
    {
      q: 'Bir toplantı hatırlatması gelmedi',
      a: '[Bildirim ayarlarını](/account/notifications) açın: kanalların bağlı olduğunu (Telegram — “Profil → Güvenlik”, anlık bildirimler — cihazda etkin), duraklatma veya sessiz saatlerin olmadığını kontrol edin ve “Son bildirimler”e bakın — neden orada yazar. “Test gönder” tüm kanalları aynı anda kontrol eder.',
    },
    {
      q: 'Hafta sonlarını nasıl gizlerim?',
      a: '“Çalışma haftası” görünümünü seçin veya ⚙ içinde “Hafta sonlarını göster”i kapatın.',
    },
    {
      q: 'Etkinliklerimi kim görür?',
      a: 'Kişisel takviminizdeki etkinlikleri siz ve katılımcılar görür. Paylaşılan bir takvimin etkinliklerini — takvimin paylaşıldığı herkes görür.',
    },
    {
      q: 'Bir toplantıyı nasıl görüntülü arama yaparım?',
      a: 'Bağlantıyı “Görüntülü arama bağlantısı” alanına yapıştırın — etkinlik kartında bir katılma düğmesi çıkar.',
    },
  ],
  fields: {
    quickTask: {
      title: 'Takvimden görev',
      text: 'Son tarihi seçilen zaman olan hızlı bir görev. Size atanır; diğer her şey görev kartındadır.',
    },
    undated: {
      title: 'Son tarihi olmayan görevler',
      text: 'Son tarihi olmayan açık görevleriniz. Son tarih vermek için birini bir güne veya saate sürükleyin.',
    },
    workHours: {
      title: 'Çalışma saatleri',
      text: 'Gün ve hafta görünümlerinde vurgulanır; gün bu saatlerin başlangıcında açılır.',
    },
    tasks: {
      title: 'Takvimdeki görevler',
      text: 'Etkinliklerin yanında görev son tarihleri. Sürüklemek son tarihi taşır.',
    },
    taskScope: {
      title: 'Hangi görevler',
      text: '“Yürüttüklerim” — sorumlu veya ortak sorumlu sizsiniz; “Tüm görevlerim” — herhangi bir rolünüz olanlar; “Görünen tüm görevler” — görebildiğiniz projelerin görevleri de.',
    },
    reminders: {
      title: 'Hatırlatıcı',
      text: 'Başlangıçtan kaç dakika önce. Nereye geleceği bildirim ayarlarınıza bağlıdır.',
    },
  },
};
