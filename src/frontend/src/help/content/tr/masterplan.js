export default {
  title: 'Master plan',
  tagline: 'Projenin canlı vaziyet planı: ne müsait, ne rezerve, ne satıldı ve inşaat nasıl gidiyor.',
  summary: 'Master plan bir konut projesini vaziyet planında, daire tablosunda ve kayıt listesinde gösterir. Satış temsilcileri bağımsız bölümleri ön rezervasyona ve rezervasyona alır, finans ve hukuk bunları satışa ve teslime taşır, şantiye şefleri telefonlarından fotoğraflı inşaat raporları gönderir. Herkes aynı tabloyu görür ve çift rezervasyon imkânsızdır.',
  highlights: [
    {
      title: 'Katmanlı vaziyet planı',
      text: 'Satış renkleri, inşaat hazırlık düzeyi veya nesne türleri — planın üstünde tek bir anahtar.',
    },
    {
      title: 'Çift rezervasyon yok',
      text: 'Bir iş arkadaşınız sizden önce davrandıysa “Bölüm az önce şu kişi tarafından ön rezerve edildi: X” uyarısını görürsünüz.',
    },
    {
      title: 'Süreli rezervasyonlar',
      text: '24 ve 2 saat önce hatırlatma; süre dolduğunda bağımsız bölüm kendiliğinden serbest kalır.',
    },
    {
      title: 'Daire tablosu',
      text: 'Fiyat, m² fiyatı veya alanla katlar × daireler ve toplu fiyat değişiklikleri.',
    },
    {
      title: 'Fotoğraflı inşaat raporları',
      text: 'Şantiye şefi raporu telefondan üç dokunuşla gönderir; hazırlık düzeyi hesaplanır.',
    },
    {
      title: 'CRM ile bağlantılı',
      text: 'Rezervasyon bir fırsata bağlanır; fırsat bağımsız bölümü ve inşaatını gösterir.',
    },
  ],
  tips: [
    'Yalnızca o durumdaki bağımsız bölümleri bırakmak için açıklamadaki bir duruma tıklayın.',
    'Sunum düğmesi müşterileri, satış temsilcilerini ve minimum fiyatları gizler — müşteriye göstermek güvenlidir.',
    'Bir CRM fırsatında “Bir bölüm seçin”e basın: vaziyet planında fırsat rezervasyon için zaten seçilmiş olur.',
    'Şantiye şefleri: portalı telefonun ana ekranına ekleyin — “+ Rapor” → Kamera → Gönder.',
    'Sınırlar çizilmemişse plan nesneleri şema olarak gösterir — ilk günden çalışabilirsiniz.',
    'Önceki plandaki eski numarayla arayın: “14”, 14 numaralı evi ve eskiden №14 olan evi bulur.',
  ],
  sections: [
    {
      title: 'Vaziyet planı',
      body: `Arka planın üzerinde etapların, sektörlerin, parsellerin ve binaların sınırları bulunur. Fare tekerleği veya iki parmakla sıkıştırma yakınlaştırır, sürüklemek planı kaydırır, ⤢ tüm projeyi gösterir.

Kodunu, türünü, alanını, fiyatını, durumunu ve hazırlık düzeyini görmek için bir nesnenin üzerine gelin. Bir sektöre tıklamak onu yakınlaştırır ve özetini açar; bir parsele veya eve tıklamak kartı plandan ayrılmadan sağda açar.

- **Satış** — satış durumuna göre renk;
- **İnşaat** — hazırlık düzeyine göre griden yeşile;
- **Türler** — konut, ticari, altyapı.

İş arkadaşlarınız rezervasyon ve satış yaptıkça renkler kendiliğinden değişir.`,
    },
    {
      title: 'Numaralar, arama ve sektörler',
      body: `Numara, sınırına sığdığında gösterilir: yakınlaştırdıkça yazı tipi 9’dan 14 px’e büyür. Sığmazsa durum renginde bir rozete dönüşür; rozetler üst üste geldiğinde alttaki gizlenir. Planın üstündeki **Numaralar: otomatik / her zaman / gizle** anahtarı sizin için hatırlanır; Sunum “her zaman” ile başlar.

Aramaya bir numara, bir ad (“Апарт-корпус 40”) veya önceki plandaki **eski numarayı** (“14”, “blok 3”) yazın — bir satır seçin veya Enter’a basın: plan nesneye yakınlaşır ve kartını açar. Eski numara ipucunda (“Eski: 14”) ve kartta bulunur; yanındaki ✎ ile düzeltin.

Sektör sınırları birleştikleri yerde üst üste gelebilir: tıklama en üstteki en küçük nesneye düşer, bir sektöre tıklamak onu yakınlaştırır. Sınır düzenleyicide **İçteki nesnelerin çevresine** bir sektörü evlerinin çevresine çizer.`,
    },
    {
      title: 'Sınırlar yerine noktalar',
      body: `Bir nesne planda çizilmiş bir sınır yerine bir **nokta** — numaralı bir daire — olarak durabilir. Renk sınırlarla aynıdır: Satış’ta durum, İnşaat’ta hazırlık düzeyi, Türler’de tür. Bir apartman, **bağımsız bölümlerinin durumlarını gösteren bir halka** (yeşil kısım müsait olanlardır) ve “müsait / toplam” çipi alır; İnşaat’ta — bir hazırlık yayı. İpucu için üzerine gelin; aynı kartı açmak için tıklayın veya dokunun.

Noktalar hiçbir zaman gizlenmez: komşular birbirine sıkıştığında ikisi de küçülür, çok küçük olanlar numarasız düzgün noktalara dönüşür — yakınlaştırın, numaralar görünür. “Numaralar: her zaman” tüm numaraları tutar, “gizle” yalnızca noktaları gösterir.

**Nasıl yerleştirilir** (yöneticiler): *Yapı → Vaziyet planları → Noktalar*. Solda henüz planda olmayan nesneler ve “N nesneden X tanesi yerleştirildi” sayacı bulunur. Bir nesne seçin (veya aramada ↑ ↓ ve Enter) ve planda durduğu yere tıklayın. **Art arda yerleştir** açıkken bir sonraki hemen seçilir — evden eve tıklayın. Yerleştirilmiş bir noktayı sürüklemek için ona tıklayın (**Hizala** ile komşularının hizasına oturur), tutamakla veya S / M / L ile boyutlandırın, bir etiket belirleyin, onu **sınıra dönüştürün** veya kaldırın. Bir sınır **Nokta yap** ile noktaya dönüşür. Bir planda bir nesnenin ya sınırı ya noktası olur. **Geri al** (Ctrl+Z) son işlemi geri alır.`,
    },
    {
      title: 'Ev veya bina kartı',
      body: `Müstakil ev ve apartman aynı kartı paylaşır. Üstte — numara, tür, sektör, eski numara ve durum (bina, durum çubuğuyla “N bölümden X tanesi müsait” gösterir), fiyat veya müsait bölümlerin “en düşük – en yüksek” aralığı ve m² fiyatı, ödeme seçenekleri.

Binada ayrıca oda sayısına göre **Dağılım** (alan, müsait / toplam, başlangıç fiyatı) ve o satırdaki ilk müsait bölümü ön rezervasyona alan **Ön rezervasyon** düğmesi; oda sayısı ve kat seçicisi ve “Daire tablosunda aç” ile bir **mini daire tablosu** (durum renklerinde katlar × bölümler) bulunur. Bir bölüm, satış düğmeleri ve “← bina” ile kendi kartını açar. Yönetim tek bir düğmeyle **binanın tüm satışlarını kapatabilir**.

Bir **seriye** (bir ev projesi, bir daire tipi) yüklenen planlar ve görseller o serinin her kartında görünür.`,
      note: '23 numaralı binadaki boş bir 3 odalı daire, plandan ayrılmadan iki tıklamayla ön rezervasyona alınır: “3 odalı” satırında “Ön rezervasyon” → “Onayla”.',
    },
    {
      title: 'Durumlar ve bunları kim değiştirir',
      body: `1. **Müsait → Ön rezervasyonda** — bir satış temsilcisi (aynı anda yapılabilecek ön rezervasyon sayısı sınırlıdır).
2. **Ön rezervasyonda → Rezervasyonda** — ön rezervasyonu yapan satış temsilcisi, müşterisi olan bir CRM fırsatıyla.
3. **Rezervasyonda → Kaparo** — finans.
4. **Kaparo → Sözleşme** — hukuk veya satış müdürü, sözleşme numarası ve tarihiyle.
5. **Sözleşme → Satıldı** — finans (tamamı ödendi).
6. **Satıldı → Teslim edildi** — inşaat müdürü veya hukuk, tutanak tarihiyle.

Bir ön rezervasyonu veya rezervasyonu onu yapan satış temsilcisi (bir nedenle) veya satış müdürü kaldırır. Satış temsilcisi bir kez uzatabilir, sonrası satış müdürüne aittir. Satışı kapatmak yönetimin işidir. Geri almak satış müdürü ve yönetim içindir, her zaman bir nedenle.`,
      note: 'İki kişi aynı anda aynı bölümü rezerve ederse yalnızca biri alır — diğeri kimin önce davrandığını görür.',
    },
    {
      title: 'Durum aktarma',
      body: `Portaldan önce veya portal dışında yapılmış rezervasyonlar ve satışlar için. Bir Master plan yöneticisi kartta **Durumu aktar…** düğmesine basar ve herhangi bir durumu ayarlar — durum zinciri, CRM fırsatı veya süre olmadan. Durum tarihini, müşteriyi, satış temsilcisini, sözleşme numarasını, tarihini ve tutarını ve her zaman bir nedeni girin.

Bitiş tarihi olmayan bir rezervasyonun süresi hiç dolmaz. “Ön rezervasyon / rezervasyon bitişi” ile olağan süreyi alır.

Aynı anda birkaç bölüm — kayıt listesinde: satırları seçin ve **Durumu aktar…** düğmesine basın. Excel’den — “Durum” (ön rezervasyon … teslim), “Müşteri”, “Satış temsilcisi”, “Durum tarihi”, “Sözleşme numarası”, “Sözleşme tarihi”, “Sözleşme tutarı”, “Rezervasyon bitişi” sütunları; nedeni içe aktarma penceresine yazın.

Geçmiş, böyle bir değişikliği **Aktarma** olarak işaretler: kim, ne zaman, hangi durumdan hangisine, hangi tarihle.`,
      note: 'Durumları yalnızca Master plan yöneticileri aktarır; diğer herkes olağan zinciri kullanır.',
    },
    {
      title: 'Ödeme şekline göre fiyatlar',
      body: `Bağımsız bölüm fiyatı %100 ödeme fiyatıdır. **Yapı → Fiyatlar** sekmesinde bir yönetici tabloyu belirler: ödeme planları (örneğin %100, 12 ay boyunca 2 200 $/m²’den %50 peşinatlı taksit, 24 ay boyunca 2 500 $/m²’den %30 peşinatlı taksit) ve tamamlanmadaki planlanan m² fiyatı. Tablo seçilen bir tarihten itibaren geçerlidir; yeni bir sürüm eskileri hiçbir zaman değiştirmez — onlar fiyat geçmişi olarak kalır. Bir nesne türünün kendi tablosu olabilir.

Kart ve Sunum modu her planı gösterir: toplam, m² fiyatı, ilk ödeme ve aylık ödeme ve tamamlanmadaki planlanan fiyat.`,
    },
    {
      title: 'Daire tablosu',
      body: `Sütunlar bloklar ve dikey daire hatlarıdır, satırlar katlardır (en üst kat önce). Bir hücre numarayı, oda sayısını, alanı ve fiyatı gösterir; bir anahtar fiyatı, m² fiyatını veya alanı gösterir.

**Seç** seçimi açar: birkaç daire seçin ve fiyatlarını bir yüzde veya tutarla değiştirin, satışlarını kapatın veya açın.`,
    },
    {
      title: 'Kayıt, dışa ve içe aktarma',
      body: `Tüm bağımsız bölümlerin tablosu: sütunlar ayarlanabilir, başlığa göre sıralama, planla aynı filtreler. Fiyatları değiştirmek veya satışları kapatmak için satırları seçin.

**Dışa aktar** — Excel veya CSV, yalnızca görebildiğiniz sütunlarla.

**İçe aktar** (yöneticiler): şablonu indirin, doldurun, yükleyin. Her satır kontrol edilir ve hatalar listelenir; dosya temizlenene kadar hiçbir şey yazılmaz.`,
    },
    {
      title: 'Rezervasyonlar',
      body: 'Kalan süreleriyle etkin ön rezervasyonlar ve rezervasyonlar. Bugün ve yarın bitenler en üsttedir. Buradan uzatın veya serbest bırakmak ya da kaparoya geçirmek için kartı açın.',
    },
    {
      title: 'İnşaat ve fotoğraflı raporlar',
      body: `Aşaması, hazırlık düzeyi, takvimi ve son rapor tarihiyle nesneler. Filtreler: “14 günden uzun süredir rapor yok”, “geride”, “benim”.

**+ Rapor**: nesneler (bütün bir sıra da olabilir), aşama, yüzde, kameradan fotoğraflar ve bir yorum. Fotoğraflar telefonda küçültülür ve zayıf bağlantıda kaldığı yerden yüklenmeye devam eder.

Denetim açıkken bir şantiye şefinin raporunu önce inşaat müdürü inceler (İnceleme sekmesi). Yayımlanan bir rapor aşamayı ilerletir, hazırlık düzeyini yeniden hesaplar ve orada bölüm tutan satış temsilcilerine bildirim gönderir.

Günlük, tarihe göre bir akıştır: yazar, durum, “önce → sonra” aşama ilerlemesi, fotoğraflar. Tam ekran görüntüleyici için bir fotoğrafa dokunun (kaydırma, yakınlaştırma, çekim tarihi ve yeri, indirme).

**Bir raporu düzenleme veya silme** (karttaki “⋯” menüsü): yazar, rapor taslakken, incelemedeyken veya geri gönderildiğinde ve yayımlandıktan sonraki 24 saat boyunca; inşaat müdürü ve yöneticiler her zaman. Denetim açıkken yayımlanmış bir rapordaki yeni bir yüzde, tarih veya eklenen fotoğraflar raporu yeniden incelemeye gönderir (metni düzeltmek veya bir fotoğrafı kaldırmak göndermez). Tek bir fotoğraf görüntüleyiciden silinir (çöp kutusu simgesi). Yayımlanmış bir raporu silmek aşama ilerlemesini önceki değere geri alır ve hazırlık düzeyini yeniden hesaplar.`,
      steps: [
        '**+ Rapor**’a basın (telefonda — alttaki yuvarlak düğme).',
        '**Kamera**’ya basın ve fotoğraf çekin.',
        'Aşamayı ve yüzdeyi seçin, **Gönder**’e basın.',
      ],
      note: 'Şantiye şefi yalnızca kendi bölgesindeki nesneleri görür ve seçer.',
    },
    {
      title: 'Pano',
      body: 'Satılan, rezerve edilen ve müsait olanlar — adet, m² ve para olarak (ayarlardaki kurlarla temel para biriminde); aylara ve satış temsilcilerine göre satışlar; zaman içinde m² fiyatı (ortalama liste fiyatı, fiyat tablosu planları, tamamlanmadaki planlanan fiyat); etaplara ve sektörlere göre hazırlık düzeyi; güncel raporu olmayan nesneler ve “satıldı ama inşa edilmedi”.',
    },
    {
      title: 'Yapı, vaziyet planı ve ekip',
      body: `Bir yönetici ağacı oluşturur: etap → sektör → sıra → parsel → bina → bağımsız bölüm (seviyeler atlanabilir, en fazla 8). **Toplu**, “A-1-01…A-1-15” şeklinde bir sıra veya bir bloğun dairelerini “katlar × kat başına” oluşturur. Düğümleri taşımak için sürükleyin; aynı anda birkaçını taşımak için (örneğin 10 evi başka bir sektöre) **Birkaç tane seç**’e basın, düğümleri işaretleyin ve **Taşı…**’ya basın.

**Vaziyet planları** sekmesinde bir arka plan (resim veya SVG) yükleyin, bir nesne seçin ve sınır noktaları koymak için arka plana tıklayın; kapatın ve kaydedin.

**Ekip** sekmesinde roller verin: tüm proje üzerinde veya yalnızca bir sektör, sıra veya bina içinde. Bir rol geçici olabilir.`,
    },
  ],
  faq: [
    {
      q: 'Minimum fiyatı ve müşterileri neden göremiyorum?',
      a: 'Bunları satış müdürleri ve yönetim görür; bir satış temsilcisi yalnızca kendi rezervasyonlarının müşterilerini görür. Bu yalnızca arayüzde değil, sunucuda gizlenir.',
    },
    {
      q: 'Bir rezervasyonun süresi dolduğunda ne olur?',
      a: 'Bağımsız bölüm kendiliğinden müsait olur, satış temsilcisine ve satış müdürüne bildirim gider, CRM fırsatına bir satır eklenir.',
    },
    {
      q: 'Komşu sektör için neden rapor veremiyorum?',
      a: 'Şantiye şefi yalnızca kendi sorumluluk bölgesinde veri girer; bunu bir yönetici Ekip sekmesinde belirler.',
    },
    {
      q: 'Bir fırsat aşaması bağımsız bölümün durumunu nasıl değiştirir?',
      a: 'Bir yönetici modül ayarlarında “aşama → durum” eşlemesi yapar. Bir fırsat böyle bir aşamaya geçtiğinde bağımsız bölümlerinin durumu aynı kurallar ve izinlerle değişir.',
    },
  ],
};
