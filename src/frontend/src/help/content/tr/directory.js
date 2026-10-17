export default {
  title: 'AD dizini',
  tagline: 'Şirketin Active Directory hesapları — bulun, kontrol edin, yardım edin, oluşturun.',
  summary: 'AD dizini, etki alanının kullanıcılarını, gruplarını ve bilgisayarlarını izin verilen kısımda (yönetilen kök) gösterir. Bir kişiyi bulun, hesabın kilitli olup olmadığını ve en son ne zaman oturum açtığını görün, parolayı sıfırlayın, yeni bir çalışan için hesap oluşturun veya ayrılan birinin hesabını devre dışı bırakın. Her işlem sizin kendi AD hesabınızla yürütülür ve günlüğe yazılır.',
  highlights: [
    {
      title: 'OU ağacı',
      text: 'Nesne sayılarıyla birimler; hizmet OU’ları gizlidir.',
    },
    {
      title: 'Arama ve filtreler',
      text: 'Kök genelinde: devre dışı, kilitli, parolasının süresi dolmuş, etkin olmayan.',
    },
    {
      title: 'Kart',
      text: 'Durum, parola, son oturum açma, gruplar, portala ve çalışana bağlantılar.',
    },
    {
      title: 'Parola sıfırlama',
      text: 'Oluşturucu ve «sonraki oturum açmada değiştirmeli» seçeneğiyle; yalnızca güvenli kanal üzerinden.',
    },
    {
      title: 'Yeni kullanıcı sihirbazı',
      text: 'Kullanılabilirlik kontrolüyle şablondan kullanıcı adı, OU, parola, gruplar.',
    },
    {
      title: 'Günlük',
      text: 'Kim neyi, hangi AD hesabıyla değiştirdi.',
    },
  ],
  tips: [
    'Arama yalnızca seçili OU’yu değil, tüm kökü kapsar.',
    'Sol menüdeki «Etkin olmayanlar», «Kilitliler», «Devre dışı olanlar» hazır listelerdir.',
    'Sütun seçimi (listenin üstündeki dişli) tarayıcıda hatırlanır.',
    'Birkaç satır seçin — önizlemeli toplu işlemler belirir.',
    'Yeni bir parolayı sohbette değil, yüz yüze veya telefonla iletin.',
  ],
  sections: [
    {
      title: 'Ağaç ve listeler',
      body: `Solda — yönetilen kök içindeki birimler (OU’lar); sayı, kaç kullanıcı, grup ve bilgisayar içerdiğini gösterir. Sağda — seçili OU’nun nesneleri; «Alt OU’lar» iç içe olanları da gösterir.

Filtreler: nesne türü ve durum — **devre dışı**, **kilitli**, **parolanın süresi doldu**, **hiç oturum açmamış**, **N gündür etkin değil**. Telefonda ağaç, OU adını gösteren düğmeyle açılır.`,
    },
    {
      title: 'Kart',
      body: `Bir satıra tıklayın. Kart kullanıcı adını ve UPN’yi, unvanı, departmanı, yöneticiyi, telefonları, OU’yu, **durumu** (etkin / devre dışı / kilitli), parolanın ne zaman belirlendiğini ve süresinin ne zaman dolacağını, son oturum açmayı, türleriyle birlikte **grupları** ve portal üzerinden yapılan değişikliklerin **geçmişini** gösterir.

Klasör erişim grupları (\`sg_…\`) burada salt okunurdur — «Dosya sunucusu → Erişim» bölümünden yönetilir.`,
    },
    {
      title: 'Parola sıfırlama ve kilit açma',
      steps: [
        'Kartı açın ve «Parolayı sıfırla»ya basın.',
        '«Oluştur»a basın veya bir parola yazın — alttaki liste parolanın uygun olup olmadığını gösterir.',
        '«Sonraki oturum açmada değiştirmeli» seçeneğini işaretli bırakın ve gerekirse «Hesabın kilidini de aç»ı işaretleyin.',
        'Onaylayın ve iletmek için parolayı kopyalayın.',
      ],
      note: 'Düğme «güvenli kanal yok» notuyla kapalıysa — Active Directory parolaları yalnızca LDAPS/StartTLS üzerinden kabul eder. Bunu bir yönetici ayarlar.',
    },
    {
      title: 'Yeni kullanıcı',
      body: `«Yeni kullanıcı» sihirbazı açar: adlar → kullanıcı adı (şirket şablonundan, tüm etki alanında kontrol edilir) → OU → UPN ve e-posta → ilk parola → gruplar → kontrol. Parola olmadan hesap devre dışı olarak oluşturulur.

Bir çalışan kartındaki «Çalışan için AD kullanıcısı oluştur» aynı işlemi alanlar doldurulmuş olarak yapar.`,
    },
    {
      title: 'Toplu işlemler ve ayrılış işlemi',
      body: 'Satırları seçin — listenin üstünde «Devre dışı bırak», «Etkinleştir», «Taşı» ve «Ayrılış işlemi» (devre dışı bırakma ve devre dışı OU’ya taşıma) belirir. Önce bir önizleme gelir: neyin değişeceği ve neyin atlanacağı. Siz onaylamadan hiçbir şey değişmez.',
    },
    {
      title: 'Portal etki alanı parolamı neden istiyor',
      body: 'AD’deki değişiklikler **sizin** AD hesabınızla yürütülür — böylece izinlerinizi Active Directory’nin kendisi kontrol eder ve günlük kimin ne yaptığını gösterir. Parola bir kez girilir, etki alanı denetleyicisi tarafından doğrulanır ve şifreli olarak saklanır (Dosya sunucusundakiyle aynı şekilde).',
    },
  ],
  faq: [
    {
      q: 'Bazı OU’ları neden göremiyorum?',
      a: 'Hizmet ve yönetici OU’ları modül ayarlarıyla gizlenir; yönetilen kökün üstündeki hiçbir şey ise hiç gösterilmez.',
    },
    {
      q: '«Son oturum açma» geride kalıyor',
      a: 'Active Directory bunu iki haftaya varan bir gecikmeyle günceller — uzun süredir etkin olmayan hesapları bulmak için yeterlidir.',
    },
    {
      q: 'Bir grubu değiştirdim ama erişim yok',
      a: 'Grup üyeliği, kişinin bir sonraki Windows oturum açmasında uygulanır.',
    },
    {
      q: '«Demo dizini» nedir?',
      a: 'Gerçek bir etki alanı olmadan demo verileri: hiçbir şeyi bozmadan her şeyi deneyin.',
    },
  ],
};
