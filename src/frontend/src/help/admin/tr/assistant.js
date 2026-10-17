export default {
  purpose: 'Robot asistan her sayfada bulunan güler yüzlü bir karakterdir: bir bölüme ilk girişte ipuçları sunar, kısa ve tam kılavuzu açar, yardımda arama yapar. Yöneticiye daha az «nerede bu?» sorusu gelir.',
  audience: 'Tüm çalışanlar, özellikle yeni başlayanlar.',
  setup: [
    {
      title: 'Varsayılan karakteri seçin',
      text: '[Ayarlar](/admin/settings/assistant) bölümünde. Herhangi bir karaktere, yalnızca seçilenlere veya herkes için tek bir karaktere (örneğin şirket maskotu) izin verin.',
    },
    {
      title: 'Bölüm ipuçlarını açın',
      text: 'Robot her yeni bölümde bir kez yardım önerir.',
    },
    {
      title: 'Renklere izin verin',
      text: 'Kişiler kendi karakterlerinin rengini değiştirebilir.',
    },
  ],
  scenarios: [
    {
      title: 'Portalın kullanıma açılması',
      text: 'İlk haftalarda robot her bölümde yardımcı olur; daha sonra kişiler onu Görünüm bölümünden gizler.',
    },
    {
      title: 'Tek tarz',
      text: '«Herkes için bir tane» — tüm şirket aynı yardımcıyı görür.',
    },
  ],
  faq: [
    {
      q: 'Robot rahatsız ediyor — nasıl gizlenir?',
      a: 'Herkes onu Kişisel alan → Görünüm bölümünden gizleyebilir; yönetici modülü tamamen kapatabilir.',
    },
    {
      q: 'Yanıtlar nereden geliyor?',
      a: 'Portalın yerleşik yardımından; harici hizmet kullanılmaz.',
    },
  ],
};
