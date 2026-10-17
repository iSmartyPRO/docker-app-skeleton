export default {
  purpose: 'Onaylar bir çekirdek hizmetidir: belgeler (talepler, sözleşmeler, depo belgeleri) için koşullu, süreli, aciliyetli ve vekilli onay akışları ve her karar için tek bir «Beni bekleyenler» gelen kutusu.',
  audience: 'Onay veren herkes; yönetici belge türü başına onay akışlarını ayarlar.',
  setup: [
    {
      title: 'Onay akışları',
      text: '[Ayarlar](/admin/settings/approvals) bölümünde belge türü başına aşamaları belirleyin: kimin onaylayacağı, sırayla mı paralel mi ve koşullar (tutar, tür, tüzel kişi).',
    },
    {
      title: 'Aciliyet ve süreler',
      text: 'Süreleri, hatırlatıcıları ve üst makama iletme kurallarıyla aciliyet düzeyleri.',
    },
    {
      title: 'Vekiller',
      text: 'İzin süresince kişi Kişisel alan → Vekilim bölümünde bir vekil belirler.',
    },
  ],
  roles: {
    'approvals.admin': 'Onay akışları, aciliyet ve hizmet ayarları.',
  },
  scenarios: [
    {
      title: 'Büyük bir satın alma',
      text: 'Eşiğin üzerindeki bir talep önce amire, sonra finans direktörüne gider; eşiğin altındaysa yalnızca amire.',
    },
    {
      title: 'İzindeki bir onaylayan',
      text: 'İzin süresince belgeler vekilin «Beni bekleyenler» listesine düşer; geçmiş kimin karar verdiğini gösterir.',
    },
  ],
  faq: [
    {
      q: 'Onaylar neden kapatılamıyor?',
      a: 'Bir çekirdek hizmetidir: satın alma, sözleşme ve depo belgeleri bunun üzerinden geçer.',
    },
    {
      q: 'Onay akışı tanımlanmamışsa ne olur?',
      a: 'Modül varsayılan onay akışını kullanır (genellikle oluşturanın amiri).',
    },
  ],
};
