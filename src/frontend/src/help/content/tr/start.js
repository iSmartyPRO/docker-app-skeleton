export default {
  title: 'Başlarken',
  tagline: 'Nasıl oturum açılır, her şey nerededir ve ihtiyacınız olanı nasıl hızlıca bulursunuz',
  summary: 'Portal tek bir çalışma alanıdır: görevler, takvim, sohbetler, dosyalar ve diğer uygulamalar aynı üst bilgiden açılır. Bu kılavuz oturum açmayı, ekranın düzenini, portalı telefonunuza yüklemeyi ve bir şeyler ters gittiğinde ne yapacağınızı anlatır.',
  highlights: [
    {
      title: 'Kolay oturum açma',
      text: 'Parola, kurumsal kullanıcı adı, Google, Telegram veya tek kullanımlık kod — yöneticinizin etkinleştirdiği hangisiyse.',
    },
    {
      title: 'Her şey üst bilgiden',
      text: 'Yardım, sohbetler, bildirimler, uygulamalar ve profiliniz her sayfanın sağ üst köşesinde bulunur.',
    },
    {
      title: 'Uygulamalar',
      text: 'Dokuz noktalı simge portalın her bölümünü açar: görevler, takvim, dosyalar ve daha fazlası.',
    },
    {
      title: 'Bir uygulama gibi',
      text: 'Portalı telefonunuza veya bilgisayarınıza yükleyin: kendi simgesi, tam ekran ve anlık bildirimler.',
    },
    {
      title: 'Dil ve tema',
      text: 'Arayüz dili ve açık ya da koyu tema — üst bilgiden tek tıklamayla değiştirilir.',
    },
    {
      title: 'Her yerde ipuçları',
      text: 'Bir alanın yanındaki ⓘ simgesi onu açıklar; ? tuşu geçerli sayfanın yardımını açar.',
    },
  ],
  tips: [
    'Tam o sayfanın yardımını açmak için herhangi bir sayfada ? tuşuna basın.',
    'Profilinizde e-posta adresinizi ve telefonunuzu doldurun — böylece parolanızı unutursanız kodla oturum açabilirsiniz.',
    'Görevler ve toplantılar hakkında anlık bildirim almak için portalı telefonunuza yükleyin.',
    'Üst bilgideki dokuz noktalı simge herhangi bir uygulamaya girmenin en hızlı yoludur.',
    'Bir sayfa takılmış gibi görünüyorsa önce yeniden yükleyin (F5 veya telefonda aşağı çekin).',
  ],
  sections: [
    {
      title: 'Oturum açma',
      body: `Oturum açma sayfası yalnızca yöneticinizin etkinleştirdiği yöntemleri gösterir. En sık kullanılanlar:

- **Parola** — kullanıcı adı ve parola. Şirket Active Directory kullanıyorsa her zamanki iş kullanıcı adınız ve bilgisayar parolanız yeterlidir.
- **Google ile devam et** — sekmelerin üstündeki düğme, iş Google hesabınızla tek tıklama.
- **Telegram** — oturum açmayı parolasız olarak Telegram’da onaylayın veya portal botundan bir kod alın.
- **E-posta**, **WhatsApp**, **Mattermost** — portal profilinizdeki iletişim adresine 6 haneli bir kod (veya bir oturum açma bağlantısı) gönderir.

Kod 5 dakika geçerlidir ve bir kez çalışır; oturum açma bağlantısı — 15 dakika. Son haneyi yazdığınız anda oturumunuz açılır. Portal yönteminizi hatırlar ve bir dahaki sefere aynı sekmeyi açar.`,
      steps: [
        'Portal adresini tarayıcınızda açın.',
        'Oturum açma yönteminizin sekmesini seçin (veya “Google ile devam et”e basın).',
        'Kullanıcı adınızı ve parolanızı girin — veya e-posta adresinizi, telefonunuzu, Telegram/Mattermost adınızı girip “Kod al”a basın.',
        'Mesajdaki 6 haneyi yazın — oturumunuz otomatik olarak açılır.',
      ],
      example: {
        title: 'Parolanızı mı unuttunuz',
        body: 'Anna parolasını unuttu, ancak profilinde iş e-postası kayıtlı. Oturum açma sayfasında “E-posta” sekmesini açar, adresi girer ve “Kod al”a basar. Bir dakika sonra 6 haneli bir e-posta gelir — haneleri yazar ve içeri girer. Ardından “Kişisel alan → Güvenlik” bölümünde yeni bir parola belirler.',
      },
      note: 'Kodlar yalnızca profilinizdeki iletişim adreslerine gider. Bir kodu asla paylaşmayın — portal çalışanları onu hiçbir zaman telefonla veya sohbette istemez.',
    },
    {
      title: 'Ana sayfa',
      body: `Ana sayfanın ne göstereceğine yöneticiniz karar verir. Şunlar olabilir:

- **Pano** — gününüz tek bakışta: görevler, toplantılar, dosyalar ve rakamlar;
- “Görevler” veya “Kaynaklar” gibi başka bir portal uygulaması;
- “Kişisel alanı aç” ve “Yönetim” düğmeleri olan bir başlangıç sayfası.

Sol üst köşedeki logoya ve portal adına tıklayarak her zaman ana sayfaya dönebilirsiniz.`,
    },
    {
      title: 'Üst bilgi: her şey nerede',
      body: `Üst bilgi her sayfada aynıdır. Solda logo bulunur (ana sayfaya götürür). Sağda, sırasıyla:

- **Bayrak** ve **Tema** — arayüz dilini (Rusça/İngilizce) ve açık/koyu temayı değiştirir;
- **?** — geçerli sayfanın yardımı;
- **Sohbetler** — son yazışmalar ve mesajlaşma uygulamasına bir bağlantı;
- **Zil** — bildirimler; sayı kaç tanesinin okunmadığını gösterir;
- **Dokuz nokta** — tüm portal uygulamaları;
- **Dört kare** — yönetim konsolu (yalnızca yöneticiler);
- **Adınızın yanındaki avatar** — bir menü: “Kişisel alan”, “Uygulamayı yükle”, “Oturumu kapat”.`,
      note: 'Dar bir telefon ekranında bazı etiketler gizlenir ve yalnızca simgeler kalır — sıra aynıdır.',
    },
    {
      title: 'Uygulamaları açma',
      body: `Portal uygulamalardan oluşur: “Pano”, “Görevler”, “Takvim”, “Sohbetler”, “Dosyalar”, “Bilgi bankası” ve diğerleri. Hangilerini göreceğiniz yöneticinizin neleri etkinleştirdiğine ve izinlerinize bağlıdır.

Bir uygulamayı açmanın iki yolu vardır:

- üst bilgideki dokuz noktalı simgeye tıklayın ve uygulamayı ızgaradan seçin;
- o ızgaranın altında “Tüm uygulamalar →”a tıklayın — her birinin kutucuğu ve kısa açıklamasıyla [Uygulamalar](/apps) sayfası açılır.`,
      example: {
        title: 'Doğru yere bir yer imi',
        body: 'Sergey her güne görevleriyle başlıyor. Dokuz nokta üzerinden “Görevler”i açar ve sayfayı tarayıcısında yer imlerine ekler. Artık görevler ek tıklama olmadan hemen açılıyor.',
      },
      note: 'İhtiyacınız olan bir uygulamayı göremiyor musunuz? Muhtemelen kapalıdır veya ona erişiminiz yoktur — yöneticinize sorun.',
    },
    {
      title: 'Hızlı arama (Ctrl+K)',
      body: `Yönetim konsolunda hızlı gezinmeyi açmak için **Ctrl+K**’ye (Mac’te **⌘K**) basın. Bir sayfanın veya ayarın adını yazmaya başlayın — örneğin “kullanıcılar” veya “tema” — ok tuşlarıyla bir satır seçin ve Enter’a basın. Esc pencereyi kapatır.

Portalın diğer yerlerinde uygulamalar arasında geçiş için dokuz noktalı simgeyi, her uygulamanın içinde ise kendi aramasını (görevler, dosyalar, bilgi bankası) kullanın.`,
      example: {
        title: 'Bir ayarı bir saniyede bulun',
        body: 'Bir yöneticinin bir çalışan eklemesi gerekiyor. Ctrl+K’ye basar, “kull” yazar, Enter’a basar — ve hemen “Kullanıcılar” sayfasına ulaşır.',
      },
      note: 'Hızlı arama penceresi yalnızca yönetim konsolunda bulunur. Normal çalışanların buna ihtiyacı yoktur — kullanabilecekleri her şey üst bilgiden açılır.',
    },
    {
      title: 'Dil ve tema',
      body: `Dil ve tema anahtarları üst bilgide, “?” simgesinin solundadır. Değişiklikler hemen uygulanır.

Seçimin hesabınızda her cihazda korunması için bunu [Kişisel alan → Görünüm](/account/appearance) bölümünde ayarlayın:

- **Dil**: “Portaldaki gibi”, “Русский” veya “English”;
- **Tema**: “Açık”, “Koyu” veya “Sistem” — telefonunuzun veya bilgisayarınızın ayarını izler.`,
    },
    {
      title: 'Telefona ve bilgisayara yükleme',
      body: `Portalı bir uygulama olarak yükleyebilirsiniz — App Store veya Google Play olmadan. Ekranda bir simge edinirsiniz, portal tam ekran açılır ve anlık bildirim gönderebilir.

Cihazınız için resimli adım adım talimatlar [Uygulamayı yükle](/install) sayfasındadır. Bu sayfayı avatarınızın altındaki menüden veya oturum açma sayfasından da açabilirsiniz.

**Yüklü uygulamada neler değişir:**

- adres çubuğu ve tarayıcı düğmeleri yoktur;
- bu yüzden üst bilginin solunda bir **Geri** düğmesi (bir ok) belirir — önceki ekrana döner;
- uygulama simgesi okunmamış bildirim sayısını gösterir;
- güncellemeler kendiliğinden gelir, hiçbir şeyi yeniden yüklemeniz gerekmez.`,
      steps: [
        'iPhone: portalı Safari’de açın → Paylaş → “Ana Ekrana Ekle” → Ekle.',
        'Android: portalı Chrome’da açın → ⋮ menüsü → “Uygulamayı yükle” → Yükle.',
        'Bilgisayar (Chrome, Edge, Yandex Browser): adres çubuğunun sağındaki yükleme simgesi.',
        'Uygulamayı simgesinden açın ve “Kişisel alan → Bildirimler” bölümünde bildirimleri açın.',
      ],
      example: {
        title: 'Telegram’dan gelen bir bağlantı yüklenmiyor',
        body: 'Bir iş arkadaşınız portal bağlantısını Telegram’da gönderdi; bağlantı mesajlaşma uygulamasının içinde açıldı ve yükleme düğmesi yok. ⋯ → “Tarayıcıda aç”a dokunun (iPhone’da Safari veya Android’de Chrome) ve oradan yükleyin.',
      },
      note: 'iPhone’da anlık bildirimler yalnızca yüklü uygulamada ve iOS 16.4 veya sonrasında çalışır.',
    },
    {
      title: 'Üst bilgide bildirimler ve sohbetler',
      body: `**Zil** sizi ilgilendiren her şeyi toplar: yeni atamalar, yorumlar ve bahsetmeler, toplantı davetleri, son tarih hatırlatmaları. Üzerindeki sayı okunmamış sayısıdır. Panelde “Tümü” ve “Okunmamış” sekmeleri ve “Tümünü okundu işaretle” düğmesi bulunur; bir bildirime tıklamak görevi veya etkinliği açar. Bildirimler 120 gün saklanır.

Bunları e-posta, Telegram, Mattermost ve anlık bildirim olarak da alabilirsiniz — bunu [Kişisel alan → Bildirimler](/account/notifications) bölümünde ayarlayın. Ayrıntılar [Bildirimler](/help/notifications) kılavuzunda.

Yanındaki **sohbet simgesi** son yazışmaları gösterir ve “Sohbetler” uygulamasına götürür.`,
      note: 'Kendi eylemleriniz hakkında hiçbir zaman bildirim almazsınız: kendinize bir görev atarsanız zil sessiz kalır.',
    },
    {
      title: 'Yardımı kullanma',
      body: `Yardım portalın içine yerleştirilmiştir ve her zaman elinizin altındadır:

- **bir alanın yanındaki ⓘ** — kısa bir açıklama ve kılavuzun ilgili bölümüne “Daha fazla” bağlantısı için üzerine gelin veya dokunun;
- **? tuşu** (veya üst bilgideki **?** simgesi) — bulunduğunuz sayfanın yardımını açar;
- **Yardım merkezi** [/help](/help) — tüm kılavuzlar, sorular ve yanıtlar ve yardım genelinde arama.

Her kılavuz kısa bir “Neler yapabilirsiniz” ve “İpuçları” ile başlar, ardından örnekli ayrıntılı konular ve sorular ve yanıtlar gelir.`,
      example: {
        title: 'Aramayla yanıt bulun',
        body: 'Bir klasörü nasıl paylaşacağınızı öğrenmek istiyorsunuz. [Yardım merkezini](/help) açın, “klasör paylaş” yazın — arama, dosyalar kılavuzundaki doğru konuyu gösterir.',
      },
      note: 'Bir alana yazarken ? tuşu hiçbir şey yapmaz — sayfada boş bir yere tıklayın ve yeniden basın.',
    },
    {
      title: 'Bir şey çalışmıyorsa',
      body: `Çoğu sorun bir dakikada çözülür:

1. **Sayfayı yeniden yükleyin** — F5 (Mac’te ⌘R) veya telefonda aşağı çekin. “Yeni bir sürüm mevcut” mesajını görürseniz “Yenile”ye basın.
2. **Oturumu kapatıp yeniden açın** — avatarınızın altındaki menü → “Oturumu kapat”.
3. **Bağlantınızı kontrol edin** — çevrimdışıyken yüklü uygulama bir “bağlantı yok” ekranı gösterir.
4. **Başka bir tarayıcı deneyin** — güncel bir Chrome, Edge, Safari veya Yandex Browser.

Bu işe yaramazsa portal yöneticisine veya şirketinizin BT desteğine başvurun. Ne yaptığınızı, ne beklediğinizi ve ne gördüğünüzü anlatın; bir ekran görüntüsü ekleyin.`,
      note: 'Verileriniz sunucuda bulunur: yeniden yüklemek, oturumu kapatmak veya uygulamayı yeniden yüklemek hiçbir şeyi silmez.',
    },
  ],
  faq: [
    {
      q: 'Telefonumdaki uygulamayı nasıl güncellerim?',
      a: `Portal kendini günceller. Yeni bir sürüm çıktığında altta **“Yeni sürüm yayımlandı”** bandı belirir — “Güncelle”ye dokunun. Uygulama bir süre arka planda kaldıysa geri döndüğünüzde, aksi halde bir sonraki sayfa değişikliğinde kendiliğinden güncellenir.

Bir şey hâlâ eski görünüyorsa uygulamayı tamamen kapatın (son uygulamalardan kaydırarak) ve yeniden açın.`,
    },
    {
      q: 'Doğru yazmama rağmen “Kullanıcı adı veya parola yanlış” diyor.',
      a: 'Klavye düzenini ve Caps Lock’u kontrol edin. Parolayı gerçekten unuttuysanız e-posta veya Telegram ile gönderilen bir kodla (etkinse) oturum açın ve “Kişisel alan → Güvenlik” bölümünde yenisini belirleyin. Aksi halde bir yöneticiden parolayı sıfırlamasını isteyin.',
    },
    {
      q: '“Çok fazla başarısız deneme” diyor.',
      a: 'Parola tahminine karşı koruma için oturum açma geçici olarak engellendi. Birkaç dakika bekleyip yeniden deneyin veya başka bir yöntem kullanın.',
    },
    {
      q: 'Oturum açma kodu gelmiyor.',
      a: 'Kod yalnızca profilinizdeki iletişim adresine gider. İstenmeyen posta klasörünüzü ve numaranın veya adresin doğru olduğunu kontrol edin; Telegram için — “Kişisel alan → Güvenlik” bölümünde bağlı olduğunu ve botun engellenmediğini. Yeni çalışanlar bir yöneticiden telefonlarını veya e-posta adreslerini eklemesini istemelidir.',
    },
    {
      q: 'Bir iş arkadaşımda olan uygulama nerede?',
      a: 'Üst bilgideki dokuz noktaya tıklayın → “Tüm uygulamalar”. Orada yoksa ona erişiminiz yoktur; yöneticinize sorun.',
    },
    {
      q: 'Yüklü uygulamada nasıl geri giderim?',
      a: 'Üst bilginin solundaki Geri okuna dokunun. Android’de sistemin geri hareketi veya düğmesi de çalışır.',
    },
    {
      q: 'Portalı telefonuma yüklemek güvenli mi?',
      a: 'Evet. Bu, kendi penceresinde açılan aynı web sitesidir: mağazaları atlayarak hiçbir şey indirmez ve dosyalarınıza erişim kazanmaz. Onu herhangi bir uygulama gibi kaldırırsınız.',
    },
    {
      q: 'Neden yönetim konsolu simgem yok?',
      a: 'Konsolu yalnızca yönetici izinleri olan çalışanlar görür. Günlük işler için ona ihtiyacınız yoktur.',
    },
    {
      q: 'Arayüzün dili birden değişti. Nasıl geri alırım?',
      a: 'Üst bilgideki dil anahtarına (RU · EN …) tıklayın veya “Kişisel alan → Görünüm” bölümünde dili seçip kaydedin — seçim böylece her cihazda korunur.',
    },
  ],
};
