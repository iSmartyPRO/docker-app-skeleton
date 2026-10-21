export default {
  title: 'QR kodları',
  tagline: 'Web sitesi, kartvizit, Wi-Fi ve daha fazlası için kurumsal QR kodları — logonuz, şirket renkleri ve tarama kontrolüyle.',
  summary: 'Kodun ne yapacağını seçin, bir şirket şablonu belirleyin ve isterseniz şekilleri, renkleri, logoyu ve çerçeveyi ayarlayın. Her değişiklik önizlemede hemen görünür ve taranabilirlik açısından kontrol edilir. Hazır kodu 4096 px’e kadar PNG veya baskı için vektör SVG olarak indirin.',
  highlights: [
    {
      title: '11 kod türü',
      text: 'Web sitesi, kartvizit, Wi-Fi, metin, e-posta, telefon, SMS, WhatsApp, Telegram, haritada bir konum ve etkinlik.',
    },
    {
      title: 'Şirket şablonları',
      text: 'Kendi içeriğinizle gösterilen hazır görünümler; bazıları kurumsal renkleri ve logoyu kilitler.',
    },
    {
      title: 'Tarama kontrolü',
      text: 'Yerleşik bir okuyucu her değişikliği okur ve kodun zor tarandığını size bildirir.',
    },
    {
      title: 'Baskı kalitesi',
      text: 'PNG 512–4096 px, matbaa için vektör SVG veya panoya kopyalanan bir resim.',
    },
    {
      title: 'Dinamik kodlar',
      text: 'Kısa portal bağlantılı web sitesi kodu: baskıdan sonra adresi değiştirin ve taramaları sayın.',
    },
    {
      title: 'Kodlarım',
      text: 'Arama ve filtreli kişisel kitaplık; kodlarınızı yalnızca siz görürsünüz.',
    },
  ],
  tips: [
    'Kitaplığın üstündeki tür düğmeleriyle başlayın — stüdyo doğru alanlarla açılır.',
    'Önizlemedeki «Güvenle taranır» rozeti ana rehberinizdir; «Zor taranır» olursa altındaki ipucunu okuyun.',
    'Matbaa için SVG indirin: her boyutta keskin kalır.',
    '3–4 modüllük boş kenar bırakın ve açık arka planda koyu noktalar kullanın.',
    'Toplu baskıdan önce deneme baskısını telefonla tarayın.',
    'Yeniden basamayacağınız bir broşür için kodu dinamik yapın — adresi sonra değiştirebilirsiniz.',
  ],
  sections: [
    {
      title: 'Kod türleri',
      body: `Tür, biri kameraya kodu gösterdiğinde ne olacağını belirler:

- **Web sitesi** — bir bağlantı açar.
- **Kartvizit** — kişiyi kaydetmeyi önerir (vCard 3.0): ad ve soyad, şirket, pozisyon, cep ve iş telefonu, e-posta, web sitesi, adres, not.
- **Wi-Fi** — ağa bağlanır: ağ adı (SSID), WPA, WEP veya parolasız, parola, «Gizli ağ».
- **Metin** — 1.500 karaktere kadar bir mesaj gösterir.
- **E-posta** — e-posta hazırlar: alıcı, konu ve ileti.
- **Telefon** — numarayı arar.
- **SMS** — bir numaraya mesaj hazırlar.
- **WhatsApp** — wa.me bağlantısıyla sohbet açar, isterseniz önceden doldurulmuş bir mesajla.
- **Telegram** — bir profil, bot veya kanal açar (t.me/ad).
- **Konum** — haritada bir nokta gösterir. Google, Yandex, 2GIS veya OpenStreetMap bağlantısı ya da koordinat yapıştırın; bir yer adı ekleyin.
- **Etkinlik** — takvime bir toplantı ekler (iCalendar): ad, tüm gün veya saat, başlangıç ve bitiş, yer, açıklama.`,
      note: 'Telefon numaralarını ülke koduyla yazın, ör. +996 555 123 456 — aksi halde kod başka ülkelerden kişilerde çalışmayabilir.',
    },
    {
      title: 'Kod oluşturma',
      body: `**«QR kodu oluştur»** stüdyoyu açar (\`/app/qr/new\`). Solda üç adım, sağda canlı önizleme.

1. **Kod ne yapar** — tür ve alanları. Önizleme siz yazdıkça güncellenir.
2. **Şablon** — şirketin görünümleri, her biri sizin içeriğinizle çizilir. **«Kendi tasarımım»** şablonsuz başlar (yöneticiniz yalnızca şablonlara izin vermiyorsa).
3. **Tasarım** — Şekil, Renkler, Logo ve Çerçeve sekmelerinde ince ayar.

Koda bir ad verin ve **«Kodlarıma kaydet»**e basın. Kaydedilen kod \`/app/qr/<numara>\` adresinde açılır; düzenlemelerden sonra **«Değişiklikleri kaydet»**e basın.`,
      steps: [
        '**«QR kodu oluştur»**a veya kitaplığın üstünde ihtiyacınız olan türün düğmesine basın.',
        'Alanları doldurun — kod önizlemede görünür.',
        'Bir şablon veya «Kendi tasarımım»ı seçin.',
        'Gerekirse şekli, renkleri, logoyu ve çerçeveyi ayarlayın.',
        '«Güvenle taranır» rozetini kontrol edin, ardından kodu indirin veya kaydedin.',
      ],
      example: {
        title: 'Bir satış temsilcisinin kartviziti',
        body: 'Ayşe **«Kartvizit»**i seçer, adını, pozisyonunu, cep telefonunu ve e-postasını girer, **«Kurumsal»** şablonunu alır ve matbaa için SVG indirir. Müşteri kamerayı tutar — telefon kişiyi kaydetmeyi önerir.',
      },
      note: 'Bazı seçenekler şablon tarafından sabitlenmiş olabilir («Şablon tarafından sabitlendi») — şirket kodları markaya böyle uygun tutar.',
    },
    {
      title: 'Şekil',
      body: `**Şekil** sekmesi:

- **Noktalar** — yuvarlatılmış, akışkan, kare, daireler, zarif, baklava.
- **Köşe çerçeveleri** — yuvarlatılmış, kare, daire, yaprak, yumuşak; **köşe merkezleri** ayrı.
- **Boş kenar** — 0–8 modüllük boş kenar; en iyi 3–4 okunur.
- **Hata düzeltme** — Otomatik, L, M, Q veya H: kodun ne kadarının hasar görebileceği veya örtülebileceği. Ortada logo varsa Otomatik H seçer.`,
      note: 'Daha yüksek düzeltme kodu daha yoğun yapar. Önizleme içeriğin çok fazla olduğunu söylerse metni kısaltın veya düzeltmeyi düşürün.',
    },
    {
      title: 'Renkler',
      body: `**Renkler** sekmesi:

- **Renk takımları** — tek tıkla uyumlu paletler.
- **Noktaların dolgusu** — düz, doğrusal veya dairesel gradyan (açıyla).
- **Köşe çerçevesi ve merkezi renkleri** — «Noktalar gibi» veya kendi renginiz.
- **Arka plan** — herhangi bir renk veya saydam; arka planın **köşe yuvarlaması**.

**«Kurumsal renk»** düğmesi portal temasının ana rengini alır. Böyle bir kod, portal teması değiştiğinde rengini kendiliğinden değiştirir.`,
      note: 'Noktalar arka plandan belirgin şekilde koyu olmalıdır. Koyu arka planda açık noktaları (ters renk) bazı eski tarayıcılar okuyamaz — önizleme sizi uyarır.',
    },
    {
      title: 'Logo',
      body: `**Logo** sekmesi kodun ortasına bir resim koyar:

- **Yok**;
- **Şirket logosu** — Ayarlar → Görünüm’den, ve **«Koyu için logo»** — koyu varyantı;
- **Yükle** — 1 MB’a kadar kendi PNG, SVG, WebP veya JPEG dosyanız (yöneticiniz izin veriyorsa);
- **Simge** — simge kitaplığından.

**Boyut** — kod genişliğinin %10–30’u, %22’ye kadar güvenlidir. Logonun altındaki **zemin** — yok, kare, yuvarlatılmış veya daire; kendi rengi ve boşluğuyla.`,
      note: 'Logo kodun bir kısmını örter. Logo büyükse önizleme onu küçültmenizi veya düzeltmeyi H yapmanızı önerir.',
    },
    {
      title: 'Çerçeve ve başlık',
      body: `**Çerçeve** sekmesi: yok, başlık, kart, bilet veya rozet. Başlık metnini, çerçeve rengini ve metin rengini belirleyin.

Başlığı boş bırakırsanız, bakan kişinin dilinde «Beni tarayın» yazar.`,
    },
    {
      title: 'Önizleme, kontrol ve indirme',
      body: `Sağda canlı bir önizleme vardır. Her değişiklik hemen yeniden çizilir ve yerleşik bir okuyucuyla kontrol edilir:

- **«Güvenle taranır»** — kod okunuyor;
- **«Zor taranır»** — kamera okuyamayabilir; altındaki ipucu neyin düzeltileceğini söyler.

Önizleme ayrıca düşük kontrast, ters renkler ve çok büyük logo konusunda uyarır; kodun altında sürümü, düzeltme düzeyini ve karakter sayısını gösterir.

**İndirme:** PNG 512, 1024, 2048 veya 4096 px; **SVG** — baskı için vektör; **«Resim olarak kopyala»** — bir e-postaya veya belgeye yapıştırın.`,
    },
    {
      title: 'Dinamik kodlar',
      body: `**Web sitesi** türü için, yöneticiniz izin veriyorsa **«Dinamik kod»**u açabilirsiniz. Kod bu durumda kısa bir portal bağlantısı \`https://<portal>/q/<ad>\` taşır ve bu bağlantı sizin adresinize yönlendirir.

- **Baskıdan sonra adresi değiştirin** — basılı kodlar yenisine gider.
- **Bağlantıyı duraklatın** — ziyaretçiler «Bu QR kodu duraklatıldı» görür.
- **Taramalar sayılır**: toplam, 30 gün, son tarama ve günlük çubuklar. Bağlantı önizleme botları (mesajlaşma uygulamaları, sosyal ağlar) sayılmaz.

Kısa bağlantı kod kaydedildikten sonra görünür; kopyalayabilirsiniz.`,
      example: {
        title: 'Bir restoran menüsü',
        body: 'Masalarda menüye bağlanan dinamik bir kod var. Menü yeni bir siteye taşınıyor: sahibi koddaki adresi değiştirir, etiketlerin yeniden basılmasına gerek kalmaz.',
      },
      note: '**Dikkat.** «Dinamik kod»u kapatmak veya dinamik bir kodu silmek, basılı kopyaların bağlantıyı açmasını durdurur. Normal (statik) kod içeriğini kendisi taşır ve kitaplıktan silindikten sonra da çalışmaya devam eder.',
    },
    {
      title: 'Kodlarım',
      body: `**QR kodları** sayfası (\`/app/qr\`) kişisel kitaplığınızdır. Kodlarınızı yalnızca siz görürsünüz.

- Türe göre **hızlı başlangıç** düğmeleri stüdyoyu doğru alanlarla açar.
- Ad ve içeriğe göre **arama**, tür ve «Dinamik»e göre **filtreler**.
- Kod kartında: PNG, SVG veya PNG 4096 px indir, **«Çoğalt»**, **«Sil»**.`,
      note: 'Bir kişinin kaç kod tutabileceğini yönetici belirler (varsayılan 500).',
    },
    {
      title: 'Şablonlar (yöneticiler için)',
      body: `**Şablonlar** sayfası (\`/app/qr/templates\`) «QR şablonlarını yönet» iznini gerektirir; süper yöneticilerde bu izin vardır.

Hazır şablonlar: **Kurumsal** (varsayılan — renkleri ve logoyu kilitler), **Kurumsal kart**, **Klasik**, **Grafit**, **Okyanus**, **Gün batımı**, **Zümrüt**, **Gece ve altın**, **Ametist**.

- Galerideki sırayı sürükleyerek belirleyin.
- **Yıldız** varsayılan şablonu işaretler: ilk önerilir ve gizlenemez.
- Şablonlar **gösterilebilir veya gizlenebilir** ve **silinebilir** — bir şablonla yapılmış kodlar görünümlerini korur.
- **«Hazır olanları geri yükle»** sildiğiniz hazır şablonları geri ekler.

Şablon düzenleyicide her dilde ad ve açıklamayı ve **kilitleri** belirlersiniz: Renkler, Şekil, Logo, Çerçeve. Kilitli gruplar şablondan yapılan kodlarda değiştirilemez — sunucu bunu denetler. Örnek anahtarı (web sitesi, kartvizit, Wi-Fi) şablonu kısa ve yoğun bir kodda gösterir.`,
    },
    {
      title: 'Baskı için ipuçları',
      body: `- **Boş kenarı** koruyun — kodu sıkı kırpmayın ve hemen yanına metin koymayın.
- **Açık arka planda koyu noktalar** en iyi okunur.
- **Asgari baskı boyutu** — kısa bağlantılar için yaklaşık 2 × 2 cm; yoğun kartvizitleri daha büyük basın.
- Matbaa için **SVG**, ekranlar ve belgeler için PNG 1024–2048 px kullanın.
- Toplu baskıdan önce deneme baskısını **telefonla test edin**.`,
    },
  ],
  faq: [
    {
      q: 'Kod «Zor taranır» diyor. Ne yapmalıyım?',
      a: 'Noktaları koyulaştırın veya arka planı açın, logoyu küçültün, boş kenarı genişletin ya da H düzeltmesini seçin. Rozet hemen güncellenir.',
    },
    {
      q: 'Kitaplıktan bir kodu sildim. Basılı kopyalar çalışmayı durdurur mu?',
      a: 'Normal (statik) kod — hayır, içeriğini kendisi taşır. Dinamik kod — evet: kısa bağlantı artık açılmaz.',
    },
    {
      q: 'Renkleri veya logoyu neden değiştiremiyorum?',
      a: 'Şablon, kodları markaya uygun tutmak için bunları kilitliyor. Ya da yöneticiniz yalnızca şablonlarla kod oluşturmaya izin veriyor.',
    },
    {
      q: '«Dinamik kod» anahtarı yok.',
      a: 'Yalnızca Web sitesi türünde ve yönetici modül ayarlarında dinamik kodları açtığında bulunur.',
    },
    {
      q: 'Basılmış bir koddaki adresi değiştirebilir miyim?',
      a: 'Yalnızca dinamik bir kodda. Statik kod adresi noktalarında taşır — yeni bir adres için yeni bir kod gerekir.',
    },
    {
      q: 'İş arkadaşlarım kodlarımı görür mü?',
      a: 'Hayır, kitaplık kişiseldir. Paylaşmak için dosyayı indirin veya resmi kopyalayın.',
    },
    {
      q: 'Hangi boyutu indirmeliyim?',
      a: 'Baskı için SVG; sunumlar ve web siteleri için PNG 1024 veya 2048 px; büyük afişler için 4096 px.',
    },
  ],
};
