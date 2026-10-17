export default {
  purpose: 'CRM, fırsatları satış hattı aşamaları boyunca ilerletir: kanban, liste, aktiviteler ve takvim, özel alanlar ve birden çok satış hattı. Müşteriler, ayrı bir kopya olmadan Cari hesaplar’daki şirketler ve kişilerdir.',
  audience: 'Satış ekibi ve satış müdürü.',
  setup: [
    {
      title: 'Satış hatları ve aşamalar',
      text: 'Bir satış hattı ve aşamalar oluşturun; son ikisi «Kazanıldı» ve «Kaybedildi»dir.',
    },
    {
      title: 'Para birimleri ve alanlar',
      text: '[Ayarlar](/admin/settings/crm) bölümünde: varsayılan para birimi, para birimleri listesi, özel fırsat alanları ve bölümleri.',
    },
    {
      title: 'Görünürlük',
      text: 'Satış temsilcilerinin yalnızca kendi fırsatlarını mı yoksa tümünü mü göreceği.',
    },
    {
      title: 'Cari hesapları açın',
      text: 'Müşterileri rehberden seçmek ve fırsatları şirket kartında görmek için.',
    },
  ],
  roles: {
    'crm.admin': 'Ayarlar, satış hatları ve tüm fırsatlar.',
    'crm.all': 'Tüm fırsatları görür ve düzenler — satış müdürü için.',
  },
  scenarios: [
    {
      title: 'Gelen potansiyel müşteri',
      text: 'Satış temsilcisi bir fırsat oluşturur, şirketi seçer, bir arama planlar — aktivite takvimde görünür.',
    },
    {
      title: 'Satış müdürü için rapor',
      text: 'crm.all izniyle satış müdürü tüm ekibin kanbanını ve aşama başına toplamları görür.',
    },
  ],
  faq: [
    {
      q: 'Birden çok satış hattı?',
      a: 'Evet, her birinin kendi aşamaları vardır; biri varsayılandır.',
    },
    {
      q: 'Zorunlu alanlar?',
      a: 'Bir alan formda zorunlu yapılabilir; API bu tür fırsatları reddetmez.',
    },
  ],
};
