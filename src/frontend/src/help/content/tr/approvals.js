export default {
  title: 'Onaylar ve «Beni bekleyenler»',
  tagline: 'Kararınızı bekleyen her şey tek sayfada. Bir veya iki tıklamayla onaylayın ya da soru sorun.',
  summary: 'Onaylar, portalın ortak bir hizmetidir. Satın alma talepleri, sözleşmeler ve diğer belgeler aşamalardan oluşan bir onay akışından geçer; her onaylayan kendi belgelerini «Beni bekleyenler» sayfasında görür — size yöneltilen sorular, size geri gönderilen belgeler ve kabul bekleyen görevlerle birlikte.',
  highlights: [
    {
      title: 'Tek yer',
      text: 'Üst bilgide sayaçlı Gelen kutusu simgesi, «Beni bekleyenler» sayfası ve bir pano pencere öğesi.',
    },
    {
      title: '1–2 tıklamayla karar verin',
      text: '«Onayla», «Soru» ve «Aç» doğrudan satırda; birkaç belge tek işlemle.',
    },
    {
      title: 'Renk son tarihi gösterir',
      text: 'Kırmızı gecikmiş, sarı süresi yaklaşan demektir. Acil olanlar her zaman en üsttedir.',
    },
    {
      title: 'Açık bir yol',
      text: 'Kimin gönderdiğini, kimin onayladığını, belgenin şu an nerede olduğunu ve ne kadar beklediğini görün.',
    },
    {
      title: 'Sorular belgenin yanında',
      text: 'Yanıt, belgeyi aynı aşamaya geri döndürür — mesajlaşma uygulamalarında hiçbir şey kaybolmaz.',
    },
    {
      title: 'Vekil',
      text: 'Siz izindeyken onaylarınıza vekiliniz karar verir.',
    },
  ],
  tips: [
    'Yan kartı açmak için bir satıra tıklayın; ↑ ve ↓ ile belgeler arasında geçiş yapın.',
    'Soru kutusunda Ctrl+Enter gönderir.',
    'Birkaç satırı işaretleyin ve «Seçilenleri onayla» düğmesine basın — portal onay ister.',
    'Listenin üstündeki modül filtresi, her modülde kaç belgenin beklediğini gösterir.',
    'Uzaklaşıyor musunuz? «Kişisel alan → Vekilim» — bir kişi ve tarihleri seçin.',
  ],
  sections: [
    {
      title: '«Beni bekleyenler» sayfası',
      body: `Sayfayı üst bilgideki Gelen kutusu simgesiyle veya uygulama menüsünden açın. Sekmeler:

- **Beni bekleyenler** — sizin aşamanızdaki belgeler, size yöneltilen sorular, size düzeltmeye geri gönderilen belgeler ve kabul bekleyen görevler;
- **Onaydaki belgelerim** — sizin belgeleriniz: aşamaları, kimi ve ne zamana kadar bekledikleri;
- **Karar verdiklerim** — onayladığınız, reddettiğiniz, geri gönderdiğiniz veya devrettiğiniz belgeler.

Liste **Gecikmiş**, **Bugün** ve **Diğerleri** olarak gruplanır, aciliyete ve son tarihe göre sıralanır. Bir satırda modül, numara, başlık, tutar, oluşturan, son tarih ve aciliyet görünür.`,
    },
    {
      title: 'Kararlar',
      body: `- **Onayla** — herkes (veya onay akışına göre herhangi biri) onayladığında aşama kapanır; belge bir sonraki aşamaya geçer. Son aşamadan sonra belge «Onaylandı» olur.
- **Soru** — metin zorunludur. Belge, oluşturan veya seçtiğiniz kişi için «Yanıt bekliyor» durumuna geçer. Yanıt belgeyi aynı aşamaya geri döndürür ve bekleme süresi son tarihe eklenir.
- **Düzeltmeye geri gönder** — bir yorumla. Oluşturan belgeyi düzenler ve yeniden gönderir.
- **Devret** — kararı başka birine devredin.
- **Reddet** — yorum zorunludur; onay süreci sona erer.

Oluşturan, belge onaylanana kadar onu **geri çekebilir**.`,
    },
    {
      title: 'Süreler, hatırlatıcılar ve üst makama iletme',
      body: `Bir aşamanın yanıt süresi aciliyete bağlıdır: varsayılan olarak **Kritik — 4 sa**, **Acil — 24 sa**, **Normal — 72 sa**. Çalışma saatleri henüz dikkate alınmaz.

Sürenin %75’i geçtiğinde onaylayanlara bir hatırlatma gider. Son tarih geçtiğinde belge kırmızıya döner ve onay akışında üst makam olarak belirlenen kişilere (varsayılan olarak modülün yöneticilerine) bildirim gider. Hatırlatma ve üst makama iletme her aşamada bir kez yapılır.`,
    },
    {
      title: 'Vekil',
      body: '**Kişisel alan → Vekilim** bölümünde bir kişi ve bir dönem seçin (her iki tarih dahil). Bu dönemde vekil sizin aşamalarınızı kendi «Beni bekleyenler» sayfasında görür ve bunlara karar verebilir. Geçmiş, bu tür kararları “sizin adınıza” verilmiş olarak işaretler. Bir onay yöneticisi herkes için vekil atayabilir.',
    },
    {
      title: 'Onay akışları (yöneticiler için)',
      body: `Her belge türü için bir onay akışı belirlenir: **Gelen kutusu → ⚙ Ayarlar** veya **Ayarlar → Modüller → Onaylar**.

- Aşamaları yeniden sıralamak için sürükleyin; bir aşamanın adı, onaylayanları (kişiler, roller, gruplar) ve «Tümü» ya da «Herhangi biri» modu vardır. Bir rol veya grup tek bir onaylayandır: üyelerinden herhangi biri karar verir.
- Bir aşamanın **koşulları** belgenin alanlarını kontrol eder: X’in üzerindeki tutar (isteğe bağlı olarak bir para biriminde), kategori, proje, tüzel kişi. Koşul sağlanmazsa aşama atlanır.
- **Düzeltmeden sonra** belge ilk aşamadan veya onu geri gönderen aşamadan başlar.
- **Üst makam** — bir aşama geciktiğinde kime haber verileceği.
- Sağdaki **önizleme** onay akışını gösterir, örneğin «Ekipman» kategorisindeki 5 000 $’lık bir talep için.

Onay akışlarını onay yöneticileri ve modülün kendi yöneticileri (örneğin Satın alma) değiştirir. Aciliyet düzeylerini, hatırlatmayı ve üst makama iletmeyi bir onay yöneticisi ayarlar.`,
      example: {
        title: 'Örnek bir satın alma onay akışı',
        body: `1. «Departman amiri» — bir rol, herhangi biri.
2. «Finans direktörü» — tutar ≥ 5 000 USD ise.
3. «BT» — bir grup, kategori «Ekipman» ise.

300 USD’lik bir «Hizmetler» talebi yalnızca ilk aşamadan geçer; 5 000 USD’lik bir «Ekipman» talebi ise üç aşamanın hepsinden.`,
      },
    },
  ],
  faq: [
    {
      q: 'Onaylayanlar grubunda olmama rağmen bir belgeyi neden görmüyorum?',
      a: 'Aşama henüz başlamamış olabilir (belge daha önceki bir aşamadadır), «Herhangi biri» modunda başka bir üye zaten onaylamış olabilir veya aşama bir koşul nedeniyle atlanmış olabilir.',
    },
    {
      q: '«Onayla»ya bastım ve portal sürecin ilerlediğini söylüyor.',
      a: 'Sizden önce biri karar verdi — örneğin rolün başka bir üyesi. Sayfayı yenileyin: belge zaten bir sonraki aşamada veya tamamlanmış.',
    },
    {
      q: 'Bir soru ne kadar bekler?',
      a: 'Yanıt beklenirken aşamanın süresi durdurulur; yanıttan sonra kaldığı yerden devam eder.',
    },
    {
      q: 'Onaylar kapatılabilir mi?',
      a: 'Hayır, bu bir çekirdek hizmetidir. Onu kullanan modüller (Satın alma, Sözleşmeler) kapatılabilir.',
    },
  ],
  fields: {
    restartFrom: {
      title: 'Düzeltmeden sonra',
      text: 'Oluşturan belgeyi yeniden gönderdiğinde belgenin nereden başlayacağı.',
    },
    escalateTo: {
      title: 'Üst makam',
      text: 'Bir aşamanın geciktiği kime bildirilir. Boşsa — modülün yöneticilerine.',
    },
  },
};
