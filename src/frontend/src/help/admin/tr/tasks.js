export default {
  purpose: 'Görevler, atamalar için ortak araçtır: kendi durumları olan projeler, pano ve liste, son tarihler, hatırlatıcılar, her görevde sonuç ve sohbet. Yöneticiler kimin ne yaptığını ve neyin geciktiğini tablolar veya mesajlaşma yazışmaları olmadan görür.',
  audience: 'Tüm çalışanlar. Yöneticiler atama yapar ve son tarihleri izler, sorumlular görevleri kabul eder ve sonuçları teslim eder, görev yöneticisi projeleri ve kuralları ayarlar.',
  setup: [
    {
      title: 'Projeleri kimin oluşturacağına karar verin',
      text: '[Modül ayarları](/admin/settings/tasks) bölümünde «Herkes» veya «Yalnızca yöneticiler» seçeneğini belirleyin. «Herkes» küçük şirketler için uygundur.',
    },
    {
      title: 'Kabul sürelerini ayarlayın',
      text: 'Sorumlunun «Kabul et» düğmesine basmak için kaç saati olduğu — normal ve önemli görevler için. Zamanında kabul edilmeyen görev vurgulanır ve oluşturana bildirim gider.',
    },
    {
      title: 'Yönetim grubunu belirleyin',
      text: 'Seçilen grupların üyelerinin verdiği görevler «Talimat» olur: ayrı listelenir ve sessizce reddedilemez.',
    },
    {
      title: 'Departman projeleri oluşturun',
      text: 'Proje anahtarı (örneğin `HR`) görev numaralarının önüne eklenir. Erişim: «Herkes, düzenleyebilir», «Herkes, salt okunur» veya «Yalnızca ben» — daha sonra gruplara ve rollere göre ayrıntılandırın.',
    },
    {
      title: 'tasks.admin izni verin',
      text: 'Tüm projeleri yönetenlere (ofis yöneticisi veya PMO) — «Roller» bölümündeki bir rol aracılığıyla.',
    },
  ],
  roles: {
    'tasks.admin': 'Tüm projeleri (durumlar, erişim, arşiv) ve modül ayarlarını yönetme. Başkalarının projesiz kişisel görevleri yöneticiye karşı da gizli kalır.',
  },
  access: 'Erişim proje bazında ayarlanır: görüntüleme, düzenleme veya yönetme — herkes, bir kullanıcı, bir grup veya bir rol için. Görev katılımcıları (oluşturan, sorumlu, ortak sorumlular, gözlemciler) proje düzeyinden bağımsız olarak görevi görür.',
  scenarios: [
    {
      title: 'Direktörün talimatları',
      text: 'Direktör «Yönetim» grubundadır. Verdiği görevler talimat olarak işaretlenir, sorumlu 4 saat içinde kabul etmelidir ve gecikmiş olanlar panoda görünür.',
    },
    {
      title: 'Yinelenen görevler',
      text: 'Muhasebe «aylık, ayın 25’inde» zamanlanmış bir «Tedarikçi mutabakatı» şablonu oluşturur — görev kendiliğinden oluşur ve sorumlu kişiye gider.',
    },
    {
      title: 'Talep akışı',
      text: 'BT ekibi bir «BT talepleri» akışı kurar: yeni görevler ekip üyelerine sırayla dağıtılır.',
    },
  ],
  faq: [
    {
      q: 'Modül kapatılırsa görevlere ne olur?',
      a: 'Gizlenir, silinmez. Modülü yeniden açmak her şeyi geri getirir.',
    },
    {
      q: 'Bir görevin neden sohbeti yok?',
      a: 'Görev sohbeti Sohbetler modülünün bir parçasıdır. Modülü açın, her görev kendi tartışmasına kavuşsun.',
    },
    {
      q: 'Proje anahtarı değiştirilebilir mi?',
      a: 'Hayır — anahtar görev numaralarının ve bağlantıların bir parçasıdır, bu yüzden kalıcıdır.',
    },
    {
      q: 'Son tarihler takvimde gösteriliyor mu?',
      a: 'Evet, Takvim açıkken: herkes görev son tarihlerini toplantılarının yanında görür.',
    },
  ],
};
