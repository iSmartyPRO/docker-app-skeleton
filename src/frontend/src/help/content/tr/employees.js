export default {
  title: 'Çalışanlar',
  tagline: 'Şirkette çalışan herkes — tek bir rehberde.',
  summary: 'Pozisyonları, birimleri ve iş iletişim bilgileriyle iş arkadaşlarınızın rehberi, organizasyon şeması ve doğum günleri. İK kartları, belgeleri ve yetki belgelerini burada tutar — portal erişimi olmayan kişiler için de.',
  highlights: [
    {
      title: 'Bir iş arkadaşı bulun',
      text: 'Ada, pozisyona, e-postaya ve telefona göre arayın; birime ve şantiyeye göre filtreleyin.',
    },
    {
      title: 'Organizasyon şeması',
      text: 'Amirleri ve kadro sayılarıyla birimler — kişileri görmek için tıklayın.',
    },
    {
      title: 'Yetki belgeleri',
      text: 'Yetki belgelerinin tarihleri kontrol altında: hatırlatma önceden gelir.',
    },
    {
      title: 'Kutlamalar',
      text: 'Doğum günlerini (yalnızca gün ve ay) ve iş yıl dönümlerini gösteren bir pano pencere öğesi.',
    },
  ],
  tips: [
    'Kendi kartınızı «Kartım» üzerinden açın — telefonunuzu ve kişisel iletişim bilgilerinizi orada düzeltebilirsiniz.',
    'Tablo veya kartlar — aramanın yanındaki anahtar; seçim hatırlanır.',
    '«Dışa aktar» geçerli seçimi Excel için CSV olarak kaydeder.',
  ],
  sections: [
    {
      title: 'Kayıt',
      body: 'Kayıt, çalışan veya izinde olan kişileri listeler. Adları, fotoğrafları, pozisyonları, birimleri, şantiyeleri ve iş iletişim bilgilerini görürsünüz. Kişisel verileri yalnızca İK ve kişinin kendisi görür.',
    },
    {
      title: 'Çalışan kartı',
      body: 'Pozisyon, birim ve şantiye, amir, iş iletişim bilgileri. İK ayrıca sicil numarasını, işe giriş ve işten çıkış tarihlerini, istihdam türünü, belgeleri, becerileri ve yetki belgelerini, portal hesabını ve değişiklik geçmişini görür.',
    },
    {
      title: 'İK için',
      body: 'Portal erişimi olmayan bir kişi için de kart oluşturulabilir. Karttan tek tıklamayla hesap oluşturulur («Portal hesabı» → «Kullanıcı oluştur»), işten çıkışta ise hesabı engellemeniz önerilir.',
      steps: [
        '«Çalışan ekle»ye basın ve adı, pozisyonu ve birimi doldurun.',
        '«Beceriler ve yetki belgeleri» sekmesinde yetki belgelerini geçerlilik tarihleriyle ekleyin.',
        '«Portal hesabı» sekmesinde bir kullanıcı oluşturun veya mevcut birini bağlayın.',
      ],
      note: 'Aynı anda çok sayıda kişi mi? Excel’den «İçe aktar»: dosya önce kontrol edilir, sorunlar satır satır gösterilir.',
    },
  ],
  faq: [
    {
      q: 'Bir iş arkadaşımı neden bulamıyorum?',
      a: 'Rehber çalışan veya izinde olan kişileri gösterir. İşten ayrılanları ve adayları İK görür.',
    },
    {
      q: 'Doğum günümü kim görür?',
      a: 'Yönetici izin verirse iş arkadaşları yalnızca gün ve ayı görür; yılı İK dışında kimse görmez.',
    },
    {
      q: 'Telefon numaramı nasıl düzeltirim?',
      a: '«Kartım» → «İletişim bilgilerim»i açın.',
    },
  ],
};
