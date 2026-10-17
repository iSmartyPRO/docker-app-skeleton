export default {
  purpose: 'Sözleşmeler, şirketin sözleşme kayıt listesidir: dosya sürümleri, hukukçunun riskleri, onay, tarihler ve hatırlatıcılı otomatik uzatma, ödemeler ve kaparolar, taleplere, fırsatlara ve projelere bağlantılar.',
  audience: 'Hukukçular, sözleşme sahipleri, finans ve yönetim.',
  setup: [
    {
      title: 'Modülü açın',
      text: 'Varsayılan olarak kapalıdır; sözleşmeler Onaylar üzerinden geçer (bir çekirdek hizmeti).',
    },
    {
      title: 'Türler ve numaralandırma',
      text: '[Ayarlar](/admin/settings/contracts) bölümünde: sözleşme türleri, numara şablonu, bitiş hatırlatıcılarının süreleri.',
    },
    {
      title: 'Onay akışı',
      text: '[Onaylar](/admin/settings/approvals) bölümünde «Sözleşme» için aşamaları ayarlayın: hukukçu, finans, direktör — tutara ve türe bağlı koşullarla.',
    },
    {
      title: 'İzinler',
      text: 'Hukukçular contracts.legal, finans contracts.finance izni alır.',
    },
  ],
  roles: {
    'contracts.create': 'Sözleşme oluşturma.',
    'contracts.view_all': 'Tüm sözleşmeler.',
    'contracts.legal': 'Riskler, «İmzalandı» ve «Feshedildi».',
    'contracts.finance': 'Kaparoları onaylama, ödemeleri kaydetme, ödeme kayıt listesi.',
    'contracts.admin': 'Ayarlar ve diğer her şey.',
  },
  scenarios: [
    {
      title: 'Tedarik sözleşmesi',
      text: 'Bir yönetici taslağı yükler, hukukçu riskleri işaretler, onaydan sonra sözleşme imzalanır; bitişten 30 gün önce bir hatırlatıcı gelir.',
    },
    {
      title: 'Daire satışı',
      text: 'Satış sözleşmesi bir master plan bağımsız bölümüne bağlanır: imza ve ödemeler bölümün durumunu ve ödenen tutarı günceller.',
    },
  ],
  faq: [
    {
      q: 'Cari hesaplar olmadan?',
      a: 'Cari hesap metin olarak yazılır.',
    },
    {
      q: 'Sürümler nerede?',
      a: 'Kartın dosyalar sekmesinde, «neler değişti» notuyla.',
    },
  ],
};
