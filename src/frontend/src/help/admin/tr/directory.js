export default {
  purpose: 'AD dizini, tek bir OU — yönetilen kök — içindeki Active Directory hesaplarını gösterir ve değiştirir: OU ağacı, kullanıcılar, gruplar ve bilgisayarlar, durum, parola, son oturum açma, grup üyeliği. Her değişiklik işlemi yapan yöneticinin kendi etki alanı hesabıyla yürütülür, onay gerektirir ve günlüğe yazılır. AD hesaplarını portal kullanıcılarına ve çalışan kartlarına bağlar.',
  audience: 'Sistem yöneticileri ve yardım masası: işe başlama ve ayrılış işlemleri, parola sıfırlama, kilit açma, etkin olmayan hesapları bulma.',
  setup: [
    {
      title: 'Active Directory’yi bağlayın',
      text: '[AD entegrasyonu](/admin/settings/ad) bölümünde — etki alanı denetleyicisi ve yönetilen kökü **okuyabilen** bir **hizmet hesabı** (varsayılan olarak her etki alanı hesabı okuyabilir). Hizmet hesabı yalnızca okur: hiçbir şeyi değiştirmez. Entegrasyon olmadan da modül açılabilir — sayfası kurulumu açıklar ve bir süper yönetici demo dizinini doldurabilir.',
    },
    {
      title: 'Kökü ve hariç tutulanları seçin',
      text: '[Modül ayarları](/admin/settings/directory) bölümünde — **yönetilen kök**, örneğin `OU=Accounts,DC=example,DC=local` («Göz at» dizinde temel DN’den başlayarak gezinir). Kökün üstündeki hiçbir şey gösterilmez veya değiştirilmez. **Hariç tutulan OU’lar** — tam bir DN (OU ve altındaki her şey) veya bir ad kalıbı (`Service*`, `Admins`): bunlar ağaçta, listelerde ve aramada hiçbir zaman görünmez; özel olarak hazırlanmış bir DN içeren istek de reddedilir. **Gizli hesaplar** — oturum açma adı kalıpları (`svc_*`, `adm-*`).',
    },
    {
      title: 'Parolalar için güvenli kanal',
      text: 'Active Directory yeni bir parolayı (`unicodePwd`) yalnızca şifreli bağlantı üzerinden kabul eder. Entegrasyonda «TLS kullan» (LDAPS, bağlantı noktası 636) seçeneğini veya modül ayarlarında **StartTLS**’i açın — etki alanı denetleyicisinde sertifika gerekir. Ayarlardaki «Kontrol et» çalışıp çalışmadığını gösterir. Bu olmadan diğer her şey düz LDAP üzerinden çalışır, parola sıfırlama ise kapalıdır — iletişim kutusu bunu belirtir. Parolalar hiçbir zaman saklanmaz.',
    },
    {
      title: 'AD’de yöneticilere yetki devredin',
      text: 'Değişiklikler portal yöneticisinin **kendi AD hesabıyla** yürütülür («Dosya sunucusu → Erişim» bölümündeki gibi): portal etki alanı parolasını bir kez ister, etki alanında oturum açarak doğrular ve şifreli olarak saklar. Bu nedenle izinler AD’de yer alır: örneğin `OU=Accounts` üzerinde yardım masası grubuna «Reset password», «Read/Write lockoutTime», «Read/Write pwdLastSet» yetkilerini; yöneticilere ise kullanıcı oluşturma, öznitelik yazma, taşıma ve gruplarda «Write Members» yetkilerini devredin.',
    },
    {
      title: 'Portal rollerini verin',
      text: '`ad.view`, `ad.manage`, `ad.passwords`, `ad.admin` izinleri — Roller bölümünde. Portal rolü ek bir katmandır: son kararı yine Active Directory verir. Oturum açma adı şablonunu, UPN soneklerini, yeni ve ayrılan kullanıcılar için OU’ları ayarlayın — modül hazır.',
    },
  ],
  roles: {
    'ad.view': 'Ağaç, listeler, kartlar, günlük. Hiçbir şeyi değiştirmez.',
    'ad.manage': 'Kullanıcı oluşturma, öznitelikler, taşıma, etkinleştirme / devre dışı bırakma, kilit açma, grup üyeliği (klasör erişim grupları `sg_…` hariç).',
    'ad.passwords': '«Sonraki oturum açmada değiştirmeli» seçeneğiyle parola sıfırlama ve kilit açma — yardım masası için. LDAPS veya StartTLS gerekir.',
    'ad.admin': 'Korumalı yönetici hesapları (`adminCount`) dahil her şey.',
  },
  access: 'API belirteçleri modüle hiçbir zaman erişemez; «olarak oturum aç» oturumu yalnızca okur. Klasör erişim grupları (`sg_…`) kartta gösterilir, ancak yalnızca «Dosya sunucusu → Erişim» bölümünde değiştirilir.',
  scenarios: [
    {
      title: 'Bir çalışanın işe başlaması',
      text: 'Çalışan kartında — «AD hesabı» sekmesi → «Çalışan için AD kullanıcısı oluştur»: adlar ve unvan doldurulur, oturum açma adı şablona göre oluşur (`{f}.{last}` → `a.smith`, alınmışsa sonuna numara eklenir), birimin OU’su, «sonraki oturum açmada değiştirmeli» seçeneğiyle ilk parola, gruplar. Ardından AD kartında «Portal kullanıcısı oluştur» — çalışan etki alanı kullanıcı adıyla oturum açar.',
    },
    {
      title: 'Ayrılış işlemi',
      text: 'Hesapları seçin → «Ayrılış işlemi»: önizleme, herhangi bir şey değişmeden önce neyin devre dışı bırakılıp devre dışı OU’ya (örneğin `OU=Disabled`) taşınacağını ve neyin reddedileceğini (hariç tutulan, korumalı) gösterir. Onaydan sonra her şey günlüğe yazılır.',
    },
    {
      title: 'Yardım masası tarafından parola sıfırlama',
      text: 'Kişiyi kök genelinde aramayla bulun → «Parolayı sıfırla»: «Oluştur», «sonraki oturum açmada değiştirmeli», isterseniz kilidi de açın. Parola yalnızca LDAPS/StartTLS üzerinden iletilir ve saklanmaz; yüz yüze veya telefonla iletin.',
    },
    {
      title: 'Etkin olmayan hesaplar',
      text: '«Etkin olmayanlar» bölümü — N günden uzun süredir (bir ayar) veya hiç oturum açmamış hesaplar. Gözden geçirin, ardından toplu olarak devre dışı bırakın veya taşıyın. AD, `lastLogonTimestamp` değerini iki haftaya varan bir gecikmeyle günceller — bu beklenen bir durumdur.',
    },
  ],
  faq: [
    {
      q: 'Parola sıfırlama neden kullanılamıyor?',
      a: 'Güvenli kanal yok: Active Directory düz LDAP üzerinden parola kabul etmez. Entegrasyonda LDAPS’i veya modül ayarlarında StartTLS’i açın ve «Kontrol et»e basın.',
    },
    {
      q: '«Active Directory reddetti: izin yok» ne anlama gelir?',
      a: 'Portal izin verdi, ancak AD hesabınızın o OU üzerinde devredilmiş bir yetkisi yok. Yetki devri isteyin — portal AD izinlerini hiçbir zaman atlamaz.',
    },
    {
      q: 'Yeni kullanıcı neden devre dışı?',
      a: 'Active Directory parolası olmayan bir hesabı etkinleştirmez. Parolayı karttan belirleyin (LDAPS/StartTLS gerekir).',
    },
    {
      q: 'sg_… gruplarını nerede yönetirim?',
      a: '«Dosya sunucusu → Erişim» bölümünde: orada klasörlere ve NTFS izinlerine bağlıdırlar. AD kartı bunları bir bağlantıyla salt okunur olarak gösterir.',
    },
    {
      q: 'Modülü AD olmadan deneyebilir miyim?',
      a: 'Evet: bir süper yönetici demo dizinini doldurur (modülün demo verileri). «Demo dizini» etiketiyle işaretlenir, LDAP çağrısı yapmaz ve demo verileriyle birlikte kaldırılır.',
    },
  ],
};
