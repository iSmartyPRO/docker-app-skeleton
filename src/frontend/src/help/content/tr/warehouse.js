export default {
  title: 'Depo',
  tagline: 'Anlık stok, her hareket bir belgeyle, aletler göz önünde. Telefondan ve barkod okuyucuyla çalışır.',
  summary: 'Depo; miktarları, saklama yerlerini, sorumlu kişileri ve maliyeti tutar. Girişler, çıkışlar, transferler ve hurdaya ayırmalar üç adımda oluşturulan belgelerdir. Var olandan fazlasını çıkaramazsınız ve iki depo sorumlusu hiçbir zaman aynı parçayı çıkaramaz. Aletler tekil parça bazında izlenir: her birinin nerede olduğu ve ne zaman bakım gerektirdiği.',
  highlights: [
    {
      title: 'Her yerde barkod okuma',
      text: 'Telefon kamerası veya USB/Bluetooth barkod okuyucu: her tarama belgeye bir kalem ekler.',
    },
    {
      title: 'Eksi stok yok',
      text: 'Her satır «eldeki · rezerve · kullanılabilir» bilgisini gösterir; eksik vurgulanır ve Satın alma’dan sipariş edilir.',
    },
    {
      title: 'İki adımlı transferler',
      text: 'Sevk edildi — mallar «yolda»; zimmet sorumlusu kabul eder, fark bir tutanağa dönüşür.',
    },
    {
      title: 'Aletlerim',
      text: 'Zimmetimdekiler, onaylı olarak bir iş arkadaşına teslim, bakım hatırlatmaları.',
    },
    {
      title: 'İzne göre tutarlar',
      text: 'Depo sorumluları ve şantiye şefleri miktarları görür; maliyeti yalnızca muhasebe ve yönetim görür.',
    },
  ],
  tips: [
    'Bir stok kalemini bulmanın en hızlı yolu taramaktır: «Stok» ekranının üstündeki kamera düğmesi.',
    '«Geçen seferki gibi» aynı türdeki son belgenin satırlarını alır.',
    'Paket olarak girin — sistem adede dönüştürür: «2 pk = 48 ad».',
    'Kaydedilmiş bir belge hiçbir zaman silinmez: hatayı «Ters kayıt» düzeltir.',
    'Lokasyonlar ve aletler için QR etiketleri yazdırın — sonra kamerayı doğrultmanız yeterli olur.',
    'Telefonda «Depo sorumlusu modu»nu açın — büyük kutucuklar, tek elle çalışma.',
  ],
  sections: [
    {
      title: 'Stok',
      body: `Ana ekran. Bir satırda stok kalemi, depo, eldeki, rezerve, kullanılabilir, asgari miktar ve son hareket görünür (tutar yalnızca «Maliyetleri ve tutarları görme» izniyle).

- Çipler: **Asgari seviyenin altında**, **Stokta yok**, **Son kullanma tarihi yaklaşıyor**, **Rezerve**, **90 gündür hareket yok**, **Depolarım**.
- Gruplama: depoya göre, kategoriye göre, zimmetli kişiye göre (depolar, kişiler, şantiyeler), seçilen deponun lokasyonuna göre.
- Tıklamak stok kartını açar: depolara ve lokasyonlara göre stok, hareketler, partiler ve parçalar, rezervler, barkodlar, normlar ve fotoğraflar.
- Tek bir depoda «Asgari seviyenin altında» seçiliyken «Satın alma’dan sipariş ver» düğmesi çıkar — yeniden sipariş noktasına kadar bir taslak satın alma talebi.`,
    },
    {
      title: 'Üç adımda belgeler',
      steps: [
        '«Yeni belge»ye basın ve türü seçin: giriş, çıkış, transfer, iade, hurdaya ayırma…',
        '1. adım «Nereden / nereye»: depo, teslim alan (bir kişi veya bir Master plan nesnesi), tedarikçi, hurdaya ayırma nedeni.',
        '2. adım «Satırlar»: tarayın, arayın veya «Geçen seferki gibi»ye basın. Her satır stok ipucunu gösterir; eksik kırmızıdır.',
        '3. adım «Kaydet»: irsaliyenin fotoğrafını ekleyin, teslim alan parmağıyla imzalar, «Kaydet»e basın.',
      ],
      note: 'Depo sorumlusu izni olmayan bir şantiye şefi bir **malzeme talebi** oluşturur ve depo sorumlusuna gönderir; çıkışı depo sorumlusu kaydeder. Durumlar: Taslak → (Onayda) → Kaydedildi → (Ters kayıtla iptal edildi).',
    },
    {
      title: 'Transfer ve kabul',
      body: 'Transfer iki adımlıdır. Kaynak deponun sorumlusu «Sevk et»e basar — mallar depodan çıkar ve «yolda» olur. Hedef deponun zimmet sorumlusu transferi «Kabul bekleyenler» çipinde ve «Beni bekleyenler» sayfasında görür, «Kabul et»e basar ve her satırın miktarını kontrol eder. Fark olursa otomatik olarak bir **fark tutanağı** kaydedilir: eksik transitten düşer, fazla depoya girer.',
    },
    {
      title: 'Satın alma talebinden giriş',
      body: 'Yeni bir girişte onaylanmış bir talep seçin: stok kalemleri, tedarikçi, fiyatlar ve para birimi doldurulur, kalemler stok koduna veya ada göre eşleştirilir. Kayıt, talepte teslimatı işaretler — hâlâ gelecek bir şey varsa kısmi olarak. Eksiği olan bir çıkıştan «Eksikleri sipariş et» bir taslak satın alma talebi oluşturur.',
    },
    {
      title: 'Hurdaya ayırma ve onay',
      body: 'Neden zorunludur: işte kullanıldı, kusur, hasar, eksik, süresi doldu… Eşiğin üzerinde (varsayılan olarak 500 $) belge onaya gider ve karardan sonra kendiliğinden kaydedilir. Onay akışı «Onaylar» bölümünde ayarlanır.',
    },
    {
      title: 'Telefonda depo sorumlusu modu',
      steps: [
        'Depo menüsünden «Depo sorumlusu modu»nu (/app/warehouse/m) açın ve deponuzu seçin — telefon bunu hatırlar.',
        'Kutucuklar: Giriş, Çıkış, Transfer, Transferi kabul et, Sayım, Stok kalemi bul, Aletlerim.',
        'Kamerayla (taramalar arasında açık kalır) veya USB / Bluetooth barkod okuyucuyla tarayın. Taramadan sonra bir miktar penceresi açılır: «−» ve «+», «2 pk = 48 ad» bilgisiyle «paket ↔ adet» anahtarı. Aynı kalemin tekrar taranması bir adet ekler. «Miktar girmeden hemen +1» anahtarı sormadan ekler.',
        'Bir lokasyon etiketini tarayın — sonraki satırlar oraya gider. Çıkışta her satır «eldeki · kullanılabilir» bilgisini gösterir, eksik kırmızıdır.',
        'Son adım: irsaliyenin fotoğrafı, teslim alanın parmak imzası (çıkışlarda), «Kaydet» — ve bir sonuç ekranı.',
      ],
      note: 'Satın alma talebinden giriş: satırlar talepten gelir; «Fiilî duruma göre say» bunları sıfırlar ve gelenleri tarayarak sayarsınız. Gelmeyen satırlar dışarıda kalır, talep teslimat işaretini alır.',
    },
    {
      title: 'Sayım',
      steps: [
        '«Sayım» → «Yeni sayım»: depo, isteğe bağlı olarak lokasyonlar veya kategoriler (kısmi sayım), «kör» mod ve hareketlerle ne yapılacağı — engelleme veya ayrı kaydetme. Sayacak kişileri seçin.',
        '«Lokasyonlar ve sayanlar» sekmesinde lokasyonları veya bir bölgeyi seçin ve bir kişi atayın. Yoksa lokasyon etiketlerini yazdırın.',
        'Telefonda sayan kişi önce lokasyonu, sonra malları tarar ve miktarı girer; sonunda — «Lokasyon sayıldı». Bağlantı yoksa sayımlar telefonda bekler ve bağlantı geri geldiğinde kendiliğinden gönderilir.',
        '«Mutabakat»: kayıtlı miktar, sayım, fark ve tutarı («Maliyetleri ve tutarları görme» izniyle), «Yalnızca farklar» filtresi. İki kişinin saydığı yerlerde sayımlar toplanır ve işaretlenir — «Karar ver»e basın. Herhangi bir satır yeniden sayıma gönderilebilir.',
        '«Bitir ve tutanak oluştur»: tek bir sayım tutanağı; eşiğin üzerindeyse onaya gider. Kaydedildiğinde stok sayıma eşit olur ve dondurma sona erer.',
      ],
      note: 'Düzenli kısmi sayımlar («her 30 günde bir: elektrik malzemeleri») «Düzenli» sekmesinde ayarlanır — zamanı geldiğinde bir hatırlatma gelir. Bir sayım hareketleri engellerken kapsamındaki girişler, çıkışlar ve transferler kaydedilmez — kırmızı bir bant bu konuda uyarır.',
    },
    {
      title: 'Aletler',
      body: 'Seri numaralı kalemler demirbaş numarasıyla tekil parça bazında izlenir. Kayıt, her birinin şu anda nerede olduğunu gösterir: bir depo ve lokasyon, bir kişi veya bir şantiye; «Zimmetimde», «Onarımda», «Bakım yaklaşıyor» filtreleri. «Aletlerim» bölümünde kişi zimmetindekileri görür ve bir iş arkadaşına teslim edebilir — iş arkadaşı onayladığında teslim tamamlanır. Bakımdan önce ve bir şey zamanında iade edilmediğinde hatırlatmalar gelir.',
    },
    {
      title: 'Raporlar',
      body: `- **Stok hareket tablosu**: dönem için açılış, giriş, çıkış, kapanış — miktar ve tutar.
- Belgeleri ve her birinden sonraki bakiyeyle **stok kalemi hareketi**.
- **Şantiyeye göre malzemeler**: çıkışı yapılan, iade edilen, hurdaya ayrılan ve şu anda üzerinde olan.
- **Zimmetliye göre aletler**.

Excel (CSV) dışa aktarmaları formüllere karşı korunur; tutarlar yalnızca «Maliyetleri ve tutarları görme» izniyle.`,
    },
    {
      title: 'Depolar, lokasyonlar, izinler',
      body: 'Depo yöneticisi depoları (ana, şantiye, transit, mobil) oluşturur, zimmet sorumlusunu belirler, lokasyonları açar (bölge → raf → raf katı) ve bunlar için QR etiketleri yazdırır. «Burada kimler çalışıyor» tek bir depo üzerinde izin verir: A deposunun sorumlusu B deposunun belgelerini kaydedemez, ancak izin verilmişse stoğunu görür.',
    },
    {
      title: 'Excel’den içe aktarma',
      body: 'Stok kartları ve açılış bakiyeleri .xlsx veya .csv dosyasından gelir. Şablonu indirin, doldurun ve «Kontrol et»e basın — satırlara göre bir hata listesi görünür. Açılış bakiyeleri bir «Açılış bakiyeleri» belgesi oluşturur.',
    },
  ],
  faq: [
    {
      q: 'Tutarları neden göremiyorum?',
      a: 'Maliyet ve tutarlar yalnızca «Maliyetleri ve tutarları görme» iznine sahip kişilere gösterilir. Diğerleri miktarları görür.',
    },
    {
      q: 'Kaydedilmiş bir belge yanlış — nasıl düzeltilir?',
      a: 'Bir nedenle birlikte «Ters kayıt»a basın: karşıt bir belge kaydedilir. Ardından doğrusunu oluşturun.',
    },
    {
      q: 'Belge neden kaydedilmiyor?',
      a: 'Büyük olasılıkla stok yetersiz: satırlar kırmızıdır ve ipucu kullanılabilir miktarı gösterir. Başka bir şey için rezerve edilmiş stok çıkarılmaz.',
    },
    {
      q: 'Belge kaydedilmiyor: «sayım devam ediyor»',
      a: 'Depoda hareketler engellenerek sayım yapılıyor. Sayım tutanağı kaydedilene kadar bekleyin veya sayımı yürüten kişiden bitirmesini isteyin.',
    },
    {
      q: 'Geçmiş bir tarihle kaydedebilir miyim?',
      a: 'Evet, «Geçmiş tarihli belgeler» izniyle ve yalnızca açık dönemde.',
    },
  ],
};
