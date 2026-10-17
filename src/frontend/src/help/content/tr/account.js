export default {
  title: 'Profil',
  tagline: 'Bilgileriniz, görünüm, güvenlik ve bağlı hizmetler',
  summary: 'Kişisel alanınızda adınızı, e-posta adresinizi, telefonunuzu ve avatarınızı belirler, dili ve temayı seçer, parolanızı değiştirir ve Telegram ile Google’ı bağlarsınız. Bu bilgiler nasıl oturum açabileceğinizi ve bildirimlerin nereye iletileceğini belirler.',
  highlights: [
    {
      title: 'Profil',
      text: 'Ad, e-posta, telefon, Mattermost ve avatar — iş arkadaşlarınızın sizi nasıl gördüğü ve portalın oturum açarken sizi nasıl tanıdığı.',
    },
    {
      title: 'Görünüm',
      text: 'Dil ve tema hesabınızda saklanır ve tüm cihazlarınızda uygulanır.',
    },
    {
      title: 'Güvenlik',
      text: 'Parolanızı değiştirin ve tek bir düğmeyle diğer tüm cihazlardaki oturumları kapatın.',
    },
    {
      title: 'Telegram',
      text: 'Bağlı bir Telegram tek dokunuşla oturum açma, bottan kodlar ve mesajlaşma uygulamasında bildirimler sağlar.',
    },
    {
      title: 'Google',
      text: 'Google ile oturum açın ve Google takvimlerinizi portal takviminin yanında görün.',
    },
    {
      title: 'Bildirimler ve API',
      text: 'Bildirim kanallarının ve kişisel API belirteçlerinin kişisel alanda kendi bölümleri vardır.',
    },
  ],
  tips: [
    'İş e-postanızı ve telefonunuzu ekleyin — parolanızı unutursanız yedek bir oturum açma yolu olur.',
    'Telefonunuzu uluslararası biçimde girin: +996 700 123 456.',
    'Bir telefon, e-posta veya Mattermost adı tek bir hesaba aittir: başka bir hesapta zaten varsa portal onu kaydetmez — aksi halde kodla oturum açmada hesabın kime ait olduğu ayırt edilemezdi.',
    'Bildirim almak ve parolasız oturum açmak için Telegram’ı “Güvenlik” bölümünden bağlayın.',
    'Sayfanın altındaki “Kaydet”e basmayı unutmayın — aksi halde profil değişiklikleri uygulanmaz.',
    'Sizin yapmadığınız bir oturum açma mı fark ettiniz? Parolanızı değiştirin ve “Diğer cihazlarda oturumu kapat”a basın.',
  ],
  sections: [
    {
      title: 'Kişisel alanınızı açma',
      body: `Sağ üst köşedeki avatarınıza ve adınıza tıklayın ve **“Kişisel alan”**ı seçin. Solda bir bölüm menüsü belirir: “Profil”, “Görünüm”, “Güvenlik”, “Bildirimler”, “Bağlı hesaplar” ve izniniz varsa “API belirteçleri”.

Telefonda bölüm menüsü simgelere daralır — onlara da aynı şekilde dokunun.`,
    },
    {
      title: 'Profil: ad, e-posta, telefon, avatar',
      body: `[Profil](/account) bölümü bilgilerinizi içerir:

- **Görünen ad** — iş arkadaşlarınızın sizi görevlerde, sohbetlerde ve takvimde nasıl gördüğü. Kullanıcı adınız (@ad) değiştirilemez.
- **E-posta** — bildirimler ve e-postayla gönderilen oturum açma kodları buraya gelir.
- **Telefon** — WhatsApp oturum açma kodları için, uluslararası biçimde. Geçersiz bir numara kırmızıyla vurgulanır.
- **Mattermost** — Mattermost kullanıcı adınız: bot oturum açma kodlarını ve bildirimleri oraya gönderir.
- **Instagram** — isteğe bağlı.

**Avatarınız** üstteki “Avatarı değiştir” düğmesiyle değiştirilir: 1 MB’a kadar JPG, PNG veya WebP. Hemen kaydedilir.

Diğer alanlar, ilk değişikliğinizden sonra altta beliren çubuktaki **“Kaydet”** düğmesiyle kaydedilir. “Vazgeç” önceki değerleri geri getirir.`,
      steps: [
        '“Kişisel alan” → “Profil”i açın.',
        'Adınızı, e-posta adresinizi, telefonunuzu veya Mattermost adınızı düzenleyin.',
        'Alttaki çubukta “Kaydet”e basın.',
      ],
      example: {
        title: 'WhatsApp koduyla oturum açma',
        body: 'Marat parolasını sık sık unutuyor. “Telefon” alanına +996 555 123 456 girer ve kaydeder. Artık oturum açma sayfasında “WhatsApp” sekmesini seçer, numarayı girer ve WhatsApp’ta 6 haneli bir kod alır.',
      },
      note: 'E-posta adresleri benzersiz olmalıdır: bir adres iki hesapta kullanılamaz.',
    },
    {
      title: 'Görünüm: dil ve tema',
      body: `[Görünüm](/account/appearance) bölümünde:

- **Dil** — “Portaldaki gibi” (yöneticinizin seçtiği varsayılan), “Русский” veya “English”;
- **Tema** — temel “Açık”, “Koyu”, “Sistemdeki gibi” ve hazır temalar: Grafit, Okyanus, Orman, Kum, Gece yarısı, Lavanta, Yüksek kontrast. Bir karta tıklamak, “Kaydet”e basana kadar portalı o temayla önizler.

“Kaydet”ten sonra seçim hesabınızda saklanır ve her cihazda uygulanır. Üst bilgideki güneş/ay anahtarı açık ve koyu temayı yalnızca bu tarayıcıda değiştirir. Hangi temaların sunulacağına yöneticiniz karar verir.`,
    },
    {
      title: 'Canlı temalar ve kendi resminiz',
      body: `**Canlı temaların** — Şafak, Kutup ışıkları, Takımyıldız — çok yavaş hareket eden bir arka planı vardır. Sekme gizliyken veya bir dakika hareketsizlikten sonra durur; cihazınız azaltılmış hareket istediğinde veya düşük güçlüyse sabit kalır. **“Animasyon yok”** anahtarı arka planı sabit tutar.

**Kendi temanız**: “Özel” kartını seçin, bir resim (JPEG, PNG, WebP veya GIF, en fazla 8 MB ve 4096 × 4096 piksel) ve bir vurgu rengi yükleyin. Sunucu resmi sıkıştırır ve bir telefon sürümü oluşturur; resmi yalnızca siz görebilirsiniz. Resim metnin altında karartılır (“Karartma” kaydırıcısı) ve paneller düz kalır. Okunması zor olacak bir renk otomatik olarak ayarlanır.`,
    },
    {
      title: 'Rehberli turlar',
      body: `İlk oturum açışınızda portal kısa bir tur gösterir: uygulamalar menüsü, “Beni bekleyenler”, bildirimler, sohbet, yardım ve profiliniz. Her uygulamanın, onu ilk açtığınızda gösterilen kendi turu vardır. “Sonraki” ve “Geri” düğmelerini veya ok tuşlarını kullanın; Esc turu kapatır. Tur yalnızca erişiminiz olan şeyleri gösterir.

Bir turu yeniden oynatmak için bir uygulamanın adının yanındaki “Tur” düğmesini veya yardımdaki (“?” tuşu) “Bu bölümün turu”nu kullanın. Turların kendiliğinden başlamasını durdurmak için: [Görünüm → “Turları gösterme”](/account/appearance).`,
    },
    {
      title: 'Tarih ve saat',
      body: `[Görünüm → Tarih ve saat](/account/appearance) bölümünde kendi **saat diliminizi**, **tarih biçiminizi**, **saat biçiminizi** (14:30 veya 2:30 PM) ve **haftanın ilk gününü** seçebilirsiniz. Varsayılan olarak her şey “Portaldaki gibi”dir — yöneticinizin belirlediği.

- **Saat dilimi** her şeyi etkiler: görevlerde ve toplantılarda gösterilen saatler, “bugün” ve “yarın”ın ne zaman başladığı, hatırlatmaların ne zaman geldiği ve sessiz saatlerin ne zaman başladığı.
- **Bu cihazdaki gibi** saat dilimini telefonunuzdan veya bilgisayarınızdan alır. Seyahat ederken kullanışlıdır: saatler kendiliğinden yerel saate geçer.
- Saati olmayan tarihler (doğum günü, bir fırsatın kapanış tarihi) saat dilimi değiştiğinde hiçbir zaman kaymaz.

Bloğun altı tarihlerin nasıl görüneceğini gösterir. “Kaydet”ten sonra ayarlar tüm cihazlarınızda uygulanır.`,
    },
    {
      title: 'Güvenlik: parola ve oturumlar',
      body: `[Güvenlik](/account/security) bölümünde:

**Parola.** Geçerli parolanızı, yeni bir parola (en az 10 karakter) girin ve yenisini tekrarlayın. Kaydettikten sonra diğer tüm cihazlardaki oturumlar kapatılır — oralarda yeniden oturum açmanız gerekir.

Her zaman parolasız oturum açtıysanız (Telegram, Google, kod veya Active Directory) bunun yerine **“Parola belirle”** seçeneğini görürsünüz — geçerli parola gerekmez.

**Oturumlar.** Şu anda oturum açtığınız yerler: cihaz, tarayıcı ve sistem, portalın yüklü **uygulama** olarak mı yoksa bir **tarayıcı sekmesinde** mi çalıştığı, IP adresi, oturum açma yöntemi ve son etkinlik. Geçerli oturum “Bu cihaz” olarak işaretlenir. **“Sonlandır”** bir cihazdaki oturumu kapatır, **“Bu oturum dışındakileri sonlandır”** diğer tüm oturumları kapatır. Bilgisayarda Chrome/Edge uygulaması ve tarayıcının kendisi tek bir oturumu paylaşır; bu yüzden “Uygulama ve tarayıcı” olarak işaretlenmiş tek bir oturum olarak görünürler.`,
      steps: [
        '“Kişisel alan” → “Güvenlik”i açın.',
        'Geçerli parolayı, yenisini girin ve yenisini tekrarlayın.',
        '“Kaydet”e basın.',
      ],
      example: {
        title: 'Başka bir bilgisayarda oturumu kapatmayı unuttunuz',
        body: 'Olga portalı bir toplantı odasında kullandı ve oturumu kapatmadı. Dizüstü bilgisayarından “Güvenlik” bölümünü açar ve “Diğer cihazlarda oturumu kapat”a basar — toplantı odasındaki oturum hemen kapanır.',
      },
      note: 'Kurumsal bir kullanıcı adıyla (Active Directory) oturum açıyorsanız parola portalda değil, şirket sisteminde değiştirilir — BT desteğine başvurun.',
    },
    {
      title: 'Telegram',
      body: `**Telegram** bloğu [Güvenlik](/account/security) bölümündedir (yönetici botu ayarladığında görünür). Telegram’ı bağlamak şunları sağlar:

- parolasız, tek dokunuşla oturum açma;
- portal botundan oturum açma kodları alma;
- Telegram’da bildirim alma.

Telegram düğmesine basın ve Telegram penceresinde onaylayın — botun size mesaj göndermesine izin verin. Bağlandıktan sonra @adınız görünür; **“Bağlantıyı kaldır”** bağlantıyı kaldırır.`,
      steps: [
        '“Kişisel alan” → “Güvenlik”i açın.',
        'Telegram bloğunda mavi Telegram düğmesine basın.',
        'Onaylayın ve botun size mesaj göndermesine izin verin.',
        '“Kişisel alan → Bildirimler” bölümünde Telegram kanalını açın.',
      ],
      example: {
        title: 'Telegram’da görev bildirimleri',
        body: 'Ruslan nadiren bilgisayar başında oturuyor. Telegram’ı “Güvenlik” bölümünden bağlar, ardından “Bildirimler” bölümünde Telegram kanalını açar. Artık bot ona her yeni atamayı hemen bildiriyor.',
      },
      note: 'Botu Telegram’da engellediyseniz kodlar ve bildirimler gelmez — engeli kaldırın.',
    },
    {
      title: 'Bağlı hesaplar: Google ve Mattermost',
      body: `[Bağlı hesaplar](/account/connections) bölümünde **Google**’ı bağlarsınız:

- **Oturum açma** — bağlandıktan sonra “Google ile devam et” düğmesini kullanabilirsiniz;
- **Takvim** — yönetici etkinleştirdiyse Google takvimleriniz “Takvim” uygulamasında görünür. Hangilerinin gösterileceğini işaretleyin. “Salt okunur”, portalın o takvime etkinlik ekleyemeyeceği anlamına gelir.

**“Bağlantıyı kes”** hem Google ile oturum açmayı hem de takvimi kapatır. Google “Erişim iptal edildi” gösterirse “Takvim erişimine izin ver”e yeniden basın.

**Mattermost** ayrıca bağlamayı gerektirmez: [Profilinize](/account) Mattermost kullanıcı adınızı girmeniz yeterlidir. Bot size böylece oturum açma kodları ve bildirimler gönderebilir.`,
      steps: [
        '“Kişisel alan” → “Bağlı hesaplar”ı açın.',
        '“Google’ı bağla”ya basın ve iş hesabınızı seçin.',
        'Google sorarsa Takvim erişimine izin verin.',
        'Portalda görmek istediğiniz takvimleri işaretleyin.',
      ],
      note: 'Bölümde “Kullanılabilir harici hesap yok” yazıyorsa Google portalda ayarlanmamıştır — bu yöneticinin işidir.',
    },
    {
      title: 'Bildirimler',
      body: `[Bildirimler](/account/notifications) bölümünde atamaların, yorumların, davetlerin ve hatırlatmaların zil dışında nereye gönderileceğini seçersiniz: e-posta, Telegram, Mattermost veya bu cihazda anlık bildirim. Bir kanal kullanılamıyorsa neyin eksik olduğunu söyler ve bir “Düzelt” düğmesi sunar.

Ayrıntılar [Bildirimler](/help/notifications) kılavuzundadır.`,
    },
    {
      title: 'API belirteçleri',
      body: `[API belirteçleri](/account/api) bölümünü yalnızca yöneticinin bu izni verdiği kişiler görür. Belirteç, başka bir programın (örneğin bir elektronik tablo veya bir betik) seçtiğiniz erişim dahilinde sizin adınıza portalla çalışmasını sağlar.

Belirteç yalnızca bir kez gösterilir — güvenli bir yerde saklayın ve hiçbir zaman bir sohbete yapıştırmayın. Ayrıntılar [API](/help/api) kılavuzunda.`,
    },
  ],
  faq: [
    {
      q: 'Telegram bildirimleri gelmiyor.',
      a: 'İki adımı kontrol edin: 1) Telegram “Kişisel alan → Güvenlik” bölümünde bağlı (@adınız orada görünür); 2) “Kişisel alan → Bildirimler” bölümünde Telegram kanalı açık. Ayrıca portal botunu Telegram’da engellemediğinizden emin olun.',
    },
    {
      q: 'E-posta bildirimleri gelmiyor.',
      a: '“Profil” bölümünde e-posta adresinizi ekleyip kaydedin, ardından “Bildirimler” bölümünde “E-posta” kanalını açın. İstenmeyen posta klasörünüzü kontrol edin.',
    },
    {
      q: 'Profil değişikliklerim kaydedilmedi.',
      a: 'Düzenledikten sonra altta “Kaydet” düğmeli bir çubuk belirir — ona basın. Bir alan kırmızıyla vurgulanmışsa (örneğin yanlış e-posta veya telefon biçimi) düzeltin.',
    },
    {
      q: 'Avatarım yüklenmiyor.',
      a: 'Yalnızca 1 MB’a kadar JPG, PNG veya WebP kabul edilir. Resmi küçültün veya başka bir biçimde kaydedin.',
    },
    {
      q: 'Kullanıcı adımı değiştirebilir miyim?',
      a: 'Hayır, kullanıcı adı (@ad) kalıcıdır. Görünen adınızı değiştirebilirsiniz — iş arkadaşlarınızın gördüğü odur.',
    },
    {
      q: 'Parolamı değiştirdikten sonra telefonumdaki oturum kapandı.',
      a: 'Bu tasarım gereğidir: parolayı değiştirmek güvenlik için diğer tüm cihazlardaki oturumları kapatır. Telefonda yeni parolayla yeniden oturum açmanız yeterlidir.',
    },
    {
      q: '“Bu Telegram hesabı henüz bağlı değil” diyor.',
      a: 'Başka bir yolla (parola veya kod) oturum açın, “Kişisel alan → Güvenlik”i açın ve Telegram’ı bağlayın. Bir dahaki sefere Telegram ile oturum açma çalışır.',
    },
    {
      q: 'Google Takvim toplantılarımı göremiyorum.',
      a: '“Bağlı hesaplar” bölümünde Google’da yeşil “Takvim” etiketinin olduğunu kontrol edin ve ihtiyacınız olan takvimleri işaretleyin. Etiket turuncuysa “Takvim erişimine izin ver”e basın.',
    },
  ],
  fields: {
    avatar: {
      title: 'Avatar',
      text: 'İş arkadaşlarınızın görevlerde ve sohbetlerde gördüğü fotoğraf. 1 MB’a kadar JPG, PNG veya WebP; hemen kaydedilir.',
    },
    email: {
      title: 'E-posta',
      text: 'Bildirimler ve e-postayla gönderilen oturum açma kodları buraya gelir. Bir adres yalnızca bir hesaba ait olabilir.',
    },
    phone: {
      title: 'Telefon',
      text: 'WhatsApp oturum açma kodları için. Uluslararası biçim kullanın, örneğin +996 700 123 456.',
    },
    mattermost: {
      title: 'Mattermost',
      text: '@ olmadan Mattermost kullanıcı adınız. Bot bunu oturum açma kodlarını ve bildirimleri göndermek için kullanır.',
    },
    language: {
      title: 'Dil',
      text: '“Portaldaki gibi” yöneticinin varsayılanını kullanır. Seçiminiz tüm cihazlarınızda uygulanır.',
    },
    theme: {
      title: 'Tema',
      text: '“Sistemdeki gibi” telefonunuzun veya bilgisayarınızın ayarını izler: açık veya koyu. Hazır ve canlı temalar ve kendi resminiz de burada seçilir.',
    },
    regional: {
      title: 'Tarih ve saat',
      text: 'Saat diliminiz ve biçimleriniz. “Portaldaki gibi” herkesle aynıdır; “Bu cihazdaki gibi” telefonunuzun veya bilgisayarınızın saat dilimini kullanır, seyahatte kullanışlıdır.',
    },
    password: {
      title: 'Parola',
      text: 'En az 10 karakter. Değiştirdikten sonra diğer tüm cihazlardaki oturumlar kapatılır.',
    },
    telegram: {
      title: 'Telegram',
      text: 'Bağlamak tek dokunuşla oturum açmayı, bottan kodları ve Telegram’da bildirimleri etkinleştirir.',
    },
    sessions: {
      title: 'Oturumlar',
      text: 'Oturum açtığınız yerler: cihaz, tarayıcı veya uygulama, IP ve etkinlik. Tanımadığınız her oturumu sonlandırın.',
    },
    google: {
      title: 'Google',
      text: 'Google ile oturum açma ve etkinse Google takvimleriniz “Takvim” uygulamasında.',
    },
  },
};
