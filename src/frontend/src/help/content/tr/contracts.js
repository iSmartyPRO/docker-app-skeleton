export default {
  title: 'Sözleşmeler',
  tagline: 'Şirketin sözleşme kayıt listesi: sürümler, hukukçunun riskleri, onay ve süreler kontrol altında.',
  summary: 'Her sözleşme; cari hesap, tutar, tarihler ve kişilerle birlikte bir karttır. Hukukçu dikkat edilmesi gerekenleri not eder, iş arkadaşları neyin değiştiğini belirterek yeni sürümler yükler, sözleşme onaydan geçer ve bitişten 30 ve 7 gün önce hatırlatmalar gelir.',
  highlights: [
    {
      title: 'Dosya sürümleri',
      text: 'Her sürümün yükleyeni, tarihi ve “ne değişti” notu vardır; herhangi biri açılabilir veya indirilebilir.',
    },
    {
      title: 'Dikkat edilmesi gerekenler',
      text: 'Hukukçunun madde ve önem derecesiyle belirttiği riskler; ciddi olanlar onaylayanın düğmelerinin yanında durur.',
    },
    {
      title: 'Onay',
      text: 'Aşamalardan oluşan bir onay akışı, sorular ve yanıtlar doğrudan kartta.',
    },
    {
      title: 'Süreler kontrol altında',
      text: '«Süresi doluyor» durumu otomatik olarak ayarlanır, hatırlatmalar iş sahibine ve hukukçuya gider.',
    },
    {
      title: 'Bitiş takvimi',
      text: 'On iki ay ilerisi: neyin sona erdiği ve uzatmanın ne zamana kadar reddedilmesi gerektiği.',
    },
    {
      title: 'Tartışma',
      text: 'Sözleşmenin sohbeti; bir mesaj bir riske işaret edebilir.',
    },
    {
      title: 'Kaparo ve ödemeler',
      text: 'Satışlar için: kaparo, tutardan veya nesnenin fiyat tablosundan ödeme planı, ödemeler ve gecikenler.',
    },
  ],
  tips: [
    'Kart, kayıt listesinin üzerinde sağda açılır; ↑ ve ↓ sözleşmeler arasında geçiş yapar, Esc kapatır.',
    '/ tuşu imleci kayıt listesi aramasına getirir.',
    'Tamamlanmamış yeni sözleşme formu kendiliğinden kaydedilir — kapatıp daha sonra geri dönebilirsiniz.',
    '«İmzalı sürümü yok» çipi, taraması henüz yüklenmemiş imzalı sözleşmeleri gösterir.',
    '«⤓ CSV» düğmesi geçerli listeyi filtreler ve izinler uygulanmış olarak Excel’e aktarır.',
  ],
  sections: [
    {
      title: 'Kayıt listesi',
      body: `Listenin üstünde sayaçlı çipler bulunur: **Tümü**, **Benim**, **Beni bekleyenler**, **Acil**, **Gecikmiş**, **İşlemde**, **Yürürlükte**, **N gün içinde süresi dolanlar**, **İmzalı sürümü yok** ve **Tamamlanan** (arşiv: tamamlanan, feshedilen, reddedilen).

Numaraya, konuya, cari hesaba ve karşı tarafın numarasına göre arayın. Sütunlar: numara, cari hesap ve konu, tür, tutar, bitiş tarihi, durum, iş sahibi. Bir haftadan az kaldığında veya geçtiğinde bitiş tarihi kırmızı, «Süresi doluyor» aralığındayken sarı olur; ↻ otomatik uzatmayı gösterir.

Varsayılan olarak ilgi gerektirenler en üsttedir: gecikmiş onaylar, sorular, aciliyete göre onaydaki sözleşmeler, ardından süresi dolanlar.`,
    },
    {
      title: 'Sözleşme kartı',
      body: `Üst kısımda numara, durum, tür, konu, cari hesap ve tüzel kişi, tutar (veya «Çerçeve»), süre, ret son tarihi ve kişiler gösterilir. Altında onay yolu ve karar düğmeleri, ardından sekmeler bulunur:

- **Genel bakış** — tüm alanlar ve riskler;
- **Sürümler** — dosya akışı;
- **Tartışma** — sözleşmenin sohbeti;
- **Bağlantılar** — satın alma talepleri, CRM fırsatı, Master plan nesnesi (bu modüller açıkken);
- **Geçmiş** — onay kararları dahil, kimin neyi değiştirdiği.`,
      steps: [
        '«Yeni sözleşme»ye basın. Konu, cari hesap ve dosya yeterlidir — gerisi sonra eklenebilir.',
        'Hukukçu riskleri Genel bakış sekmesinde ekler.',
        'Değişikliklerden sonra neyin değiştiğini belirterek yeni bir sürüm yükleyin.',
        'Aciliyeti seçin ve «Onaya gönder»e basın.',
        'Onaylandıktan sonra hukukçu sözleşmeyi imzalandı olarak işaretler ve imzalı sürümü seçer.',
      ],
    },
    {
      title: 'Durumlar',
      body: `**Taslak** → **Onayda** (↔ **Yanıt gerekli**) → **Onaylandı** → **İmzalandı** → **Yürürlükte** → **Süresi doluyor** → **Tamamlandı**. Yan durumlar: **Reddedildi** ve **Feshedildi**.

- Onay durumları onay hizmetinden gelir; belgeyi düzeltmeye geri göndermek onu «Taslak» durumuna döndürür.
- «İmzalandı», «Yürürlükte», «Tamamlandı» ve «Feshedildi» durumlarını hukukçu belirler; fesih için bir neden gerekir.
- «Yürürlükte» başlangıç tarihinden, «Süresi doluyor» bitişten N gün önce, «Tamamlandı» bitişten sonra kendiliğinden gelir. Otomatik uzatılan bir sözleşme bunun yerine aynı uzunlukta bir sonraki süreyi alır.
- Alanlar «Taslak», «Yanıt gerekli» ve «Reddedildi» durumlarında düzenlenebilir; onaydayken kilitlidir, sürümler ve riskler kilitli değildir. Hukukçu onaydayken de alanları düzeltebilir; bu durumda henüz ulaşılmamış aşamalar onay akışının koşullarına göre yeniden planlanır.`,
    },
    {
      title: 'Dikkat edilmesi gerekenler',
      body: `Hukukçunun kontrol listesi: metin, madde, önem (yüksek, orta, düşük) ve durum (açık, kabul edildi, düzeltildi). Sözleşme onaydayken açık yüksek riskler onaylayana doğrudan karar düğmelerinin üstünde gösterilir.

Bir riskin 💬 düğmesi tartışmaya, riske geri bağlantı içeren bir «Risk #N» mesajı yazar; böylece yazışma bağlamını korur.`,
    },
    {
      title: 'Bitiş takvimi ve hatırlatmalar',
      body: `Takvim on iki ayı gösterir: her hücre kaç sözleşmenin sona erdiğini ve kaç ret son tarihinin (↻) o aya düştüğünü belirtir. Altında aylar liste olarak yer alır: gün, ne olacağı, cari hesap, tutar.

Hatırlatmalar bitişten 30 ve 7 gün önce (ayarlanabilir), otomatik uzatılan sözleşmelerde ise reddetmek için son günden önce iş sahibine ve hukukçuya ulaşır. Her hatırlatma bir kez gelir.`,
    },
    {
      title: 'Kaparo, ödeme planı, ödemeler',
      body: `**Ödemeler** sekmesi müşteriyle yapılan sözleşmelerde, «Satış» ve «Gayrimenkul satışı» türlerinde ve hâlihazırda kaparosu veya planı olan her sözleşmede görünür.

**Kaparo veya avans.** Kaparo anlaşmayı güvence altına alır: alıcı vazgeçerse satıcıda kalır, satıcı vazgeçerse iki katı iade edilir (KC / RF Medeni Kanunu). Avans her zaman iade edilebilir. Tutarı, son günü ve iade koşullarını girin; finans («Finans (sözleşmeler)» izni) alındığını tarih, yöntem, numara ve belgeyle onaylar. Daha sonra kaparo **fiyata mahsup edilir**, **iade edilir** veya **alıkonulur**.

**Ödeme planı.** «Plan oluştur»: %100 veya taksitli — yüzde olarak ilk ödeme, ay sayısı, ilk gün ve ayın günü. Sözleşme bir Master plan nesnesine bağlıysa nesnenin fiyat tablosu planları en üsttedir: birine tıklayın, rakamlar dolsun. İlk ve aylık ödemeler tam sayı tutarlardır, son ödeme farkı alır. Kaparo ayrı bir satırdır ve ilk ödemeyi azaltır. Satırlar kaydetmeden önce düzenlenebilir.

**Ödemeler.** Finans her ödemeyi kaydeder: ödeme önce en eski ödenmemiş satırları kapatır, kısmi ödeme bir satırı kısmen kapatır. Üstte: «%N ödendi», kalan, geciken ve sonraki ödeme. Gecikmiş satırlar kırmızı, yaklaşanlar (7 gün, ayarlanabilir) turuncudur.

**Master plan.** Sözleşme bir nesneye bağlıysa ve her iki modül de açıksa: onaylanan kaparo nesneyi ön rezervasyondan / rezervasyondan «Kaparo» durumuna, imza «Sözleşme» durumuna (numara, tarih, tutar) taşır, ödemeler «ödenen» tutarı günceller, %100 nesneyi «Satıldı» yapar. Bu geçişler sizin Master plan izinlerinizle yapılır; izin verilmeyen bir geçişte para yine kaydedilir ve kart, elle ne yapılması gerektiğini anlatan turuncu bir not gösterir.`,
    },
    {
      title: 'Ödeme kayıt listesi',
      body: `Modül menüsündeki **Ödemeler**, finans ve tüm sözleşmeleri görenler içindir: ödenmemiş ödemeler ve beklenen kaparolar **Gecikmiş**, **Bugün**, **Bu hafta**, **Daha sonra** olarak gruplanır, para birimi başına toplamlarla. Kaparo için «Alındı olarak işaretle» ve «Onayla» doğrudan satırdadır; sözleşme sağda «Ödemeler» sekmesinde açılır. «CSV dışa aktar» listeyi Excel için kaydeder.

Sözleşme kayıt listesinde **Kaparo bekleyen**, **Ödemesi gecikmiş** ve **Ödenmiş** çipleri vardır — gösterecek bir şey olduğunda görünürler. «Sözleşme tahsilatları» pencere öğesi ana sayfaya eklenebilir.`,
    },
    {
      title: 'Kim neyi görür',
      body: `- **Tüm sözleşmeleri** yönetim («Tüm sözleşmeleri görme» izni), hukukçular ve sözleşme yöneticileri görür.
- Diğerleri kendi sözleşmelerini (oluşturdukları, iş sahibi veya hukukçu oldukları), gruplarının sözleşmelerini ve onayladıklarını görür.
- Sözleşmeleri «Sözleşme oluşturma» iznine sahip kişiler oluşturur.
- Dosyalar yalnızca sözleşmeyi görenler için açılır.
- **Finans (sözleşmeler)** kaparosu veya planı olan sözleşmeleri görür, kaparoları onaylar ve ödemeleri kaydeder; kaparoyu ve planı sözleşmenin kişileri planlar.`,
    },
  ],
  faq: [
    {
      q: 'Neden onaya gönderemiyorum?',
      a: 'En az bir dosya gerekir ve sözleşmenin taslak veya reddedilmiş olması gerekir.',
    },
    {
      q: 'Sözleşmeleri kim onaylar?',
      a: 'Onay akışı «Ayarlar → Onaylar» bölümünde, «Sözleşme» türü için belirlenir. Kaydedilene kadar sözleşmeleri sözleşme yöneticileri onaylar.',
    },
    {
      q: 'Bir sözleşmeyi nasıl uzatırım?',
      a: 'Hukukçu bitiş tarihini değiştirir ve sözleşme yeniden «Yürürlükte» olur. Otomatik uzatmada süre kendiliğinden uzar.',
    },
    {
      q: '«İmzalı sürümü yok» ne anlama gelir?',
      a: 'Sözleşme onaylanmış veya imzalanmış, ancak hiçbir sürüm imzalı olarak işaretlenmemiş. Taramayı «Bu imzalı sürüm» işaretli olarak yükleyin.',
    },
  ],
  fields: {
    framework: {
      title: 'Çerçeve sözleşme',
      text: 'Sabit tutar yoktur: miktarlar ve fiyatlar siparişler veya şartnamelerle gelir.',
    },
    autoRenew: {
      title: 'Otomatik uzatma',
      text: 'Taraflardan biri reddetmedikçe sözleşme kendiliğinden yenilenir. Bitişten sonra portal aynı uzunlukta bir sonraki süreyi belirler.',
    },
    noticeDays: {
      title: 'Ret bildirimi',
      text: 'Bitişten kaç gün önce ret bildirimi gönderilmesi gerektiği. Portal size önceden hatırlatır.',
    },
    risks: {
      title: 'Riskler',
      text: 'Hukukçunun kontrol listesi. Onaylayanlar açık yüksek riskleri karar düğmelerinin yanında görür.',
    },
  },
};
