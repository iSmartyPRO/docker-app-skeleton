export default {
  purpose: 'Takvim toplantıları, ekiplerin ve toplantı odalarının paylaşılan takvimlerini, yanıtlı davetleri ve görev son tarihlerini bir araya getirir. Kişiler günlerini tek yerde, yanında Google Takvim ile birlikte görür.',
  audience: 'Tüm çalışanlar; paylaşılan takvimleri (toplantı odaları, tatiller, şirket etkinlikleri) ofis yöneticisi yürütür.',
  setup: [
    {
      title: 'Çalışma gününü ayarlayın',
      text: '[Ayarlar](/admin/settings/calendar) bölümünde: haftanın ilk günü, çalışma saatleri, varsayılan görünüm ve varsayılan hatırlatıcı. Herkes bunları kendisi için değiştirebilir.',
    },
    {
      title: 'Paylaşılan takvimleri kimin oluşturacağına karar verin',
      text: '«Herkes» veya «Yalnızca yöneticiler» (calendar.admin).',
    },
    {
      title: 'Paylaşılan takvimler oluşturun',
      text: 'Örneğin «Toplantı odası», «Tatiller», «Şirket etkinlikleri» oluşturun ve gruplara görüntüleme veya düzenleme erişimi verin.',
    },
    {
      title: 'Google’ı bağlayın (isteğe bağlı)',
      text: '[Google entegrasyonu](/admin/settings/google) bölümünde takvimi açın — kişiler Google takvimlerini portalda gösterebilir.',
    },
  ],
  roles: {
    'calendar.admin': 'Tüm paylaşılan takvimleri yönetme. Kişisel takvimler yöneticiye karşı da gizli kalır.',
  },
  scenarios: [
    {
      title: 'Toplantı odası rezervasyonu',
      text: 'Herkesin düzenleyebildiği paylaşılan bir «Toplantı odası» takvimi: bir zaman dilimini ayırmak, bu takvime etkinlik eklemek demektir.',
    },
    {
      title: 'Pazartesi kısa toplantısı',
      text: 'Katılımcıları olan yinelenen bir etkinlik: her katılımcı bir davet ve 15 dakika önce bir hatırlatıcı alır.',
    },
  ],
  faq: [
    {
      q: 'Takvimimde neden görevler var?',
      a: 'Görevler açıkken takvim, kişinin katıldığı görevlerin son tarihlerini gösterir. Bu, kişisel ayarlardan kapatılabilir.',
    },
    {
      q: 'Hatırlatıcılar nasıl iletilir?',
      a: 'Bildirim merkezi üzerinden: portalda ve kişinin seçtiği kanallarla (e-posta, Telegram vb.).',
    },
    {
      q: 'Google eşitlemesi çift yönlü mü?',
      a: 'Google takvimleri canlı olarak gösterilir; kişi erişim izni verdiyse portaldan bu takvimlerde etkinlik oluşturulabilir.',
    },
  ],
};
