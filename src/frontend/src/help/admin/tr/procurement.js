export default {
  purpose: 'Satın alma, bir talebi faturadan teslimata kadar yürütür: çalışan talebi faturayla birlikte oluşturur, talep onaylanır, muhasebenin ödeme kayıt listesine düşer, (kısmen veya tamamen) ödenir ve teslimattan sonra kapatılır.',
  audience: 'Talep edenler, onaylayanlar, muhasebe ve tedarik.',
  setup: [
    {
      title: 'Modülü açın',
      text: 'Varsayılan olarak kapalıdır. Onaylar gerekir (bir çekirdek hizmeti, her zaman açık).',
    },
    {
      title: 'Rehberler',
      text: 'Satın alma kategorileri, ödeme yapan tüzel kişiler ve para birimleri — [ayarlar](/admin/settings/procurement) bölümünde.',
    },
    {
      title: 'Onay akışı',
      text: '[Onaylar](/admin/settings/approvals) bölümünde «Satın alma talebi» için aşamaları ayarlayın, örneğin tutara göre.',
    },
    {
      title: 'İzinler',
      text: 'Muhasebe procurement.pay, yönetim procurement.view_all izni alır.',
    },
    {
      title: 'Bağlantılar',
      text: 'Tedarikçiyi, şantiyeyi, fırsatı ve sözleşmeyi rehberlerden seçmek için Cari hesaplar, Master plan, CRM ve Sözleşmeler modüllerini açın.',
    },
  ],
  roles: {
    'procurement.create': '«Herkes talep oluşturabilir» kapalıyken talep oluşturma.',
    'procurement.view_all': 'Yalnızca kendi ve onayladığı talepler değil, tüm talepler.',
    'procurement.pay': 'Ödeme kayıt listesi ve ödemeleri işaretleme.',
    'procurement.admin': 'Rehberler, ayarlar, onay akışları ve tüm talepler.',
  },
  scenarios: [
    {
      title: 'Ekipman satın alma',
      text: 'Bir şantiye şefi «Kuzey Mahallesi» şantiyesi için faturalı bir talep oluşturur, amir onaylar, muhasebe iki taksitte öder, depo malları teslim alır.',
    },
    {
      title: 'Değişiklik için geri gönderildi',
      text: 'Onaylayan, talebi bir yorumla geri gönderir; talep eden yeni bir fatura ekler ve yeniden gönderir.',
    },
  ],
  faq: [
    {
      q: 'Cari hesaplar zorunlu mu?',
      a: 'Hayır. Bu modül olmadan tedarikçi metin olarak yazılır.',
    },
    {
      q: 'Bir talebi kim görür?',
      a: 'Talep eden, sorumlu kişi, onaylayanlar ve view_all/pay/admin izinlerine sahip olanlar.',
    },
  ],
};
