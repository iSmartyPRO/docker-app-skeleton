export default {
  title: 'API ve entegrasyonlar',
  tagline: '1C’yi, botları, İK’yı ve diğer sistemleri portala bağlayın — hassas erişim denetimiyle',
  summary: 'Diğer sistemler portalla bir **belirteç** kullanarak REST API üzerinden çalışır: görev oluşturur, sohbete mesaj yazar, takvimleri ve personeli eşitler. Her belirteç belirli bir kişi adına çalışır ve hiçbir zaman onun izinlerinden fazlasını almaz; yönetici erişimi şablonlar, alanlar, kaynaklar ve kurallarla daha da daraltır. **Web kancaları** ters yönde çalışır ve harici sistemlere portal olaylarını olduğu anda bildirir.',
  highlights: [
    {
      title: 'Belirteçler bir kişi adına çalışır',
      text: 'Belirteç sahibinin izinleriyle çalışır — hiçbir zaman o kişinin yapabileceğinden fazlasını yapmaz.',
    },
    {
      title: 'Erişim şablonları',
      text: '“Salt okunur”, “Sohbet botu”, “İK rehberi senkronizasyonu” gibi hazır setler ve kendi şablonlarınız.',
    },
    {
      title: 'Ayrıntılı denetim',
      text: 'Alan başına düzeyler, belirli projeler ve takvimler, yol kuralları, IP, geçerlilik süresi ve istek sınırı.',
    },
    {
      title: 'Web kancaları',
      text: 'Görevler, mesajlar, takvim etkinlikleri ve kullanıcılar hakkında imzalı bildirimler, başarısızlıkta yeniden denenir.',
    },
    {
      title: 'İstek günlüğü',
      text: 'Her belirteç çağrısı: kim, ne, hangi sonuçla ve kaç milisaniyede.',
    },
    {
      title: 'Geliştirici portalı',
      text: 'Örnekli başvuru kaynağı, bir “Deneyin” konsolu ve Postman için OpenAPI — /developers adresinde.',
    },
  ],
  tips: [
    'Her entegrasyona kendi teknik hesabını ve kendi belirtecini verin.',
    'Belirteç yalnızca bir kez gösterilir — hemen entegrasyonun gizli bilgi deposunda saklayın.',
    'Belirteç düzenleyicideki “Bir isteği kontrol et” paneli, belirtecin bir çağrıya izin verip vermediğini hemen söyler.',
    'Her entegrasyon belirtecine bir geçerlilik süresi ve IP listesi belirleyin — sızıntılara karşı ücretsiz bir sigorta.',
    'Genel bakıştaki “Dikkat gerektirenler”i izleyin: süresi dolan ve kullanılmayan belirteçler ve başarısız web kancaları orada görünür.',
  ],
  sections: [
    {
      title: 'Belirteç nedir',
      body: `**API belirteci**, başka bir sistemin portalla konuşmak için kullandığı \`pat_k3Jd9xQe_…\` gibi uzun bir gizli anahtardır. \`Authorization: Bearer …\` üst bilgisinde gönderilir ve sahibi olarak oturum açmak gibi çalışır: sahibinin rolleri, grupları ve projelere ve klasörlere erişimi geçerlidir.

Belirteçlerin yönetildiği yerler:

- **Yönetim konsolu → API ve entegrasyonlar** ([/admin/api](/admin/api)) — tüm belirteçler, şablonlar, web kancaları, günlük ve ayarlar. “API yönetimi” izni gerekir.
- **Kişisel alan → API belirteçleri** ([/account/api](/account/api)) — kendi belirteçleriniz. “Kişisel API belirteçleri” izni gerekir.

Portal belirtecin yalnızca bir parmak izini tutar, bu yüzden belirteç yeniden gösterilemez. Kaybolursa **Yeni gizli anahtar**’a basın: eskisi hemen çalışmayı durdurur. **İptal et** belirteci anında ve kalıcı olarak kapatır.`,
      note: 'Belirteçler hiçbir zaman oturum açamaz veya kapatamaz, parolaları ya da oturumları değiştiremez veya başka belirteçleri yönetemez — bu işlemler yalnızca arayüzdeki kişiler içindir.',
    },
    {
      title: 'Kişisel belirteçler ve başkaları adına belirteçler',
      body: `- **Kişisel belirteci** bir kişi kendisi için kişisel alanında oluşturur — örneğin kendi görev dışa aktarma betiği için. Oluşturanın izinlerine sahiptir.
- Başka bir hesap **adına belirteci** bir API yöneticisi verir (**Adına çalıştığı kişi** alanı). Bu tür belirteçler listede “Başkası adına” olarak işaretlenir.

Entegrasyonlar için özel bir **teknik hesap** (“1C entegrasyonu”, “Destek botu”) oluşturun, ona tam olarak ihtiyaç duyduğu grupları verin ve belirteci onun adına verin. Böylece entegrasyon bir çalışana bağlı olmaz: o kişi ayrılır ve hesabı devre dışı bırakılırsa belirteçleri çalışmayı durdurur.`,
      example: {
        title: '1C ile entegrasyon',
        body: `1. [Kullanıcılar](/admin/users) bölümünde parolasız bir “1C entegrasyonu” hesabı oluşturun ve onu doğru görev projesine erişimi olan bir gruba ekleyin.
2. **API ve entegrasyonlar → Yeni belirteç** bölümünde onu “Adına çalıştığı kişi” altında seçin, şablon **Görev entegrasyonu**.
3. “Yalnızca seçilen kaynaklar” altında “Muhasebe” projesini, “İzin verilen IP adresleri” altında 1C sunucusunu işaretleyin, geçerlilik süresi 1 yıl.
4. Belirteci kopyalayın ve güvenli bir kanaldan 1C geliştiricisine iletin.

1C görevleri yalnızca “Muhasebe”de, yalnızca kendi sunucusundan oluşturur ve her çağrı günlüktedir.`,
      },
    },
    {
      title: 'Erişim şablonları',
      body: `**Şablon**, alan düzeyleri ve kurallardan oluşan adlandırılmış bir settir. Belirteç bir şablona başvurur ve yalnızca kendi farklarını saklar. Bu yüzden bir şablonu değiştirmek ona dayanan her belirteci değiştirir.

Yerleşik şablonlar (salt okunurdur, ancak **Çoğalt** ile kopyasını düzenleyebilirsiniz):

- **Salt okunur** — sahibin gördüğü her şeyi okur. Raporlar, BI, dışa aktarmalar.
- **Tam kullanıcı erişimi** — modüllerdeki her şey, yönetim yok.
- **Görev entegrasyonu** — görevler ve sohbetleri, takvimi ve profili okuma.
- **Takvim senkronizasyonu** — etkinlik oluşturur ve değiştirir.
- **Sohbet botu** — sohbetlere yazar, bildirimleri okur, mesajları hiçbir zaman silmez.
- **İK rehberi senkronizasyonu** — hesapları ve grupları oluşturur ve günceller; silme reddedilir.
- **İzleme ve denetim** — güvenlik olayları, ayarlar, pano — salt okunur.
- **Tam erişim** — yönetim dahil her alan. Dikkatli kullanın.

Kendi şablonlarınız **Erişim şablonları** sekmesinde oluşturulur: ad, açıklama, renk, simge, düzeyler ve kurallar. Etkin belirteçlerin kullandığı bir şablon silinemez.`,
    },
    {
      title: 'Alana göre ince ayar',
      body: `API **alanlara** bölünmüştür: Profil, Bildirimler, her modül için bir alan (Görevler, Sohbet, Takvim, Dosyalar, Bilgi bankası, Cari hesaplar…) ve üç yönetim alanı — Kullanıcılar ve gruplar, Güvenlik, Portal ayarları. Her alan belirteçte bir düzey alır:

- **Erişim yok**;
- **Okuma** — yalnızca veri getirme;
- **Okuma ve yazma** — oluşturma, değiştirme ve silme.

Şablon düzeyleri tek bir belirteç için değiştirilebilir — değişiklikler “değiştirildi” olarak işaretlenir ve “Şablona sıfırla” birini geri alır. Sağdaki **Geçerli erişim** paneli sonucu gösterir.`,
      note: 'Alan düzeyi sahibin izinlerini hiçbir zaman genişletmez: Görevler’de “Okuma ve yazma” düzeyine sahip bir belirteç, sahibinin yalnızca görüntüleyebildiği bir projeyi yine de değiştiremez.',
    },
    {
      title: 'Yalnızca seçilen kaynaklar',
      body: `Bir belirteç (ve bir web kancası) şunlarla daraltılabilir:

- **görev projeleri** — “Proje yok (TSK)” dahil;
- **takvimler**;
- **dosya alanları** — yalnızca paylaşılanlar; böyle bir belirteç sahibinin kişisel dosyalarına ulaşamaz.

Sınır her modül çağrısına uygulanır: listeler, arama, kartlar, oluşturma, pano pencere öğeleri, görev sohbeti. Daraltılmış bir belirteç, sahibi bu izne sahip olsa bile hiçbir zaman modül yöneticisi ayrıcalığı almaz.`,
      example: {
        title: 'Toplantı odası rezervasyonu',
        body: 'Bir rezervasyon sitesi toplantıları yalnızca “Oda 1” takviminde oluşturmalıdır. Belirteç: şablon **Takvim senkronizasyonu**, “Yalnızca seçilen kaynaklar” → yalnızca “Oda 1” işaretli Takvimler. Başka herhangi bir takvime dokunmak `TOKEN_LIMITED` döndürür.',
      },
    },
    {
      title: 'Hassas kurallar',
      body: `Bir kural tek bir API yoluna izin verir veya onu reddeder. Bir etkisi (**İzin ver** / **Reddet**), yöntemleri (boş = herhangi biri) ve \`/api/v1\`’e göre bir yolu vardır; burada \`*\` bir yol parçası, \`**\` yolun geri kalanıdır.

Kontrol sırası:

1. Belirteçlere hiçbir zaman açık olmayan bir yol — reddedilir.
2. Bir **Reddet** kuralı eşleşir — reddedilir. Reddet her zaman kazanır.
3. Bir **İzin ver** kuralı eşleşir — alan kapalı olsa bile geçer.
4. Aksi halde alan düzeyi karar verir.
5. Ardından modülün içinde sahibin izinleri ve kaynak sınırları uygulanır.

Örnekler:

- Reddet \`DELETE /app/**\` — belirteç hiçbir zaman hiçbir şey silmez.
- İzin ver \`POST /app/chat/rooms/*/messages\` — Sohbet alanı salt okunurken mesaj yazmaya izin verilir.`,
      example: {
        title: 'Ekip sohbetinde bir bot',
        body: 'Bir izleme botu “Nöbet” sohbetine yazar. Bir “İzleme botu” hesabı oluşturun, onu o sohbete ekleyin ve **Sohbet botu** şablonuyla bir belirteç verin — şablon zaten “Reddet `DELETE /app/chat/**`” kuralını içerir. Bot mesaj gönderir, ancak kendisininki dahil kimsenin mesajını silemez. “İzin verildi” sonucunu görmek için “Bir isteği kontrol et” alanına `POST /app/chat/rooms/12/messages` yazın.',
      },
    },
    {
      title: 'IP adresleri, geçerlilik süresi ve istek sınırı',
      body: `- **İzin verilen IP adresleri** — adresler veya IPv4 ağları (\`10.0.0.0/8\`). Diğer adreslerden gelen belirteç reddedilir. Boş = her yerden.
- **Geçerlilik süresi** — 30 gün, 90 gün, 1 yıl, bir tarih veya süresiz. Belirteç o günün sonunda çalışmayı durdurur. Ayarlarda en uzun süre tanımlanmışsa “süresiz” kullanılamaz.
- **İstek sınırı** — bu belirteç için dakika başına istek. Boş = portal varsayılanı (120). Sınır aşıldığında entegrasyona beklemesi ve ne kadar bekleyeceği söylenir.`,
    },
    {
      title: 'Genel bakış ve istek günlüğü',
      body: `**Genel bakış** sekmesi etkin belirteçleri, 24 saatlik istekleri ve hataları, gecikmeyi, bir trafik grafiğini, en yoğun uç noktaları ve belirteçleri ve ayrıca **Dikkat gerektirenler**i gösterir: 7 gün içinde süresi dolan belirteçler, 30 gündür kullanılmayan belirteçler ve teslim edemeyen web kancaları.

**İstek günlüğü** sekmesi her belirteç çağrısını listeler: saat, belirteç, sahip, yöntem, yol, alan, sonuç, hata kodu, süre ve IP. Filtreler: belirteç, sonuç (başarılı / hatalar), yöntem, alan, yolun bir kısmı. Kayıtlar ayarlarda belirlenen gün sayısı kadar saklanır (varsayılan 30).

Kişiler kendi belirteçlerinin günlüğünü kişisel alanlarındaki API belirteçleri sayfasında görür.`,
      note: 'Günlükteki yaygın hatalar: `SCOPE_DENIED` — belirtecin alan düzeyi yetersiz veya bir kural engelliyor; `FORBIDDEN` — sahibin izni yok; `TOKEN_EXPIRED` — süresi dolmuş; `IP_NOT_ALLOWED` — yanlış kaynak adresi.',
    },
    {
      title: 'Web kancaları',
      body: `**Web kancası**, harici bir sistemde bir şey olduğunda portalın çağırdığı bir adrestir. **Web kancaları** sekmesinde ayarlanır:

- **Ad** ve **URL** — JSON içeren POST istekleri alır.
- **Olaylar** — tek tek veya bütün bir grup: görevler (oluşturuldu, güncellendi, tamamlandı, silindi, yorum, sonuç, son tarih yaklaşıyor, gecikti), sohbet mesajı, takvim etkinlikleri, kullanıcılar (oluşturuldu, güncellendi, silindi).
- **Kimin gözünden** — web kancasının portalı gözünden gördüğü kişi: yalnızca bu kişinin görebileceği şeylerle ilgili olaylar gönderilir.
- **Yalnızca seçilen kaynaklar** — belirteçlerle aynı proje ve takvim sınırları.

Araçlar: **Test gönder** alıcının yanıtını hemen gösterir; her teslim yükünü, yanıtını ve denemelerini gösterir; **Yeniden gönder** bir teslimi tekrarlar.

Başarısızlıkta portal 1 dk, 5 dk, 30 dk, 2 sa ve 6 sa sonra yeniden dener. Art arda 20 başarısız teslimden sonra web kancası kendini kapatır — bunu “Dikkat gerektirenler” altında görürsünüz.`,
      example: {
        title: 'İK sistemiyle senkronizasyon',
        body: 'Personel listesinin sahibi İK sistemidir ve kişileri portalda oluşturması gerekir. Kullanıcıları yönetme izni olan bir “İK” hesabı adına belirteç, şablon **İK rehberi senkronizasyonu** — oluşturma ve güncelleme izinli, silme reddedilir. İK sisteminin portaldaki elle yapılan düzenlemelerden haberdar olması için “Kimin gözünden” aynı “İK” hesabına ayarlanmış bir “Kullanıcı oluşturuldu / güncellendi” web kancası ekleyin.',
      },
      note: 'Bir olay iki kez gelebilir (zaman aşımından sonraki yeniden deneme). Alıcı işlenmiş olayları `id` değerlerinden tanımalıdır.',
    },
    {
      title: 'Web kancası imzaları ve özel ağlar',
      body: `Bir web kancası oluşturulduğunda portal **imzalama gizli anahtarını** (\`whsec_…\`) bir kez gösterir. Her çağrı, gövdeyi bu gizli anahtarla imzalayan bir \`X-Portal-Signature\` üst bilgisi taşır. Alıcı imzayı kontrol eder ve portaldan gelmeyen her şeyi atar. Node.js, Python ve PHP için hazır doğrulama kodu geliştirici portalındadır.

**Yeni gizli anahtar** farklı bir anahtar verir — alıcıda hemen güncelleyin.

Varsayılan olarak, iç hizmetleri korumak için özel ağ adreslerine (10.x, 172.16–31.x, 192.168.x, localhost) giden web kancaları reddedilir. Alıcı ağınızın içindeyse API ayarlarında **Özel ağ adresleri**ni açın.`,
    },
    {
      title: 'Geliştirici portalı ve OpenAPI',
      body: `Geliştiricilere [/developers](/developers) bağlantısını verin. Orada şunlar bulunur:

- **Kılavuz** — hızlı başlangıç, kimlik doğrulama, erişim ve şablonlar, hatalar, sınırlar, web kancaları ve imza kontrolleri;
- **API başvurusu** — cURL, JavaScript, Python ve PHP’de parametreler ve örneklerle her uç nokta, ⌘K / Ctrl+K ile arama;
- **Deneyin** — yapıştırılmış bir belirteçle veya kendi oturumunuzla tarayıcıdan canlı bir çağrı;
- **OpenAPI** — Postman’e, Insomnia’ya veya bir kod oluşturucuya aktarmak için bir açıklama dosyası.

Başvuru kaynağı çalışan portaldan oluşturulur, bu yüzden yeni modüllerin uç noktaları kendiliğinden görünür. Varsayılan olarak yalnızca oturum açmış kişiler okuyabilir; **Herkese açık belgeler** onu bağlantıya sahip herkese açar.`,
      note: '“Deneyin” konsolu verileri gerçekten değiştirir. Yapıştırılan bir belirteç yalnızca o tarayıcı sekmesinde tutulur.',
    },
    {
      title: 'Güvenlik ve API ayarları',
      body: `**Ayarlar** sekmesi:

- **API açık** — kapatın, her belirteç isteği reddedilir; portalın kendisi çalışmaya devam eder. Sızıntılar için bir acil durum anahtarı.
- **Kişisel belirteçler** — “Kişisel API belirteçleri” iznine sahip kişilerin kendi belirteçlerini oluşturmasına izin verir.
- **En uzun belirteç süresi** — gün olarak, 0 = sınır yok.
- **Varsayılan istek sınırı** — kendi sınırı olmayan belirteçler için dakika başına istek (120).
- **İstek günlüğünü sakla** — gün (30).
- **Herkese açık belgeler**, **Web kancaları**, **Özel ağ adresleri**.

İyi uygulamalar:

- belirteçleri web sitesi kodunda veya bir depoda değil, ortam değişkenlerinde veya bir gizli bilgi deposunda tutun;
- en dar şablonu verin, kaynaklara, IP’ye ve geçerlilik süresine göre sınırlayın;
- bir sızıntıdan şüphelenirseniz belirteci hemen **iptal edin** veya **Yeni gizli anahtar** verin — saniyeler içinde etkili olur.`,
      note: '“Kişisel API belirteçleri” ve “API yönetimi” izinleri süper yönetici dışında hiçbir yerleşik rolde yoktur. Bunları [Roller](/admin/roles) bölümündeki bir rol aracılığıyla verin.',
    },
  ],
  faq: [
    {
      q: 'Belirtecimi kaybettim. Yeniden görebilir miyim?',
      a: 'Hayır, portal yalnızca bir parmak izi tutar. Aynı ayarlarla yeni bir belirteç almak için “Yeni gizli anahtar”a basın; eskisi hemen çalışmayı durdurur.',
    },
    {
      q: 'Entegrasyon SCOPE_DENIED alıyor. Neyi kontrol etmeliyim?',
      a: 'Belirteci açın ve yöntemi ve yolu “Bir isteği kontrol et” alanına girin: hangi alan düzeyinin gerektiğini veya hangi kuralın engellediğini gösterir. FORBIDDEN, belirteç sahibinin izninin olmadığı anlamına gelir.',
    },
    {
      q: 'Belirteci oluşturan çalışan ayrıldı. Entegrasyon bozulur mu?',
      a: 'Evet: hesap devre dışı bırakıldığında belirteçleri OWNER_INACTIVE yanıtını verir. Bu yüzden entegrasyonlar teknik hesapları ve onlar adına verilen belirteçleri kullanmalıdır.',
    },
    {
      q: 'Web kancası neden bazı olayları almıyor?',
      a: 'Web kancası yalnızca “Kimin gözünden” kişisinin görebildiklerini ve yalnızca seçilen kaynaklar için alır. Özel bir projeyle ilgili olaylar gelmiyorsa o kişiyi projeye ekleyin veya başka birini seçin.',
    },
    {
      q: 'Web kancası kendini kapattı. Neden?',
      a: 'Art arda 20 başarısız teslimden sonra web kancası kapanır. Teslim listesinde alıcının yanıtlarını kontrol edin, nedeni düzeltin, web kancasını yeniden açın ve “Test gönder”e basın.',
    },
    {
      q: 'İç sunucuya giden bir web kancası reddediliyor',
      a: 'Özel ağ adresleri varsayılan olarak reddedilir. API Ayarlar sekmesinde “Özel ağ adresleri”ni açın.',
    },
    {
      q: 'Tüm entegrasyonları bir kerede nasıl durdururum?',
      a: 'API ayarlarında “API açık”ı kapatın: her belirteç isteği reddedilir, kişiler ise portalı her zamanki gibi kullanmaya devam eder.',
    },
  ],
  fields: {
    owner: {
      title: 'Adına çalıştığı kişi',
      text: 'Belirteç bu kişinin izinlerini alır, asla fazlasını değil. Entegrasyonlar için bir çalışanı değil, özel bir teknik hesabı seçin.',
    },
    template: {
      title: 'Erişim şablonu',
      text: 'Hazır bir düzeyler ve kurallar seti. Belirteç yalnızca farklarını saklar, bu yüzden şablonu değiştirmek ona dayanan her belirteci değiştirir.',
    },
    scopes: {
      title: 'Alanlar',
      text: '“Okuma” yalnızca veri getirir, “Okuma ve yazma” ayrıca oluşturur, değiştirir ve siler. Sahibin kendi izinleri yine de geçerlidir.',
    },
    resources: {
      title: 'Yalnızca seçilen kaynaklar',
      text: 'Belirteci belirli görev projeleri, takvimler veya paylaşılan dosya alanlarıyla sınırlayın — başka hiçbir şeyi görmez.',
    },
    rules: {
      title: 'Hassas kurallar',
      text: 'Reddet her zaman İzin ver’i yener. `*` bir yol parçası, `**` geri kalanıdır; yollar `/api/v1`’e görelidir, örneğin `DELETE /app/**`.',
    },
    ipAllow: {
      title: 'İzin verilen IP adresleri',
      text: 'Entegrasyon sunucusunun adresini veya `10.0.0.0/8` gibi bir ağı girin. Çalınan bir belirteç bile başka bir yerden çalışmaz.',
    },
    expiry: {
      title: 'Geçerlilik süresi',
      text: 'Belirteç seçilen günün sonunda çalışmayı durdurur. Yenileme hatırlatmalı bir yıl çoğu entegrasyona uygundur.',
    },
    rateLimit: {
      title: 'İstek sınırı',
      text: 'Bu belirteç için dakika başına istek. Boş = API ayarlarındaki portal varsayılanı.',
    },
    runAs: {
      title: 'Kimin gözünden',
      text: 'Web kancası yalnızca bu kişinin görebildikleriyle ilgili olayları alır: projelerinin görevleri, sohbetleri ve takvimleri.',
    },
    privateNetwork: {
      title: 'Özel ağ adresleri',
      text: '10.x, 172.16–31.x, 192.168.x ve localhost adreslerine web kancalarına izin verir. Yalnızca alıcı gerçekten ağınızın içindeyse açın.',
    },
    personalTokens: {
      title: 'Kişisel belirteçler',
      text: '“Kişisel API belirteçleri” iznine sahip kişiler kendi belirteçlerini kişisel alanlarında oluşturur. Belirteçleri yalnızca yöneticilerin vermesi için kapatın.',
    },
  },
};
