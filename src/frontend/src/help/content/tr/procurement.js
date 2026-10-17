export default {
  title: 'Satın alma',
  tagline: 'Bir dakikada satın alma talebi: ne, ne kadar ve fatura. Ardından e-posta veya mesajlaşma uygulaması olmadan onay, ödeme ve teslimat.',
  summary: 'Çalışan talebi faturayla birlikte oluşturur. Talep onaydan geçer ve ardından kendiliğinden muhasebenin ödeme kaydına düşer. Muhasebe ödemeyi ödeme talimatıyla işaretler, sorumlu kişi teslimatı onaylar. Sürece dahil olan herkes yolu ve son tarihleri görür.',
  highlights: [
    {
      title: 'Telefondan bir dakikada',
      text: 'Faturanın fotoğrafını çekin — form kendiliğinden kaydedilir.',
    },
    {
      title: 'Açık bir yol',
      text: 'Kimin oluşturduğu, kimin onayladığı, talebin şu an nerede olduğu ve ne kadar süredir orada beklediği.',
    },
    {
      title: 'Ödeme kaydı',
      text: 'Muhasebe bugün neyin ödeneceğini ve neyin geciktiğini para birimi başına toplamlarla görür.',
    },
    {
      title: 'Renk son tarihi gösterir',
      text: 'Kırmızı gecikmiş, sarı süresi yaklaşan demektir. Hatırlatmalar kendiliğinden gider.',
    },
    {
      title: 'Kartta tartışma',
      text: 'Sorular ve yanıtlar doğrudan talepte; hiçbir şey kaybolmaz.',
    },
  ],
  tips: [
    'Listenin üstündeki çipler sayaçları gösterir: «Beni bekleyenler», «Acil», «Gecikmiş», «Ödenecek».',
    'Bir filtre setini görünüm olarak kaydedin — «Görünümler» menüsünde görünür.',
    'Bir kart açıkken ↑ ve ↓ ile listede gezinin.',
    'Kalemler tutarı toplar; tek bir toplam tutar da kullanılabilir.',
    'Benzer bir talep mi? «Diğer → Çoğalt» — belgeler ve ödemeler olmadan.',
  ],
  sections: [
    {
      title: 'Talep oluşturma',
      steps: [
        '«Yeni talep»e basın.',
        'Ne satın aldığınızı açıklayın ve tutarı girin — tek bir toplam veya kalemler (ad, miktar, fiyat).',
        'Faturayı çerçeveye bırakın, bir dosya seçin, Dosyalar’dan alın veya telefon kamerasıyla fotoğrafını çekin.',
        'Aciliyeti, «son ödeme tarihi»ni, tedarikçiyi ve ihtiyacınız olan diğer bilgileri belirleyin. Taslak kendiliğinden kaydedilir.',
        '«Onaya gönder»e basın.',
      ],
      note: 'Yalnızca özet, tutar ve fatura zorunludur (yönetici fatura kuralını kapatmadıysa). Diğer her şey daha sonra eklenebilir.',
    },
    {
      title: 'Talep durumları',
      body: `**Taslak** → **Onayda** (↔ **Yanıt bekliyor**) → **Ödenecek** → **Kısmen ödendi** / **Ödendi** → **Teslim edildi** → **Kapatıldı**. Yan durumlar: **Reddedildi**, **İptal edildi**, **Düzeltmeye geri gönderildi**.

- Onaydan sonra talep kendiliğinden «Ödenecek» olur ve ödeme kaydında görünür.
- Ödemeler toplamı tutara ulaştığında «Ödendi» olur.
- Reddedilen bir talep yeniden gönderilmez — bir kopyasını oluşturun.
- Bir taslağı, onaydaki bir talebi (geri çekilir) ve ödemesi olmayan «Ödenecek» talebi iptal edebilirsiniz.`,
    },
    {
      title: 'Onay',
      body: 'Talep onay akışını izler: varsayılan olarak tek bir «Direktör» aşaması. Yönetici aşamalar ve koşullar ekleyebilir (örneğin 5 000 $’dan itibaren — finans direktörü). Onaylayanlar talebi [«Beni bekleyenler»](/app/approvals) sayfasında görür ve 1–2 tıklamayla karar verir. Size bir soru sorulursa gerekirse talebi değiştirin ve kartında yanıtlayın — talep aynı aşamaya geri döner.',
    },
    {
      title: 'Ödeme kaydı',
      body: 'Muhasebe için («Muhasebe: ödemeler» izni). Onaylanan talepler gruplanır: **Gecikmiş**, **Bugün**, **Bu hafta**, **Daha sonra** — para birimi başına toplamlarla. «Ödemeyi işaretle» doğrudan satırdadır: tarih, tutar (varsayılan olarak kalan tutar), yöntem, ödeme talimatı numarası ve dosyası. Birden çok kısmi ödeme yapılabilir. «Excel’e aktar» kaydı CSV olarak kaydeder.',
    },
    {
      title: 'Teslimat ve kapatma',
      body: 'Sorumlu kişi veya oluşturan teslimatı onaylar: tarih, «kısmen teslim edildi», irsaliye veya tutanak. Sonradan ödemede teslimat ödemeden önce onaylanabilir. Her şey ödenip teslim edildiğinde «Kapat»a basın.',
    },
    {
      title: 'Yönetim için özet',
      body: 'Duruma, kategoriye ve aya göre toplamlar (para birimi başına), ortalama onay süresi ve gecikmiş talepler — son 12 ay için, görebildiğiniz talepler üzerinden.',
    },
    {
      title: 'Kim neyi görür',
      body: `- Kendi talepleriniz (oluşturan veya sorumlu) — her zaman.
- Gruplarınızdaki iş arkadaşlarınızın talepleri — ayarlandıysa (taslaklar gizli kalır).
- Onayladığınız veya hakkında size soru sorulan talepler.
- **Tüm talepleri görme** — yönetim.
- **Muhasebe** onaylanan talepleri görür.
- **Satın alma yöneticisi** rehberleri ve herhangi bir talebi yönetir.`,
    },
  ],
  faq: [
    {
      q: '«Onaya gönder» neden devre dışı?',
      a: 'Başlık, tutar veya fatura eksik. Düğmenin altındaki ipucu hangisi olduğunu söyler.',
    },
    {
      q: 'Onaydan sonra tutar değişebilir mi?',
      a: 'Hayır. Talebi iptal edin ve yenisini oluşturun (veya çoğaltın). Açıklama, son teslim tarihi, sorumlu kişi ve bağlantılar yine değiştirilebilir.',
    },
    {
      q: 'Muhasebe bir ödemede hata yaptı — ne yapmalı?',
      a: '«Ödemeler» sekmesinde muhasebe yanlış kaydı kaldırır; durum yeniden hesaplanır.',
    },
    {
      q: 'Ödeyen tüzel kişiyi nerede seçerim?',
      a: '«Ödeyen ve koşullar» bloğunda. Tüzel kişiler listesini bir yönetici tutar (Sözleşmeler ile ortaktır).',
    },
  ],
  fields: {
    invoice: {
      title: 'Fatura',
      text: 'Böyle ayarlandıysa faturasız talep gönderilemez. Yüklediğiniz ilk dosya fatura olur; belge türünü kartta değiştirin.',
    },
    paymentTerms: {
      title: 'Ödeme koşulları',
      text: '%100 — tam peşin ödeme, avans — bir kısmı teslimattan önce, sonradan ödeme — teslimattan sonra. Ödeyen tüzel kişi, faturayı ödeyen taraftır.',
    },
    responsible: {
      title: 'Sorumlu',
      text: 'Varsayılan olarak oluşturan. Bir satın almacı atayın: satın almayı o yürütür ve teslimatı onaylar.',
    },
    links: {
      title: 'Bağlantılar',
      text: 'Bir Master plan projesi veya nesnesi, bir CRM fırsatı, bir sözleşme — yalnızca bu modüller açıkken gösterilir.',
    },
  },
};
