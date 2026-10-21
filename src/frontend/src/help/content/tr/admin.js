export default {
  title: 'Yönetim',
  tagline: 'Kişiler, erişim, güvenlik ve portal ayarları tek konsolda',
  summary: 'Yönetim konsolu [/admin](/admin) adresindedir. Burada hesap oluşturur ve engeller, kişileri gruplara yerleştirir, roller aracılığıyla kimin neyi yapabileceğine karar verir, güvenlik günlüğünü izler ve portalı yapılandırırsınız: marka, oturum açma yöntemleri, entegrasyonlar ve modüller.',
  highlights: [
    {
      title: 'Gruplar → roller → izinler',
      text: 'Kişiler izinlerini departmanlarının grupları aracılığıyla alır; doğrudan roller yalnızca istisnalar içindir.',
    },
    {
      title: 'Esnek oturum açma',
      text: 'Parola, Active Directory, Google, Telegram ve WhatsApp, e-posta, Telegram veya Mattermost üzerinden tek kullanımlık kodlar.',
    },
    {
      title: 'Güvenlik bariyerleri',
      text: 'Sahip olduğunuzdan fazlasını veremez, kendinizi dışarıda bırakamaz veya son süper yöneticiyi kaldıramazsınız.',
    },
    {
      title: 'Güvenlik günlüğü',
      text: 'Adres ve ayrıntılarla 90 günlük başarısız oturum açmalar, kilitlemeler ve IP retleri.',
    },
    {
      title: 'Şirketinizin görünümü',
      text: 'Canlı önizlemeyle ad, açık ve koyu temalar için logolar, palet, yazı tipleri ve menü simgeleri.',
    },
    {
      title: 'Modüller ve entegrasyonlar',
      text: 'Yalnızca ihtiyacınız olan uygulamaları açın; e-postayı, mesajlaşma uygulamalarını, Google’ı ve belge dönüştürmeyi bağlayın.',
    },
  ],
  tips: [
    'Herhangi bir sayfaya veya ayara gitmek için konsolda Ctrl+K’ye (Mac’te ⌘K) basın.',
    'Erişimi doğrudan bir kişiye değil, gruplar aracılığıyla verin: biri departman değiştirdiğinde yalnızca grubu değiştirin.',
    'İzin veya kaybolan bir parola durumuna karşı en az iki süper yönetici tutun.',
    'İzin listesini açmadan önce “IP’me izin ver”e basın — aksi halde portal değişikliği reddeder.',
    'Entegrasyonlardaki “Bağlantıyı test et”, formdaki değerleri — kaydedilmemiş olsalar bile — kontrol eder.',
  ],
  sections: [
    {
      title: 'Bildirim iletimi',
      body: `**Ayarlar → Entegrasyonlar → Bildirimler** iletimi tek yerde toplar:
- **Bildirim kanalları** — e-posta, anlık bildirim, WhatsApp, Telegram ve Mattermost’un bildirim taşıyıp taşımadığı ve her birinin kaç kişiye ulaşabildiği (kimin telefonu var, kimin Telegram’ı bağlı vb.).
- **Bildirimler için WhatsApp** — sağlayıcı: oturum açma kodlarındaki gibi, yalnızca WhatsApp ağ geçidi veya yalnızca Wazzup, ayrıca bir yedek.
- **Test mesajı** — herhangi bir numaraya, e-postaya, Telegram sohbetine veya Mattermost kullanıcısına, sağlayıcının tam yanıtıyla.

Entegrasyonların kendileri (ağ geçidi adresi, Wazzup anahtarı, Telegram botu) Entegrasyonlar altındaki kendi sayfalarında ayarlanır. Neyin alınacağı her kişinin Profil → Bildirimler bölümündeki seçimidir; orada telefon da ekleyebilir ve hemen bir test alabilirler.`,
      example: {
        title: 'Kodlar ağ geçidi üzerinden, bildirimler Wazzup üzerinden',
        body: 'Oturum açma kodları anında gelmelidir — Oturum açma yöntemlerinde bunlar için WhatsApp ağ geçidini koruyun. Bildirimler için Wazzup’ı seçin ve yedeği açın: Wazzup çalışmıyorsa mesaj ağ geçidi üzerinden gider. Emin olmak için numaranıza bir test gönderin.',
      },
    },
    {
      title: 'Konsol nasıl düzenlenmiştir',
      body: `Konsolun kenar çubuğunda birkaç bölüm bulunur:

- **Genel bakış** — portalın durumu tek bakışta.
- **Kullanıcılar**, **Gruplar**, **Roller** — kişiler ve erişimleri.
- **Günlük** — güvenlik olayları.
- **API ve entegrasyonlar** — diğer sistemler için belirteçler ve web kancaları (bkz. [API ve entegrasyonlar](/help/api)).
- **Ayarlar** — diğer her şey, gruplanmış olarak: Proje, Görünüm, Güvenlik, Entegrasyonlar, Modüller, Sistem. Üstte bir arama kutusu vardır.

Herkes yalnızca izni olan bölümleri görür. “Ayarları görüntüleme” izniyle her ekran açılır, ancak alanlar salt okunurdur.`,
      note: 'Değiştirilen bir form altta Kaydet / Vazgeç çubuğu gösterir. Kaydet’e basana kadar hiçbir şey uygulanmaz.',
    },
    {
      title: 'Kullanıcılar: oluşturma ve düzenleme',
      body: `[Kullanıcılar](/admin/users) sayfası, ada, kullanıcı adına ve e-postaya göre arama ve role, gruba ve duruma göre filtrelerle oturum açabilen herkesi listeler.

Hesap oluştururken bir **kullanıcı adı** (3–32 karakter: Latin harfleri, rakamlar, nokta, alt çizgi, kısa çizgi), bir ad ve isteğe bağlı olarak e-posta, telefon ve gruplar girin. Parola isteğe bağlıdır: Active Directory, Google, Telegram veya kodla oturum açan kişiler için boş bırakın.

Kullanıcı sayfasında bir **Oturum açma için iletişim bilgileri** bloğu bulunur: telefon (WhatsApp kodları için), e-posta, Mattermost kullanıcı adı ve bağlı Telegram. Portal, kişi kodla oturum açtığında onu bunlarla tanır.`,
      steps: [
        'Kullanıcılar’ı açın ve “Yeni kullanıcı”ya basın.',
        'Kullanıcı adını ve adı, gerekirse e-postayı ve uluslararası biçimde telefonu doldurun.',
        'Grupları seçin. Hiçbirini seçmezseniz kişi varsayılan gruba katılır.',
        'Bir parola belirleyin (10+ karakter) veya parolasız oturum açma için boş bırakın.',
      ],
      note: 'E-posta benzersiz olmalıdır: iki hesap aynı adresi paylaşırsa hiçbiri e-posta kodu almaz.',
    },
    {
      title: 'Engelleme, parola ve oturum sıfırlama',
      body: `Kullanıcı sayfasındaki **Erişim** bloğunda iki anahtar vardır:

- **Etkin** — hesabın hiç oturum açamaması için kapatın (örneğin kişi ayrıldı).
- **Engellendi** — doğru parolayla bile oturum açma reddedilir. Geçici bir önlem olarak kullanışlıdır, örneğin hesabın ele geçirildiğinden şüpheleniyorsanız.

**Parola sıfırlama**: yeni bir parola girin ve kaydedin — kişinin her yerdeki oturumu kapatılır. **Oturumlar** bloğu kişinin nerede oturum açtığını gösterir (cihaz, tarayıcı veya uygulama, IP, oturum açma yöntemi, etkinlik, “olarak oturum aç” oturumları): **“Sonlandır”** bir cihazdaki oturumu kapatır, **“Her yerde oturumu kapat”** parolayı değiştirmeden hepsini bir kerede sonlandırır.

Herhangi bir erişim değişikliği — gruplar, roller, durum — da kullanıcının oturumlarını sonlandırır; böylece yeni izinlerle yeniden oturum açar.`,
      example: {
        title: 'Bir çalışan ayrıldı',
        body: 'Sayfasını açın, **Etkin**’i kapatın ve kaydedin — telefonundaki ve dizüstü bilgisayarındaki her oturum hemen sona erer. Hesabı silmeyin: görevleri, mesajları ve geçmişi doğru yazarı korur. Sahip olduğu API belirteçleri de çalışmayı durdurur.',
      },
      note: 'Kendi rollerinizi, gruplarınızı veya durumunuzu değiştiremezsiniz — başka bir yöneticiye sorun. Sizden fazla izni olan bir hesap sizin için salt okunurdur.',
    },
    {
      title: 'Gruplar',
      body: `[Gruplar](/admin/groups) ekipler ve departmanlardır. Her üye grubun tüm **üyelere verilen rollerini** otomatik olarak alır. Bir kişi birkaç grupta olabilir — izinler toplanır.

Bir grup **varsayılandır**: yönetici yeni hesapları grupsuz oluşturduğunda veya hesaplar Active Directory, Google ya da Telegram üzerinden ilk oturum açmada otomatik olarak oluşturulduğunda bu gruba katılır. Varsayılan grup silinemez — önce başka bir grubu varsayılan yapın.

Active Directory ile kişiler oturum açarken portal gruplarına otomatik olarak eklenebilir — bkz. “Oturum açma yöntemleri”.`,
      example: {
        title: 'Satış ekibinin cari hesapları yönetmesine izin verin',
        body: `1. [Roller](/admin/roles) bölümünde “Cari hesaplar — yönetim” adlı bir rol oluşturun ve “Cari hesap yöneticisi”ni işaretleyin.
2. [Gruplar](/admin/groups) bölümünde bir “Satış” grubu oluşturun (veya mevcut olanı açın).
3. “Üyelere verilen roller” altında yeni rolü işaretleyin ve “Üyeler” altında çalışanları ekleyin.
4. Kaydedin. Yeni satış temsilcilerinin artık yalnızca gruba katılması yeterlidir — izinler arkasından gelir.

Her çalışan bu rol olmadan da cari hesaplar rehberini görüntüleyebilir; rol herhangi bir kartı değiştirmek ve modülü yapılandırmak için gerekir.`,
      },
      note: 'Bir gruba kendinizde olmayan bir rolü veremezsiniz — bu tür roller soluk gösterilir.',
    },
    {
      title: 'Roller ve izinler',
      body: `**İzin** belirli bir eylemdir: “Yönetim konsolunu açma”, “Kullanıcıları yönetme”, “Oturum açma yöntemleri” vb. Liste sabittir; modüller kendi izinlerini ekler (örneğin “Bilgi bankası yöneticisi”).

**Rol** adlandırılmış bir izin setidir. Bir gruba (önerilir) veya doğrudan bir kişiye verilir. Bir kişinin geçerli izinleri, doğrudan ve gruplar aracılığıyla sahip olduğu tüm rollerin toplamıdır; bunları kullanıcı sayfasında **Geçerli erişim** altında görürsünüz.

Yerleşik roller:

- **Süper yönetici** — her şey; düzenlenemez veya silinemez.
- **Yönetici** — kullanıcılar, gruplar, günlük, marka, entegrasyonlar.
- **Moderatör** — kullanıcılara yardım eder: profiller, parola sıfırlama, engelleme, günlük.
- **Denetçi** — salt okunur: kullanıcılar, günlük, ayarlar.
- **Kullanıcı** — yalnızca kişisel alan.

Yerleşik rollerin izinlerini değiştirebilirsiniz — değişiklikler güncellemelerde korunur. Kendi rolleriniz oluşturulabilir ve silinebilir.`,
      example: {
        title: 'Harici bir denetçi için rol',
        body: 'Denetçi için bir hesap oluşturun ve onu “Denetçiler” grubuna (Denetçi rolüyle) ekleyin. Kullanıcıları, günlüğü ve her ayarı görür, ancak hiçbir şeyi değiştiremez. Denetim bittiğinde **Etkin**’i kapatın.',
      },
      note: 'Güvenlik kuralları: yalnızca kendinizde olanı verebilir veya kaldırabilirsiniz; bir yönetici süper yönetici oluşturamaz; her zaman en az bir etkin süper yönetici vardır — bunu bozacak bir değişiklik reddedilir.',
    },
    {
      title: 'Güvenlik günlüğü',
      body: `[Günlük](/admin/activity) sayfası, üstte 24 saatlik sayaçlarla 90 günlük güvenlik olaylarını gösterir. Olay türleri:

- **Başarısız oturum açma** ve **Hesap kilitleme** — parola tahmini veya unutkan bir çalışan.
- **Devre dışı / Engellenmiş hesap** — kapalı bir hesapta oturum açma girişimi.
- **Engelleme listesindeki IP** ve **İzin listesinde olmayan IP** — IP filtresi retleri.
- **Oturum açma deneme sınırı** — tek bir adresten çok fazla deneme.
- **Bilinmeyen iletişim bilgisi için kod** ve **Kod iletilemedi** — oturum açma kodlarıyla ilgili sorunlar.

Olay türü filtresi listeyi daraltır. Her satırda saat, kullanıcı adı, IP adresi ve ayrıntılar bulunur.`,
      example: {
        title: 'Biri parola tahmin ediyor',
        body: 'Günlük, bilinmeyen tek bir IP’den farklı kullanıcı adlarıyla düzinelerce başarısız oturum açma gösteriyor. Adresi kopyalayın, **Ayarlar → IP filtreleme**’yi açın ve “parola tahmini” nedeniyle engelleme listesine ekleyin. Bundan hemen haberdar olmak için Mattermost entegrasyonunda güvenlik uyarılarını açın.',
      },
    },
    {
      title: 'Görünüm',
      body: `**Proje** ve **Görünüm** ayar grupları:

- **Genel** — portal adı ve açıklaması, logo (2 MB’a kadar SVG, PNG, JPG veya WebP), koyu tema için ayrı bir logo ve üst bilgideki logo yüksekliği.
- **Renk teması** — palet şablonu, renklerin ince ayarı (vurgu, arka plan, metin, durumlar) ve tema seçmemiş kişiler için varsayılan tema.
- **Tipografi** — 28 yazı tipi sisteminden biri, temel boyut ve başlık kalınlığı.
- **Menü simgeleri** — renkli kutucuklar veya tek renkli glifler ve her menü öğesi için bir simge.

Her değişiklik size canlı önizleme olarak görünür. Diğerleri bunu ancak Uygula / Kaydet’e bastıktan sonra görür.`,
      note: 'Logonuz koyuysa “Koyu tema için” açık renkli bir sürüm yükleyin — aksi halde koyu arka planda kaybolur.',
    },
    {
      title: 'Bölge ve saat',
      body: `[Ayarlar → Genel](/admin/settings/general) bölümündeki **Bölge ve saat** bloğu portalın **saat dilimini**, **tarih biçimini**, **saat biçimini** ve **haftanın ilk gününü** belirler.

- Portalın saat dilimi; kendi saat dilimini seçmemiş herkes için “bugün”ü, “gün sonu” son tarihlerini, hatırlatmaları, sessiz saatleri ve e-postalardaki tarihleri belirler.
- Tarih ve saat biçimleri, tarihlerin ekranda ve bildirimlerde nasıl göründüğüdür; haftanın ilk günü takvimlerde ve tarih seçicilerde kullanılır.
- Her kişi bunlardan herhangi birini [Kişisel alan → Görünüm](/account/appearance) bölümünde değiştirebilir.

Bloğun altı tarihlerin nasıl görüneceğini gösterir.`,
      note: 'Portalın saat dilimini dikkatle değiştirin: kendi saat dilimi olmayan herkes için hatırlatma saatleri ve sessiz saatler kayar. Kaydedilmiş toplantılar ve son tarihler aynı anlar olarak kalır — yalnızca gösterimleri değişir.',
    },
    {
      title: 'Arayüz dilleri',
      body: `[Ayarlar → Diller](/admin/settings/languages) bölümünde bir **süper yönetici** kişilerin hangi dilleri seçebileceğine karar verir: Rusça, İngilizce, Kırgızca, Türkçe ve Çince.

- Dilleri açın veya kapatın; en az biri açık kalır. Dil değiştiricilerin onları gösterdiği sırayı belirlemek için sürükleyin — üst bilgide, oturum açma sayfasında, profilde ve herkese açık sayfalarda.
- **Varsayılan dil** — konuklar ve dil seçmemiş kişiler için: sabit bir dil veya **tarayıcı dili** — ziyaretçinin tarayıcı dillerinden açık olan ilki, yoksa seçtiğiniz yedek dil.
- Bir kişinin kendi seçimi, o dil açık olduğu sürece her zaman kazanır. Dili kapatırsanız varsayılanı alırlar; bildirimler ve e-postalar da aynı kuralı izler.

Bir dilin yanındaki etiket arayüzün ne kadarının çevrildiğini gösterir; henüz çevrilmemiş her şey İngilizce görünür.`,
      note: 'Diğer yöneticiler bu sayfayı görür ancak değiştiremez.',
    },
    {
      title: 'Oturum açma yöntemleri',
      body: `**Güvenlik → Oturum açma yöntemleri** ekranı kişilerin nasıl içeri gireceğine karar verir. Oturum açma sayfası yalnızca etkin **ve** entegrasyonu yapılandırılmış yöntemleri gösterir; her yöntem, entegrasyonunun hazır olup olmadığını ayarlama bağlantısıyla gösterir.

- **Kullanıcı adı ve parola** — klasik yol. Kapatırsanız süper yöneticiler parolalarını yine de kullanabilir — acil durum girişi.
- **Google** — bir Google veya Google Workspace hesabı, isteğe bağlı olarak şirket etki alanlarıyla sınırlı.
- **Active Directory / LDAP** — etki alanı kullanıcı adı ve parolası. Hesaplar otomatik olarak oluşturulabilir ve dizin grupları portal gruplarıyla eşlenebilir.
- **Telegram ile oturum açma** — tek dokunuş; kişi önce profilinde Telegram’ı bağlar.
- **Tek kullanımlık kodlar** — WhatsApp, e-posta, Telegram veya Mattermost üzerinden 6 hane. Kod 5 dakika geçerlidir ve 5 denemeye izin verir.
- **Oturum açma bağlantıları (magic link)** — kod yerine tek tıklamalık bir bağlantı, 15 dakika geçerli.`,
      example: {
        title: 'Etki alanı hesabıyla oturum açma',
        body: `1. **Entegrasyonlar → Active Directory**: etki alanı denetleyicisi, hizmet hesabı ve Base DN, ardından Bağlantıyı test et.
2. **Oturum açma yöntemleri**: Active Directory’yi ve “Hesapları otomatik oluştur”u etkinleştirin.
3. “Dizin grubu eşlemesi” altında satırlar ekleyin: \`Sales\` → “Satış”, \`Portal Admins\` → “Yöneticiler”.

Çalışanlar artık etki alanı kullanıcı adlarıyla (\`ivanov\` veya \`ivanov@corp.local\`) oturum açar, hesap otomatik olarak oluşturulur ve her oturum açmada AD gruplarına göre portal gruplarına eklenirler.`,
      },
      note: 'Telegram ile otomatik hesap oluşturma bilinmeyen her Telegram kullanıcısı için bir hesap oluşturur — kapalı bir kurumsal portal için kapalı tutun.',
    },
    {
      title: 'Site erişimi',
      body: `**Güvenlik → Site erişimi** ekranı:

- **Kapalı** mod — konuklar hemen oturum açma formunu görür; oturum açmadan hiçbir şey gösterilmez. Çoğu kurumsal portal için doğrudur.
- **Açık** mod — herkese açık ana sayfa herkese görünür, ancak kişisel alan, modüller ve konsol yine oturum açmayı gerektirir.

Aynı ekran **Ana sayfa**yı belirler — sitenin adresinde ne açılacağı: karşılama sayfası veya etkin modüllerden biri (örneğin Pano veya Çevrimiçi kaynaklar).`,
    },
    {
      title: 'Oturum açma, kilitlemeler ve oturumlar',
      body: `**Güvenlik → Oturum açma ve oturumlar** ekranı:

- **Kilitlemeden önceki başarısız deneme sayısı** (3–30, varsayılan 8) ve **Kilitleme süresi** (5–180 dakika, varsayılan 15). Kullanıcı adı başına ve IP adresi başına ayrı sayılır: tek bir adresten tahmin o adresi kilitler; birçok adresten tek bir kullanıcı adını tahmin etmek o kullanıcı adını kilitler.
- **Oturum süresi** (1–90 gün, varsayılan 7) — kişilerin kaç gün sonra yeniden oturum açması gerektiği. Yeni oturum açmalara uygulanır.

Başarısız kodla oturum açmalar da kilitlemeye sayılır ve günlükte görünür.`,
      note: 'Birinin kullanıcı adını bilen bir saldırgan o kişinin kilitlenmesini tetikleyebilir. Bir çalışan kilitlendiğinden şikâyet ederse günlüğü kontrol edin — saldırganın adresi engelleme listesine eklenmeyi hak edebilir.',
    },
    {
      title: 'IP filtreleme',
      body: `**Güvenlik → IP filtreleme** ekranı kişileri adrese göre içeri alır veya dışarıda tutar:

- **Engelleme listesi** — listelenen adresler reddedilir. Engelleme listesi her zaman kazanır.
- **İzin listesi modu** — yalnızca listelenen adresler içeri alınır; diğer herkes reddedilir.

Bir kural tek bir adres (IPv4 veya IPv6) veya CIDR biçiminde bir IPv4 ağıdır, örneğin \`10.0.0.0/8\` veya \`192.168.1.0/24\`, isteğe bağlı bir nedenle. Sunucunun kendi adresine her zaman izin verilir.

Portal sizi dışarıda bırakacak bir değişikliği reddeder: önce **IP’me izin ver** ile kendi adresinizi izin listesine ekleyin.`,
      example: {
        title: 'Yalnızca ofisten erişim',
        body: `1. Ağ yöneticinizden harici ofis ve VPN adreslerini alın, örneğin \`203.0.113.10\` ve \`198.51.100.0/24\` ağı.
2. Bunları “Ofis” ve “VPN” nedenleriyle izin listesine ekleyin. Ofiste değilseniz “IP’me izin ver”e basın.
3. **İzin listesi modu**nu açın ve kaydedin.

Evden çalışan kişiler artık yalnızca VPN üzerinden girebilir.`,
      },
      note: 'CIDR ağları yalnızca IPv4 için desteklenir; IPv6 adresleri tam olmalıdır.',
    },
    {
      title: 'Entegrasyonlar',
      body: `Tüm entegrasyonlar varsayılan olarak kapalıdır. Her birinin bir Etkin anahtarı, bağlantı alanları ve bir **Bağlantıyı test et** düğmesi vardır. Parolalar, belirteçler ve anahtarlar yalnızca sunucuda tutulur: kaydedildikten sonra alanda “Kaydedildi — değiştirmek için yazın” görünür; değeri korumak için boş bırakın.

- **E-posta (SMTP)** — oturum açma kodları ve bağlantıları, bildirimler. Ana bilgisayar, bağlantı noktası, SSL/TLS (465 numaralı bağlantı noktası için açık, 587 için kapalı), kullanıcı, parola, gönderen.
- **Telegram botu** — Telegram ile oturum açma ve Telegram’da kodlar. @BotFather’dan belirteç; bot adı testten sonra doldurulur. @BotFather’da portalın adresiyle \`/setdomain\` komutunu çalıştırın.
- **WhatsApp Gateway** — kendi WhatsApp ağ geçidiniz: adres ve API anahtarı (bir anahtar = bir gönderen numarası).
- **Wazzup** — tek bir hesap üzerinden WhatsApp, Telegram, Instagram ve daha fazlası. API anahtarını girin, kanalları yükleyin ve her mesajlaşma uygulaması için bir kanal seçin.
- **Mattermost** — bir bottan doğrudan mesaj olarak oturum açma kodları ve bir kanala güvenlik uyarıları.
- **Google** — Google ile oturum açma, kullanıcılar için Google Takvim ve Gmail üzerinden e-posta gönderme.
- **Belge dönüştürme** — Office dosyalarını PDF olarak görüntülemek için Collabora / LibreOffice sunucu adresi.
- **Active Directory** — etki alanı denetleyicisi, hizmet hesabı, Base DN.`,
      example: {
        title: 'Yedekli WhatsApp oturum açma kodları',
        body: `1. **WhatsApp Gateway** ve **Wazzup**’ı ayarlayıp test edin (Wazzup’ta bir WhatsApp kanalı seçin).
2. **Oturum açma yöntemleri** bölümünde “WhatsApp’ta kod”u açın, “Gönderim yolu” altında ana sağlayıcıyı seçin ve yedeği açın.
3. Çalışanların profillerinde telefonlarının uluslararası biçimde olduğundan emin olun.

Ana sağlayıcı başarısız olursa kod diğerinden gider ve hata günlükte “Kod iletilemedi” olarak görünür.`,
      },
    },
    {
      title: 'Modüller',
      body: `Modüller portalın uygulamalarıdır: Pano, Cari hesaplar, Çevrimiçi kaynaklar, Dosya sunucusu, Dosyalar, Bilgi bankası, Görevler, Sohbet, Takvim. **Modüller** ekranında her biri için bir anahtar bulunur.

- **Açık** bir modül uygulamalar menüsünde ve üst bilgide görünür.
- **Kapalı** bir modül her yerden kaybolur; adresleri ve herkese açık bağlantıları “bulunamadı” yanıtını verir. **Veriler korunur** — yeniden açmak her şeyi geri getirir.

Çoğu modülün kendi ayarları vardır (karttaki Ayarlar bağlantısı): yükleme sınırları, cari hesap kartlarını kimlerin değiştirebileceği, DaData anahtarı vb. Bunun için “Modüller” izni gerekir.`,
      note: 'Bir modülün içeriğini yönetmek rollerde ayrı bir izindir: “Bilgi bankası yöneticisi”, “Cari hesap yöneticisi” vb. Modülleri açmakla ilgisi yoktur.',
    },
    {
      title: 'Sistem ve sınırlar',
      body: `**Sistem** ekranı portal sürümünü, ortamı, çalışma süresini, saat dilimini ve veritabanı durumunu gösterir — desteğe başvururken kullanışlıdır.

**API istek sınırı** bloğu portalı aşırı yüke karşı korur:

- **Konuklar: IP başına istek** — varsayılan olarak pencere başına 300.
- **Oturum açmış: kişi başına istek** — varsayılan 5000; tek bir ofis IP’sinin arkasındaki iş arkadaşları bir kotayı paylaşmaz.
- **Pencere** — sayım dönemi, varsayılan 15 dakika.

Sayfa yüklemeleri, dosya görüntülemeleri ve oturum açma sayılmaz. Sınırlar hemen uygulanır; yeni bir pencere sunucu yeniden başlatıldıktan sonra geçerli olur. API belirteci sınırları API ve entegrasyonlar altında ayrıca belirlenir.`,
    },
  ],
  faq: [
    {
      q: 'Devre dışı ile Engellendi arasındaki fark nedir?',
      a: 'İkisi de oturum açmayı engeller ve oturumları sonlandırır. “Etkin: kapalı” ayrılan kişiler için olağan durumdur. “Engellendi” bir sorunu işaretler (ele geçirilme şüphesi, ihlal); bu tür oturum açma girişimleri ayrıca günlüğe yazılır.',
    },
    {
      q: 'Neden bir rol veremiyorum veya bir kullanıcıyı düzenleyemiyorum?',
      a: 'Yalnızca kendinizde olan izinleri verebilirsiniz ve sizden fazla izni olan hesaplar salt okunurdur. Ayrıca kendi rollerinizi, gruplarınızı veya durumunuzu değiştiremezsiniz — başka bir yöneticiye sorun.',
    },
    {
      q: 'İzin listesini açtım ve giremiyorum. Ne yapmalıyım?',
      a: 'Portal mevcut adresinizi dışarıda bırakacak bir kuralı reddeder, ancak başka bir ağdan geliyorsanız izinli bir ağdaki bir iş arkadaşınızdan IP’nizi eklemesini isteyin. Sunucunun kendisine (localhost) her zaman izin verilir.',
    },
    {
      q: 'Bir çalışan oturum açma kodu almıyor. Nereye bakmalıyım?',
      a: 'Sayfasındaki telefonu (uluslararası biçim), e-postayı (paylaşılmamış olmalı) veya Mattermost kullanıcı adını kontrol edin. Ardından [Günlük](/admin/activity) sayfasına bakın: “Bilinmeyen iletişim bilgisi için kod” portalın kişiyi eşleştiremediği, “Kod iletilemedi” entegrasyonun başarısız olduğu anlamına gelir.',
    },
    {
      q: 'Telegram “Bot domain invalid” diyor',
      a: '@BotFather’da `/setdomain` komutunu çalıştırın, botunuzu seçin ve portalın etki alanını girin (örneğin `portal.company.com`).',
    },
    {
      q: 'Bir modül kapatıldığında veriler kaybolur mu?',
      a: 'Hayır. Modül yalnızca görünmez ve erişilemez olur. Yeniden açın; tüm veriler ve bağlantılar yeniden çalışır.',
    },
    {
      q: 'Parolayla oturum açma tamamen kapatılabilir mi?',
      a: 'Normal kullanıcılar için evet. Süper yöneticiler parolayla oturum açmayı acil durum girişi olarak korur; böylece bozuk bir dizin veya mesajlaşma uygulaması hiçbir zaman herkesi dışarıda bırakmaz.',
    },
    {
      q: 'Birini nasıl yönetici yaparım?',
      a: 'Onu “Yöneticiler” grubuna (veya Yönetici rolüne sahip herhangi bir gruba) ekleyin. Başka bir süper yöneticiyi yalnızca bir süper yönetici atayabilir.',
    },
  ],
  fields: {
    notifyChannels: {
      title: 'Bildirim kanalları',
      text: 'Bir kanal, entegrasyonu ayarlandığında ve burada açık olduğunda bildirim iletir. Çubuk kaç kişinin gerekli iletişim bilgisine sahip olduğunu gösterir.',
    },
    notifyWhatsapp: {
      title: 'Bildirimler için WhatsApp',
      text: 'Sağlayıcıyı oturum açma kodlarından ayrı seçin: örneğin kodlar ağ geçidi üzerinden, bildirimler Wazzup üzerinden, bir yedekle.',
    },
    regional: {
      title: 'Bölge ve saat',
      text: 'Tüm portal için saat dilimi ve biçimler. Her kişi kendi ayarını Kişisel alan → Görünüm bölümünde seçebilir.',
    },
    groups: {
      title: 'Gruplar',
      text: 'Erişim vermenin ana yolu: kişi gruplarının tüm rollerini alır. Departman değiştirdiğinde yalnızca grubu değiştirin.',
    },
    directRoles: {
      title: 'Doğrudan roller',
      text: 'Yalnızca istisnalar için — örneğin bir kişinin departmanında olmayan bir erişime ihtiyacı varsa. Doğrudan roller ve grup rolleri toplanır.',
    },
    blocked: {
      title: 'Etkin ve Engellendi',
      text: 'İkisi de kişiyi dışarıda tutar ve oturumlarını hemen sonlandırır. “Etkin: kapalı” ayrılan kişiler için, “Engellendi” ele geçirilme şüphesi veya ihlal içindir.',
    },
    sessions: {
      title: 'Her yerde oturumu kapat',
      text: 'Parolayı değiştirmeden kullanıcının tüm cihazlardaki oturumlarını sonlandırır. Parola sıfırlama veya erişim değişikliği bunu otomatik olarak yapar.',
    },
    defaultGroup: {
      title: 'Varsayılan grup',
      text: 'Açık grupları olmayan yeni hesaplar buraya düşer — elle veya AD, Google ya da Telegram üzerinden otomatik olarak oluşturulmuş. Ona en az izni verin.',
    },
    groupRoles: {
      title: 'Üyelere verilen roller',
      text: 'Her üye işaretli tüm rolleri alır. Kendinizde olmayan rolleri veremezsiniz.',
    },
    permissions: {
      title: 'İzinler',
      text: 'Her satır bir eylemdir. Bir rol işaretli izinlerin toplamını verir; kilitli satırlar sizde olmayan izinlerdir.',
    },
    accessMode: {
      title: 'Erişim modu',
      text: '“Kapalı” — konuklar yalnızca oturum açma formunu görür. “Açık” — konuklar ana sayfayı görür; diğer her şey yine oturum açmayı gerektirir.',
    },
    lockout: {
      title: 'Kaba kuvvet koruması',
      text: 'Belirlenen sayıda art arda başarısız denemeden sonra kullanıcı adı veya IP adresi belirtilen süre boyunca kilitlenir. Kullanıcı adları ve IP’ler ayrı sayılır.',
    },
    sessionDays: {
      title: 'Oturum süresi',
      text: 'Oturum açtıktan kaç gün sonra kişinin yeniden oturum açması gerektiği. Yeni oturum açmalara uygulanır.',
    },
    whitelist: {
      title: 'İzin listesi modu',
      text: 'Yalnızca izin listesindeki adresleri içeri alır. Önce “IP’me izin ver” ile kendi adresinizi ekleyin, aksi halde portal bu modu açmaz.',
    },
    ipRules: {
      title: 'IP kuralları',
      text: 'Tek bir adres (IPv4 veya IPv6) veya `10.0.0.0/8` gibi bir IPv4 ağı. Engelleme listesi her zaman izin listesini yener.',
    },
    groupMap: {
      title: 'Dizin grubu eşlemesi',
      text: 'Her oturum açmada AD grubunun bir üyesi seçilen portal grubuna eklenir. Grup adını (CN) veya tam DN’yi girin. Elle eklenen gruplar korunur.',
    },
    magicLink: {
      title: 'Oturum açma bağlantıları',
      text: '6 haneli kod yerine kişi aynı kanal üzerinden tek tıklamalık bir bağlantı alır. Tek kullanımlıktır ve 15 dakika geçerlidir.',
    },
    smtp: {
      title: 'E-posta (SMTP)',
      text: 'SSL/TLS’yi 465 numaralı bağlantı noktası için açın, 587 için kapatın. Birçok sağlayıcı posta kutusu parolası değil, bir uygulama parolası ister.',
    },
    telegramBot: {
      title: 'Telegram botu',
      text: '@BotFather’dan aldığınız belirteci yapıştırın ve Bağlantıyı test et’e basın — bot adı doldurulur. @BotFather’da `/setdomain` komutunu unutmayın.',
    },
    whatsappGateway: {
      title: 'WhatsApp Gateway',
      text: 'Ağ geçidinizin adresi ve yöneticisinden alınan bir API anahtarı. Her anahtar tek bir numaraya bağlıdır — kodlar o numaradan gönderilir.',
    },
    wazzup: {
      title: 'Wazzup',
      text: 'Wazzup’tan alınan API anahtarı (Integrations → API). Kanalları yükledikten sonra her mesajlaşma uygulaması için kullanılacak kanalı seçin.',
    },
    mattermost: {
      title: 'Mattermost',
      text: 'Sunucu adresi ve bot hesabı belirteci. Uyarılar için botu bir kanala ekleyin ve kanalın adını değil, kimliğini (26 karakter) girin.',
    },
    isms: {
      title: 'iSMS Server',
      text: 'iSMS Server adresiniz (örneğin https://sms.ismarty.pro) ve sunucunun API sayfasından bir API belirteci (pat_ ile başlar). Belirteç tek bir telefon ve SIM ile sınırlı olabilir — o zaman o SIM’i seçin veya “Otomatik” bırakın.',
    },
    documents: {
      title: 'Belge dönüştürme',
      text: 'Portal sunucusundan erişilebilen bir Collabora / LibreOffice sunucu adresi. Belgeler ağınızın içinde kalır ve dönüştürücüde saklanmaz.',
    },
    activeDirectory: {
      title: 'Active Directory',
      text: '389 numaralı bağlantı noktası veya TLS ile 636. Hizmet hesabının yalnızca kullanıcıları arayabilmesi gerekir. Test, gerçek bir bağlanma ve Base DN altında bir arama yapar.',
    },
    rateLimit: {
      title: 'İstek sınırı',
      text: 'Aşırı yük koruması: konuklar IP başına, oturum açmış kişiler hesap başına sayılır. Kişiler “çok fazla istek” görüyorsa sınırı yükseltin.',
    },
  },
};
