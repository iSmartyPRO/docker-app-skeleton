export default {
  purpose: 'Organizasyon yapısı, şirketin portaldaki haritasıdır: tüzel kişi, genel merkez, şubeler, departmanlar ve şantiyeler, amirleriyle birlikte. Bir çekirdek hizmetidir ve her zaman açıktır. Onaylar bir belgeyi «oluşturanın biriminin yöneticisine» yönlendirir, modüller birimleri amaçlarına göre seçer (bir şantiyenin depoları, inşaat şantiyeleri), organizasyon şeması kimin kime bağlı olduğunu gösterir.',
  audience: 'Ağacı portal yöneticisi veya İK oluşturur; amirler ve çalışanlar organizasyon şemasını görür; modüller ve Onaylar onu kendiliğinden kullanır.',
  setup: [
    {
      title: 'Birim türleri',
      text: '«Türler ve amaçlar» sekmesinde türleri kontrol edin: varsayılan olarak Şirket, Genel merkez, Şube, Departman, Şantiye. Bunları şirketinize göre yeniden adlandırın veya kendi türlerinizi ekleyin (örneğin «Mağaza»).',
    },
    {
      title: 'Şirket ve tüzel kişisi',
      text: '«Şirket» türünde en üst düğümü oluşturun ve [tüzel kişiler rehberindeki](/admin/settings/legalEntities) bir tüzel kişiye bağlayın. Bir şirketler grubunda her tüzel kişi için bir düğüm oluşturulur.',
    },
    {
      title: 'Ofisler, şubeler, departmanlar, şantiyeler',
      text: 'Birimleri ekleyin ve sürükleyerek yerlerine yerleştirin. Saat dilimini yalnızca farklı olduğu yerde belirleyin: diğerleri bunu üst birimden devralır.',
    },
    {
      title: 'Amirler',
      text: 'Her birime bir amir verin — bir çalışan (Çalışanlar modülüyle) veya bir portal hesabı. Amir yoksa soru bir üst birime gider.',
    },
    {
      title: 'Birimlerdeki kişiler',
      text: 'Çalışanlar modülü olmadan hesapları birimlere yerleştirin — birim kartında veya «Kullanıcılar → bir kişi → Organizasyon yapısı» bölümünde. Modül açıkken birim çalışan kartından gelir.',
    },
    {
      title: 'Onay akışları',
      text: '[Onay akışları](/admin/settings/approvals) bölümünde onaylayanı «Oluşturanın biriminin yöneticisi» olan bir aşama ekleyin. Tam olarak kimin onaylayacağını görmek için önizlemede bir oluşturan seçin.',
    },
  ],
  roles: {
    'org.manage': 'Ağacı, türleri ve amaçları değiştirir, kişileri yerleştirir. Oturum açmış herkes yapıyı görüntüleyebilir.',
  },
  access: 'Oturum açmış herkes yapıyı okur — bu, şirketin ortak haritasıdır. Bir hesabın birimini `org.manage` veya `users.manage` iznine sahip olanlar değiştirir.',
  scenarios: [
    {
      title: 'Talep amire gider',
      text: '«Finans» departmanından bir muhasebeci satın alma talebi oluşturur — önce departman amiri onaylar. Talebi amir oluşturursa direktör onaylar.',
    },
    {
      title: 'Yeni bir şube',
      text: 'Şehrin saat dilimiyle «Kuzey şubesi»ni oluşturun, satış ekibini ve şantiyeyi içine sürükleyin — onaylar ve son tarihler hemen yeni yere uyar.',
    },
    {
      title: 'Yeniden yapılanma',
      text: 'Bir ekip başka bir departmana geçiyor: sürükleyin. Taşıma, birimin geçmişinde ve etkinlik günlüğünde görünür; devam eden onaylar olduğu gibi kalır.',
    },
  ],
  faq: [
    {
      q: 'Bir birimi nasıl silerim?',
      a: 'Yalnızca alt birimi ve kişisi olmayan boş bir birim silinebilir. Aksi halde kapatın — «Kapalı» geçmişi korur ve birim seçicilerden kaybolur.',
    },
    {
      q: 'Amir bulunamazsa ne olur?',
      a: 'Aşamayı onay akışının üst makama iletme kişileri, onlar da yoksa modül yöneticileri onaylar. Süreç geçmişi bunu not eder.',
    },
    {
      q: 'Çalışanlar modülüne ihtiyacım var mı?',
      a: 'Hayır. Yapı yalnızca portal hesaplarıyla da çalışır. Çalışanlar modülü portal erişimi olmayan kişileri, açıkça belirlenmiş amirleri ve kadro sayısını ekler.',
    },
    {
      q: 'Bir taşımayı geri alabilir miyim?',
      a: 'Bıraktıktan hemen sonra «Geri al» düğmesi çıkar. Daha sonra birimi geri sürükleyin; her iki taşıma da geçmişte kalır.',
    },
  ],
};
