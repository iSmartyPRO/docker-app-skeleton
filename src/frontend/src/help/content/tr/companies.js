export default {
  title: 'Cari hesaplar',
  tagline: 'Birlikte çalıştığımız şirketler ve kişiler — kamu sicillerinden alınan bilgiler ve eksiksiz geçmişle.',
  summary: 'Müşterilerin, tedarikçilerin, iş ortaklarının ve kamu kurumlarının ortak rehberi. Vergi numarasını (INN) girin, bilgiler sicilden yüklensin; kişiler iş değiştirdiklerinde bile kariyer geçmişlerini korur. Her değişiklik, arama ve puan, yazarı ve tarihiyle geçmişte kalır.',
  highlights: [
    {
      title: 'Vergi numarasıyla bilgiler',
      text: 'Kırgızistan ve Rusya için kart, resmî sicil özetiyle birlikte tek bir düğmeyle sicilden doldurulur.',
    },
    {
      title: 'Her ülke için kurallar',
      text: 'INN, BIN, UNP, OGRN ve diğer numaralar o ülkenin biçimine göre kontrol edilir.',
    },
    {
      title: 'Mükerrer kayıt yok',
      text: 'Aynı numaraya sahip bir şirket zaten varsa portal sizi uyarır ve ona bağlantı verir.',
    },
    {
      title: 'Kişiler ve kariyerleri',
      text: 'Bir kişi birkaç şirkette çalışabilir; ayrıldığında geçmişi korunur.',
    },
    {
      title: 'Eksiksiz geçmiş',
      text: 'Kim neyi ne zaman değiştirdi — ayrıca aramalar, toplantılar ve fırsatlar hakkında notlar.',
    },
    {
      title: 'İş arkadaşlarından puanlar',
      text: 'Güvenilirlik, ödeme disiplini ve kalite puanları kiminle çalışılacağına karar vermeye yardımcı olur.',
    },
  ],
  tips: [
    'Yeni bir şirkete numarasıyla başlayın: vergi numarasını yazıp **Enter**’a basın — “Sicilden doldur” ile aynıdır.',
    'Önemli müşteriler için üç ayda bir “Sicille karşılaştır”a basın — yeni bir yöneticiyi veya adresi hemen görürsünüz.',
    'Biri ayrıldı mı? Silmeyin — “Şirketten ayrıldı”ya basın; kişi geçmişiyle birlikte kişiler arasında kalır.',
    'Bir arama veya toplantıdan sonra “Geçmiş” sekmesine bir kayıt ekleyin — iş arkadaşlarınız sormadan bilgi sahibi olur.',
    'Kendinizi sorumlu yapın, şirket “Şirketlerim” altında görünsün.',
    'Bir şirkete ihtiyacınız yok mu? Silmek yerine arşivleyin: her şey korunur ve tek tıklamayla geri yüklenir.',
  ],
  sections: [
    {
      title: 'Şirket kartı',
      body: `Kart bir şirketle ilgili her şeyi tek yerde tutar. Üstte: ad, ülke, numara, durum ve son sicil kontrolünün tarihi. Altında sekmeler bulunur:

- **Genel bakış** — bilgiler, yönetim, adresler, iletişim, banka hesapları, notlar;
- **Kişiler** — şu anda orada kimin çalıştığı ve kimin ayrıldığı;
- **Geçmiş** — her değişiklik, not, arama ve toplantı;
- **Puan** — iş arkadaşlarından puanlar;
- **Belgeler** — sözleşmeler, sicil özetleri ve diğer dosyalar.

Düzenleme formunda alanlar gruplanmıştır: “Ana bilgiler”, “Kayıt bilgileri”, “Yönetim”, “Adresler”, “İletişim”, “Banka bilgileri”, “Notlar”. Yalnızca **Ad** zorunludur — gerisi sonra eklenebilir.`,
      steps: [
        '“Şirketler”i açın ve “Şirket ekle”ye basın.',
        'Ülkeyi seçin ve ana numarayı (örneğin INN) girin.',
        '“Sicilden doldur”a basın veya alanları elle doldurun.',
        'İlişkiyi, sorumluyu ve etiketleri belirleyin, ardından “Oluştur”a basın.',
      ],
      note: 'Telefonlar ve e-postalar bir etiket taşıyabilir — “muhasebe”, “satış”. İş arkadaşlarınız nereyi arayacaklarını hemen bilir.',
    },
    {
      title: 'Ülkeler ve tanımlayıcılar',
      body: `Önce **ülkeyi** seçin — numaraları, nasıl kontrol edildiklerini, hukuki biçimleri ve bağlı sicili o belirler. Yanlış biçimdeki bir numara “Numarayı kontrol edin” olarak işaretlenir.

- 🇰🇬 **Kırgızistan** — INN (14 hane), kayıt numarası, OKPO (8 hane); Adalet Bakanlığı sicili.
- 🇷🇺 **Rusya** — INN (10 hane, şahıs şirketleri için 12), KPP, OGRN / OGRNIP, OKPO; INN ve OGRN kontrol haneleri doğrulanır; EGRUL / DaData sicili.
- 🇰🇿 **Kazakistan** — BIN / IIN (12 hane).
- 🇺🇿 **Özbekistan** — INN (STIR), 9 hane.
- 🇧🇾 **Belarus** — UNP, 9 hane.
- 🇹🇯 **Tacikistan** — INN, 9 hane.
- 🇨🇳 **Çin** — USCC, 18 karakter.
- 🇹🇷 **Türkiye** — vergi kimlik numarası VKN, 10 hane.
- 🌐 **Diğer ülke** — vergi numarası, kayıt numarası, KDV numarası.

Kazakistan, Özbekistan ve diğer ülkeler için henüz bağlı bir sicil yoktur — kartı elle doldurun.`,
      example: {
        title: 'Yazım hatalı bir Rus INN’si',
        body: '`7707083893` yerine `7707083894` yazıyorsunuz. Uzunluk doğru ama kontrol hanesi tutmuyor — portal “Numarayı kontrol edin” der ve yazım hatası rehbere hiç ulaşmaz.',
      },
    },
    {
      title: 'Sicilden doldurma',
      body: `Numarayı girin ve **“Sicilden doldur”**a basın — portal kamu siciline sorar ve verileri alanlara yerleştirir.

- **KC Adalet Bakanlığı** (Kırgızistan, anahtar gerekmez): Rusça, Kırgızca ve İngilizce adlar, kayıt numarası, OKPO, kayıt kurumu, kayıtlı adres, yönetici, durum, kayıt ve kapanış tarihleri, kurucu sayısı.
- **DaData** (Rusya, bir yönetici anahtar eklediyse): adlar, hukuki biçim, INN, KPP, OGRN, OKPO, OKVED, durum, tarihler, yönetici, tam adres.
- **Federal Vergi Servisi EGRUL** (Rusya, ücretsiz, anahtar gerekmez): adlar, INN, KPP, OGRN, yönetici, kayıt ve kapanış tarihleri.

Resmî PDF sicil özeti, kaydettiğinizde karta “Belgeler” sekmesinde eklenir. Elle yazdığınız telefonlar ve e-postalar korunur.`,
      example: {
        title: 'Bişkek’ten yeni bir tedarikçi',
        body: 'Ülke — 🇰🇬 Kırgızistan, INN — sözleşmedeki 14 hane. “Sicilden doldur”a basıyorsunuz: birkaç saniye içinde yeşil bir bant “Bilgilerin yüklendiği kaynak: KC Adalet Bakanlığı” der, Rusça ve Kırgızca adlar, adres, yönetici ve OKPO doldurulur, altta da “Resmî sicil özeti eklenecek” yazar. Geriye yalnızca muhasebe telefonu ve banka hesabı kalır.',
      },
      note: 'Sicil yanıt vermiyor veya captcha mı istiyor? Bir dakika bekleyin veya kartı elle doldurun. Dakikada en fazla 20 sicil isteği yapabilirsiniz.',
    },
    {
      title: 'Sicille karşılaştırma',
      body: `Şirketlerin yöneticileri, adresleri ve durumları değişir. Karttaki **“Sicille karşılaştır”** kartı alan alan sicille karşılaştırır ve bir “Alan — Kartta — Sicilde” tablosu gösterir.

- Kartın boş alanları önceden seçilidir — yalnızca doldurulmaları gerekir.
- Farklı değerlere siz karar verirsiniz: alınacakları işaretleyin.
- Her şey eşleşiyorsa kontrolü not etmek için “Kontrolü kaydet”e basın.

Kontrolden sonra geçmişte değişen alanlarla bir kayıt görünür, üst bilgi “Karşılaştırılan kaynak: … · tarih” gösterir ve “Belgeler”e güncel bir sicil özeti eklenir.`,
      steps: [
        'Şirket kartını açın ve “Sicille karşılaştır”a basın.',
        'Farkları gözden geçirin; kalması gerekenlerin işaretini kaldırın.',
        '“N değeri al” veya “Kontrolü kaydet”e basın.',
      ],
      example: {
        title: 'Yeni bir direktör',
        body: 'Bir sözleşme imzalamadan önce satış temsilcisi müşteriyi kontrol eder. “Yönetici” satırı kartta Asanov’u, sicilde Toktogulov’u gösterir. Satış temsilcisi yeni değeri alır; geçmiş, o tarihin sicil özetiyle birlikte “Karşılaştırma: KC Adalet Bakanlığı — güncellenen alan: 1” kaydını tutar.',
      },
      note: 'Karşılaştırma yalnızca bağlı sicili olan ülkeler için çalışır — şu anda Kırgızistan ve Rusya.',
    },
    {
      title: 'Mükerrer kayıtlar',
      body: `Kaydetmeden önce portal, arşiv dahil aynı ana numaraya (INN, BIN, UNP…) sahip bir şirket arar. Varsa sarı bir uyarı “Bu tanımlayıcıya sahip bir şirket zaten rehberde var” der ve ona bağlantı verir.

- Genellikle doğru adım mevcut kartı açıp tamamlamaktır.
- Gerçekten ayrı bir kayıtsa — örneğin aynı INN’ye sahip bir şube — “Yine de oluştur”a basın.`,
      note: '“arşivde” olarak işaretlenmiş bir kayıt mı buldunuz? Açın ve “Geri yükle”ye basın — tüm geçmişi geri gelir.',
    },
    {
      title: 'Kişiler ve işler',
      body: `**“Kişiler”** bölümü cari hesaplardaki kişileri tutar. Bir kişinin adı (yalnızca adı zorunludur), telefonları, e-postaları, Telegram, WhatsApp, LinkedIn, doğum günü, şehri, dilleri, etiketleri ve notları vardır.

Bir kişi ile bir şirket arasındaki bağ bir **iştir**: pozisyon, departman, başlangıç tarihi, iş telefonu ve e-postası ve “Karar verici” anahtarı. Bir kişi aynı anda birkaç şirkette çalışabilir. Bir şirketin “Kişiler” sekmesinde karar vericiler önce gösterilir.

Biri ayrıldığında **“Şirketten ayrıldı”**ya basın: tarihi, nedeni ve sonrasını belirleyin — “Henüz bir yere değil — kişi olarak tut” veya yeni pozisyonla “Başka bir şirkete geçiyor”. Eski iş “Kariyer” sekmesinde kalır.`,
      steps: [
        'Şirket kartında “Kişiler” sekmesini açın.',
        '“Yeni çalışan”a veya kişi zaten rehberdeyse “Mevcut kişi”ye basın.',
        'Pozisyonu belirleyin ve gerekirse “Karar verici”yi açın.',
      ],
      example: {
        title: 'Bir satın almacı iş değiştiriyor',
        body: '“Alfa” LLC’de satın almacı olan Aigul, Almatı’daki “Beta” LLP’ye geçiyor. Kişi kartını açın, Alfa’daki işinde “Şirketten ayrıldı”ya basın, “Başka bir şirkete geçiyor”u seçin, Beta’yı bulun ve yeni pozisyonu belirleyin. Alfa onu eski çalışanlar arasında, Beta mevcut çalışanlar arasında listeler ve onunla ilgili tüm notlar korunur.',
      },
      note: 'Kişiler listesinde “Şirketi olmayanlar” filtresi, bildiğimiz kadarıyla şu anda hiçbir yerde çalışmayan kişileri gösterir.',
    },
    {
      title: 'İlişki, sorumlu ve etiketler',
      body: `- **İlişki** — müşteri, tedarikçi, iş ortağı, potansiyel müşteri, yüklenici, kamu kurumu, rakip. Birkaçını seçebilirsiniz; her türün kendi rengi vardır ve şirket listesi buna göre filtrelenebilir.
- **Sorumlu** — şirketle veya kişiyle ilgilenen çalışan. Sorumlu olduğunuz şirketler “Şirketlerim” altında toplanır.
- **Etiketler** — kendi işaretleriniz için herhangi sözcükler: “VIP”, “ihale”, “Oş”. Bir sözcük yazın ve Enter’a veya virgüle basın.`,
      note: 'Bir yönetici “Sorumlu, oluşturan ve yöneticiler” seçeneğini seçtiyse kartı yalnızca onlar değiştirebilir — diğer herkes salt okunur görür.',
    },
    {
      title: 'Geçmiş: notlar, olaylar ve belgeler',
      body: `**“Geçmiş”** sekmesi bir şirkete veya kişiye olan her şeyin akışıdır. Portal oluşturmayı, her değişikliği (eski → yeni), sicil kontrollerini, kişilerin katılmasını ve ayrılmasını, puanları, belgeleri, arşivlemeyi ve geri yüklemeyi kaydeder.

Kendi kayıtlarınızı üstten ekleyin: **Not, Arama, Toplantı, E-posta, Fırsat, Sorun** — isterseniz bir tarihle. Filtreler: “Her şey”, “Notlar ve temaslar”, “Değişiklikler”.

**“Belgeler”** sekmesi şirketin dosyalarını tutar — sözleşmeler, sertifikalar, sicil özetleri (her biri en fazla 25 MB). Sicil özetleri oraya otomatik olarak düşer.`,
      example: {
        title: 'Bir aramayı kaydetme',
        body: 'Müşterinin muhasebecisiyle konuştunuz: “Arama”yı seçin, “#125 numaralı faturanın ayın 15’ine kadar ödeneceği teyit edildi” yazın ve “Geçmişe ekle”ye basın. Yarın kartı açan bir iş arkadaşınız anlaşmayı ve onu kimin yaptığını görür.',
      },
      note: 'Sistem kayıtları silinemez; kendi notlarınız silinebilir. Böylece değişiklik geçmişine her zaman güvenilebilir.',
    },
    {
      title: 'Puanlar',
      body: `**“Puan”** sekmesinde her çalışan 1 ile 5 arasında yıldız verebilir ve isterseniz ölçütleri puanlayabilir:

- şirketler — güvenilirlik, ödeme disiplini, kalite, iletişim;
- kişiler — güvenilirlik, iletişim, kalite.

Ortalama, her iş arkadaşının **en son** puanını sayar: yeni bir puan verdiğinizde eskisi geçmişte “daha yeni bir puanla değiştirildi” işaretiyle kalır. Bir yorum, iş arkadaşlarınızın nedenini görmesine yardımcı olur.`,
      note: 'En güvenilir tedarikçileri hızla bulmak için şirket listesini “Puana göre” sıralayın.',
    },
    {
      title: 'Arşiv',
      body: `Bir şirketle artık çalışmıyorsanız onu arşivleyin: **“Diğer” → “Arşiv”**, isterseniz bir nedenle. Kart, kişiler, geçmiş ve belgeler korunur — yalnızca ana listelerden çıkar. Onu “Arşiv” altında bulun ve “Geri yükle” ile geri getirin.

Kişiler de aynı şekilde arşivlenir — bkz. “Kişi arşivi”.

“Kalıcı olarak sil” yalnızca cari hesaplar yöneticisine açıktır ve kartı geçmişi, puanları ve belgeleriyle birlikte sonsuza dek siler.`,
    },
    {
      title: 'Arama ve filtreler',
      body: `**“Şirketler”** listesinde arama kutusu adda (tam ve resmî dildeki adlar dahil), INN’de ve diğer numaralarda, telefonda, e-postada ve yöneticide arar. Yanında: hızlı ülke filtresi, ilişki filtresi ve sıralama — ada göre, son güncellenenler, son eklenenler, puana göre.

**“Kişiler”** listesinde arama adı, telefonu, e-postayı, mesajlaşma uygulamalarını ve mevcut şirketi kapsar; filtreler “Benim”, “Herkes” ve “Şirketi olmayanlar”dır.

Modül menüsü: “Şirketler”, “Şirketlerim”, “Arşiv”, “Kişiler”, “Kişi arşivi”.`,
      example: {
        title: 'Bilinmeyen bir numaradan kim aradı?',
        body: 'Numarayı (veya son hanelerini, örneğin `55 12 34`) “Kişiler” veya “Şirketler” aramasına yapıştırın — portal o telefonun kayıtlı olduğu kartı bulur.',
      },
    },
    {
      title: 'Modül ayarları (yöneticiler için)',
      body: `Ayarlar **Ayarlar → Modüller → Cari hesaplar** bölümündedir ve cari hesaplar yöneticisine açıktır.

- **Ülkeler** — varsayılan ülke ve sunulan ülkeler listesi (sıraları filtre sırasıdır).
- **Kartları kimler değiştirebilir** — “Herkes” (varsayılan) veya “Sorumlu, oluşturan ve yöneticiler”. Rehberi herkes her zaman görebilir.
- **İlişki türleri** — “Müşteri”, “Tedarikçi” ve diğerlerinin yanında yeniden adlandırın, rengini değiştirin veya kendi türlerinizi ekleyin.
- **Özel alanlar** — şirketler veya kişiler için ek alanlar: metin, uzun metin, sayı, tarih, liste, bağlantı; tüm ülkeler veya yalnızca seçilenler için.
- **Siciller** — KC Adalet Bakanlığı ve EGRUL anahtarsız çalışır; DaData bir anahtar gerektirir.`,
      steps: [
        'dadata.ru’ya kaydolun (ücretsiz plan günde 10 000 istek verir).',
        'Profilinizde “API keys”i açın ve **API key**’i kopyalayın (gizli anahtar gerekmez).',
        '“Siciller” bölümünde anahtarı DaData alanına yapıştırın ve “Kaydet”e basın.',
      ],
      note: 'Anahtar şifreli olarak saklanır; kaydettikten sonra yalnızca maskelenmiş bir ipucu gösterilir. Anahtar olmadan Rusya için ücretsiz EGRUL kullanılır, ancak vergi servisi bazen captcha ister — DaData istemez.',
    },
  ],
  faq: [
    {
      q: 'Neden “Sicilden doldur” düğmesi yok?',
      a: 'O ülke için bağlı bir kamu sicili yoktur. Otomatik doldurma Kırgızistan ve Rusya için çalışır; diğer ülkeler için kartı elle doldurun.',
    },
    {
      q: 'Sicil bu numarayla bir şirket olmadığını söylüyor, ama şirket var.',
      a: 'Numarayı ve ülkeyi kontrol edin: Kırgız INN’si 14, Rus INN’si 10 hanelidir (şahıs şirketleri için 12). Yeni kaydedilmiş bir şirket sicilde daha sonra görünebilir — kartı elle doldurun ve daha sonra yeniden kontrol edin.',
    },
    {
      q: 'Portal şirketin var olduğunu söylüyor, ama listede göremiyorum.',
      a: 'Büyük olasılıkla arşivlenmiştir — bağlantı “arşivde” olarak işaretlidir. Açın ve “Geri yükle”ye basın.',
    },
    {
      q: 'Bir kartı düzenleyemiyorum — alanlar kilitli.',
      a: 'Bir yönetici değişikliklere yalnızca sorumlu, oluşturan ve yöneticiler için izin verdi. Değişikliği yapmasını veya sizi sorumlu yapmasını sorumlu kişiden isteyin.',
    },
    {
      q: 'Bir müşterinin ayrılan çalışanını nasıl kaldırırım?',
      a: 'Silmeye gerek yok: işinde “Şirketten ayrıldı”ya basın. Kişi kariyer geçmişiyle kişiler arasında kalır ve başka bir cari hesaba katılırsa bulunabilir.',
    },
    {
      q: 'Puanımı değiştirebilir miyim?',
      a: 'Yenisini vermeniz yeterli — ortalamaya o sayılır, eskisi geçmişte “daha yeni bir puanla değiştirildi” olarak kalır.',
    },
    {
      q: '“Sicilden doldur”a basarsam telefonlarım kaybolur mu?',
      a: 'Hayır. Zaten yazdığınız telefonlar ve e-postalar korunur; sicil diğer alanları doldurur.',
    },
    {
      q: 'DaData anahtarına ihtiyacımız var mı?',
      a: 'Yalnızca Rus şirketleriyle çalışıyorsanız. Anahtar olmadan ücretsiz EGRUL kullanılır; anahtarla ayrıca tam adres, OKVED, OKPO ve durum da gelir, captcha olmadan. Kırgızistan anahtar gerektirmez.',
    },
  ],
  fields: {
    country: {
      title: 'Ülke',
      text: 'Önce bunu seçin: ülke numaraları, kontrollerini, hukuki biçimleri ve otomatik doldurma için sicili belirler.',
    },
    primaryId: {
      title: 'Ana numara',
      text: 'INN, BIN, UNP veya ülkenin diğer numarası. Kartı sicilden doldurmak ve mükerrer kayıtları bulmak için kullanılır. Sicile sormak için Enter’a basın.',
    },
    fillFromRegistry: {
      title: 'Sicilden doldur',
      text: 'Bilgiler kamu sicilinden gelir ve resmî sicil özeti eklenir. Elle yazılan telefonlar ve e-postalar korunur.',
    },
    duplicates: {
      title: 'Olası mükerrer kayıt',
      text: 'Bu numaraya sahip bir şirket zaten var — bağlantıdan açın. “Yine de oluştur”u yalnızca gerçekten ayrı bir kayıtsa kullanın.',
    },
    relations: {
      title: 'İlişki',
      text: 'Müşteri, tedarikçi, iş ortağı… Birkaçını seçebilirsiniz. Şirket listesi buna göre filtrelenebilir.',
    },
    owner: {
      title: 'Sorumlu',
      text: 'Bu cari hesapla ilgilenen çalışan. Onun “Şirketlerim” listesinde görünür.',
    },
    tags: {
      title: 'Etiketler',
      text: 'Kendi işaretleriniz için herhangi sözcükler: VIP, ihale, Oş. Bir sözcük yazın ve Enter’a veya virgüle basın.',
    },
    verify: {
      title: 'Sicil kontrolü',
      text: 'Kartın boş alanları önceden seçilidir. Farklı değerleri kendiniz işaretleyin — alınan değişiklikler ve sicil özeti geçmişe kaydedilir.',
    },
    workplace: {
      title: 'Çalıştığı yer',
      text: 'Kişiyi hemen bir şirkete bağlayın. Daha fazla iş sonra eklenebilir — bir kişi birkaç şirkette çalışabilir.',
    },
    decisionMaker: {
      title: 'Karar verici',
      text: 'Fırsatları onaylayan ve belgeleri imzalayan kişileri işaretleyin — şirket kartında önce onlar gösterilir.',
    },
    leaveNext: {
      title: 'Sonra ne olacak?',
      text: 'Kişi başka bir cari hesaba geçtiyse “Başka bir şirkete geçiyor”u seçin — yeni iş hemen oluşturulur.',
    },
    rating: {
      title: 'Puanınız',
      text: 'En son puanınız ortalamaya sayılır; ölçütler ve yorum isteğe bağlıdır ama iş arkadaşlarınıza yardımcı olur.',
    },
    editPolicy: {
      title: 'Kartları kimler değiştirebilir',
      text: '“Herkes” — herkes kartları değiştirebilir. Diğer seçenek bunu sorumluya, oluşturana ve yöneticilere bırakır. Rehberi herkes görebilir.',
    },
    relationTypes: {
      title: 'İlişki türleri',
      text: '“İlişki” alanının seçenekleri. Yeniden adlandırın, rengini değiştirin veya kendi türlerinizi ekleyin.',
    },
    customFields: {
      title: 'Özel alanlar',
      text: 'Şirketler veya kişiler için ek alanlar — tüm ülkeler veya yalnızca seçilenler için. Formda “Ek alanlar” altında görünürler.',
    },
    dadataKey: {
      title: 'DaData anahtarı',
      text: 'Yalnızca Rus şirketleri için gereklidir: captcha olmadan tam adres, OKVED, OKPO ve durum ekler. dadata.ru profilinizdeki API key’i yapıştırın — gizli anahtar gerekmez.',
    },
  },
};
