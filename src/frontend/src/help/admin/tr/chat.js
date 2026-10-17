export default {
  purpose: 'Sohbetler portalın mesajlaşma aracıdır: birebir ve grup yazışmaları, görevlerin, fırsatların, taleplerin ve sözleşmelerin tartışılması. İş yazışmaları kişisel mesajlaşma uygulamalarında değil, şirket içinde ve ilgili kaydın yanında kalır.',
  audience: 'Tüm çalışanlar.',
  setup: [
    {
      title: 'Gruplara izin verin veya yasaklayın',
      text: '[Ayarlar](/admin/settings/chat) bölümünde herkesin grup sohbeti oluşturup oluşturamayacağına karar verin.',
    },
    {
      title: 'Dosya boyutunu sınırlayın',
      text: 'Megabayt cinsinden en büyük ek boyutu.',
    },
    {
      title: 'Görüntülü aramaları ayarlayın',
      text: 'Bir toplantı bağlantısı şablonu; `{room}` benzersiz bir koda dönüşür. Arama düğmesini gizlemek için boş bırakın.',
    },
    {
      title: 'Anlık bildirimleri kontrol edin',
      text: 'Ekrana bakmayan kişilere mesajlar [bildirimler](/admin/settings/notifications) üzerinden ulaşır.',
    },
  ],
  roles: {
    'chat.admin': 'Diğerlerine yasakken grup oluşturma ve herhangi bir mesajı silme. Başkalarının birebir sohbetlerini okuma izni vermez.',
  },
  scenarios: [
    {
      title: 'Departman sohbeti',
      text: 'Amir bir «Satış» grubu oluşturur ve önemli mesajları sabitler; yeni gelenler tek tıklamayla eklenir.',
    },
    {
      title: 'Bir görevi tartışmak',
      text: 'Her görevin kendi sohbeti vardır: katılımcılar değişiklik geçmişini ve tartışmayı bir arada görür.',
    },
  ],
  faq: [
    {
      q: 'Sohbetler kapatılırsa ne olur?',
      a: 'Yazışmalar gizlenir ancak saklanır. Görevler, fırsatlar ve talepler tartışma sekmelerini kaybeder.',
    },
    {
      q: 'Yönetici birebir mesajları okuyabilir mi?',
      a: 'Hayır. Birebir sohbeti yalnızca katılımcıları görür.',
    },
    {
      q: 'Hangi arama hizmeti gerekiyor?',
      a: 'Toplantının bağlantıyla açıldığı herhangi bir hizmet (varsayılan olarak Jitsi Meet). Kendi sunucunuzu da belirtebilirsiniz.',
    },
  ],
};
