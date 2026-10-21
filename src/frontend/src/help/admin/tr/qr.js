export default {
  purpose: 'QR kodları, kurumsal QR kodları için bir stüdyodur: web sitesi, kartvizit, Wi-Fi, metin, e-posta, telefon, SMS, WhatsApp, Telegram, haritada bir konum ve etkinlik. Çalışanlar şirket şablonlarından logolu ve tarama kontrollü kodlar yapar ve bunları baskı kalitesinde indirir. Dinamik web sitesi kodları, baskıdan sonra adresi değiştirmeyi ve taramaları saymayı sağlar.',
  audience: `- **Çalışanlar** — pazarlama, satış, ofis yöneticileri: kartvizitler, misafir Wi-Fi’si, broşür ve stant kodları. Herkesin kişisel bir kitaplığı vardır.
- **Şablon yöneticileri** («QR şablonlarını yönet» izni; süper yöneticilerde vardır) — görünümleri hazırlar ve kurumsal stili kilitler.`,
  setup: [
    {
      title: 'Modülü açın',
      text: 'Modül varsayılan olarak kapalıdır. [Ayarlar → Modüller → QR kodları](/admin/settings/qr) bölümünden açın.',
    },
    {
      title: 'Şirket logosunu yükleyin',
      text: 'Ayarlar → Görünüm’de — açık ve koyu varyantlar. Logo sekmesinde ve «Kurumsal» şablonunda hemen kullanılabilir.',
    },
    {
      title: 'Şablonları hazırlayın',
      text: '[Şablonlar](/app/qr/templates) sayfasında zaten 9 hazır şablon vardır. Sıralayın, varsayılanı yıldızlayın, gereksizleri gizleyin, gerekirse kendinizinkini oluşturun ve renkleri veya logoyu kilitleyin.',
    },
    {
      title: 'Kullanıcıların ne yapabileceğine karar verin',
      text: '«Tasarımı değiştirme», «Kendi logosunu yükleme», «Dinamik kodlar» ve «Kişi başına kod» — [modül ayarlarında](/admin/settings/qr).',
    },
    {
      title: 'Şablon iznini verin',
      text: '«QR şablonlarını yönet» iznini roller aracılığıyla pazarlamaya veya bir tasarımcıya verin; süper yöneticilerde her zaman vardır.',
    },
  ],
  roles: {
    'qr.admin': 'Şablonlar sayfası: oluşturma, düzenleme, sıralama, varsayılanı belirleme, gizleme, silme ve «Hazır olanları geri yükle». «Kullanıcılar ne yapabilir» sınırları bu kişilere uygulanmaz.',
  },
  access: `Kodlar kişiseldir: herkes yalnızca kendi kodlarını görür ve düzenler. Şablonları kod oluşturan herkes görür; gizli şablonları yalnızca yöneticiler.

**Modül ayarları** ([/admin/settings/qr](/admin/settings/qr)):

- **Tasarımı değiştirme** — kapalı: kodlar şablonların aynısıdır, yalnızca içerik seçilir; «Kendi tasarımım» kullanılamaz.
- **Kendi logosunu yükleme** — kapalı: ortaya yalnızca şirket logosu ve simgeler konabilir.
- **Dinamik kodlar** — kısa \`/q/…\` bağlantılı web sitesi kodları: adres baskıdan sonra değişir, taramalar sayılır.
- **Kişi başına kod** — varsayılan 500, 10 ile 10.000 arası.

**Şablon kilitlerini** (Renkler, Şekil, Logo, Çerçeve) sunucu denetler: «QR şablonlarını yönet» izni olmayan bir çalışan, arayüzü atlasa bile o şablondan yapılan kodlarda kilitli olanı değiştiremez.`,
  scenarios: [
    {
      title: 'Tek bir kurumsal stil',
      text: 'Pazarlama «Kurumsal» şablonunu varsayılan bırakır (renkler ve logo kilitli) ve «Tasarımı değiştirme»yi kapatır — tüm kartvizitler ve broşürler aynı stilde çıkar.',
    },
    {
      title: 'Misafir Wi-Fi’si',
      text: 'Ofis yöneticisi «Ücretsiz Wi-Fi» çerçeveli bir Wi-Fi kodu yapar ve resepsiyon için basar — kimsenin parolayı söylemesi gerekmez.',
    },
    {
      title: 'Adresi değiştirilebilen reklam',
      text: 'Açık hava reklamlarında dinamik bir web sitesi kodu kullanılır. Kampanya bitince adres yeni bir sayfaya çevrilir ve sayaç afişi kaç kişinin taradığını gösterir.',
    },
  ],
  faq: [
    {
      q: 'Bir çalışan kodu silerse basılı kodlara ne olur?',
      a: 'Statik kodlar içeriklerini kendileri taşır ve çalışmaya devam eder. Dinamik bir kod silindiğinde (veya «Dinamik kod» kapatıldığında) bağlantıyı açmayı bırakır.',
    },
    {
      q: 'Ayarlarda «Dinamik kodlar»ı kapatırsam ne olur?',
      a: 'Yeni dinamik kodlar oluşturulamaz, mevcut olanlar çalışmaya devam eder. Ancak bir çalışan kendi kodunda «Dinamik kod»u kapatırsa, yeniden açamaz.',
    },
    {
      q: 'Bir şablonu sildim — onunla yapılan kodlar değişir mi?',
      a: 'Hayır, kodlar görünümlerini korur. Silinen hazır bir şablon «Hazır olanları geri yükle» ile geri gelir.',
    },
    {
      q: 'Botlar tarama istatistiklerine dahil mi?',
      a: 'Hayır. Bağlantı önizleme botları (mesajlaşma uygulamaları, sosyal ağlar, arama motorları) sayılmaz.',
    },
    {
      q: '«Kurumsal renk» düğmesi neden kodların rengini değiştiriyor?',
      a: 'Portal temasının ana rengini izler: tema değişince bu kodlar kendiliğinden yeniden renklenir. Rengin sabit kalması için belirli bir renk seçin.',
    },
  ],
};
