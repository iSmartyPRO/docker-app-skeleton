export default {
  purpose: 'Çalışanlar, portal erişimi olmayanlar da dahil şirkette çalışan herkesin kayıt listesidir: inşaat işçileri, şoförler, mevsimlik personel. Kart; pozisyonu, birimi ve şantiyeyi, amiri, iletişim bilgilerini, İK verilerini, belgeleri, becerileri ve hatırlatıcılı yetki belgelerini tutar. Karttan tek tıklamayla portal hesabı oluşturulabilir.',
  audience: 'Kartları İK tutar; amirler ve iş arkadaşları rehberi ve organizasyon şemasını kullanır; yönetici erişimi ve pozisyonları ayarlar.',
  setup: [
    {
      title: 'Organizasyon yapısı',
      text: 'Önce [organizasyon yapısını](/admin/settings/org) oluşturun: çalışanlar onun birimlerine ve şantiyelerine bağlıdır.',
    },
    {
      title: 'Modülü açın',
      text: 'Varsayılan olarak kapalıdır: «Ayarlar → Modüller → Çalışanlar».',
    },
    {
      title: 'İzinler',
      text: 'İK’ya `employees.hr` (hesap oluşturmak için `users.manage` de), amirlere `employees.view`, modül yöneticisine `employees.admin` verin. Veya «Herkes için rehber» seçeneğini açın.',
    },
    {
      title: 'Pozisyonlar ve içe aktarma',
      text: 'Pozisyon rehberini doldurun veya kişileri Excel’den yükleyin: içe aktarma her satırı kontrol eder ve yeni pozisyonları ekler.',
    },
    {
      title: 'Yetki belgeleri ve hatırlatıcılar',
      text: 'Yetki belgesi hatırlatıcılarının kaç gün önceden (varsayılan olarak 30 ve 7 gün önce ve günün kendisinde) ve kime gideceğini seçin.',
    },
  ],
  roles: {
    'employees.view': 'Rehber: çalışan kişilerin adı, fotoğrafı, pozisyonu, birimi, şantiyesi, amiri ve iş iletişim bilgileri. Kişisel veri yok.',
    'employees.hr': 'Her şey: işten ayrılanlar ve adaylar, kişisel iletişim bilgileri, doğum tarihi, sicil numarası, belgeler, yetki belgeleri, notlar; kart oluşturma ve hesap bağlama. Hesap oluşturmak ve engellemek için `users.manage` de gerekir.',
    'employees.admin': 'Pozisyon rehberi ve modül ayarları.',
  },
  access: 'Görünürlüğe her yanıtta sunucu karar verir: `employees.hr` olmadan kişisel alanlar hiçbir zaman gönderilmez. Bağlı hesabı olan bir çalışan kendi kartını kişisel verileriyle (İK notları olmadan) her zaman görür ve iletişim bilgilerini düzeltebilir.',
  scenarios: [
    {
      title: 'Erişimli yeni bir çalışan',
      text: 'İK kartı oluşturur, «Portal hesabı» sekmesinde «Kullanıcı oluştur»a basar, tek kullanımlık kodları ve bir grubu seçer — kişi hemen oturum açabilir.',
    },
    {
      title: 'Portal kullanmayan bir montajcı',
      text: 'Hesapsız bir kart: «Kuzey Mahallesi» şantiyesi, ay sonuna kadar geçerli yüksekte çalışma yetki belgesi. Yedi gün önce İK’ya ve şantiye şefine hatırlatılır.',
    },
    {
      title: 'İşten çıkış',
      text: '«İşten çıkar» tarihi ve durumu belirler ve portal hesabını engellemeyi önerir — erişim tek adımda kapanır.',
    },
  ],
  faq: [
    {
      q: 'Mevcut bir kullanıcıyı nasıl bağlarım?',
      a: 'Kart → «Portal hesabı» → «Mevcut bir kullanıcıyı bağla». Bir hesap, bir kart. Bağlı hesap birimini ve pozisyonunu karttan alır.',
    },
    {
      q: 'İş arkadaşları doğum günlerini görür mü?',
      a: 'Yalnızca gün ve ayı ve yalnızca ayarlarda «Herkese» seçiliyse. Bunları yalnızca İK’ya açık tutabilir veya kapatabilirsiniz.',
    },
    {
      q: 'AD hesabı nerede?',
      a: 'Active Directory entegrasyonu açıkken kartta «AD hesabı» alanı görünür. AD dizini modülü karta kendi sekmesini ekler.',
    },
    {
      q: 'Depo, Görevler, Master plan çalışanları kullanıyor mu?',
      a: 'Şimdilik portal hesaplarıyla çalışıyorlar. Kart–hesap bağlantısı ve çalışan seçici hazır; modüller adım adım bunlara geçecek.',
    },
  ],
};
