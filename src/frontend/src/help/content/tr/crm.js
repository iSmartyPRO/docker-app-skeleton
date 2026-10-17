export default {
  title: 'CRM',
  tagline: 'İlk temastan sonuca kadar fırsatlar — kanbanda, listede, aktivitelere göre ve takvimde.',
  summary: 'CRM, fırsatları bir satış hattının aşamaları boyunca ilerletir. Kartları aşamalar arasında sürükleyin, hiçbir fırsat bir sonraki adım olmadan takılıp kalmasın diye aramalar ve toplantılar planlayın, fırsatları kazanıldı veya kaybedildi olarak kapatın. Müşteriler Cari hesaplar’daki şirketler ve kişilerdir; böylece müşterinin tüm geçmişi tek yerde kalır.',
  highlights: [
    {
      title: 'Aşamalara göre kanban',
      text: 'Her aşama, fırsat sayısı ve toplamıyla bir sütundur; bir kartı fareyle veya parmağınızla sürükleyin.',
    },
    {
      title: 'Fırsatlarda aktiviteler',
      text: 'Tarihi, kişisi ve hatırlatıcısı olan aramalar, toplantılar, görevler ve e-postalar.',
    },
    {
      title: 'Tüm görünümler için tek filtre',
      text: 'Kanban, liste, aktiviteler ve takvim aynı fırsatları gösterir; iyi bir filtre kaydedilebilir.',
    },
    {
      title: 'Kazanıldı veya kaybedildi',
      text: 'Fırsatları tek düğmeyle kapatın; kaybedilenler için portal nedenini sorar.',
    },
    {
      title: 'Cari hesaplardan müşteriler',
      text: 'Fırsat bir şirkete ve bir kişiye bağlanır; onların kartları oluşturulan ve kapanan fırsatları gösterir.',
    },
    {
      title: 'İş arkadaşlarıyla tartışın',
      text: 'Her fırsatın sorumlu, takipçiler ve oluşturan için kendi sohbeti olabilir.',
    },
  ],
  tips: [
    'Her fırsatta bir sonraki aktivite olsun — «Aktivite yok» sayacı unutulmuş fırsatları gösterir.',
    'Güne Aktiviteler görünümüyle başlayın: «Gecikmiş» ve «Bugün» sizin planınızdır.',
    'Kanbanın ilk sütunundaki hızlı fırsat üç alan ister: ad, tutar, müşteri.',
    'Esc fırsat kartını kapatır ve sizi bulunduğunuz görünüme geri getirir.',
    'Yalnızca gecikmiş aktiviteleri olan fırsatları bırakmak için panonun üstündeki «Gecikmiş» sayacına tıklayın.',
    'Her gün kullandığınız filtreyi kaydedin — soldaki filtre listesinde görünür.',
  ],
  sections: [
    {
      title: 'Kanban',
      body: `Sütunlar, seçilen satış hattının aşamalarıdır. Aşama başlığı rengini, fırsat sayısını ve para birimi başına toplamı gösterir.

Kartta ad, tutar, müşteri, sonraki aktivite (gecikmişse kırmızı), açık aktivite sayısı ve sorumlu görünür. Karttaki **+ Aktivite** düğmesi, fırsatı açmadan bir arama veya toplantı planlar.

Aşamayı değiştirmek için kartı başka bir sütuna sürükleyin. Sürüklerken altta **Kazanıldı** ve **Kaybedildi** alanları belirir — fırsatı kapatmak için kartı oraya bırakın. Uzun sütunların altında **Daha fazla** düğmesi çıkar.`,
      steps: [
        'İlk sütunda **+ Hızlı fırsat**’a basın.',
        'Adı, tutarı girin ve müşteriyi seçin — veya doğrudan listede oluşturun.',
        '**Oluştur**’a basın: fırsat sütunun en üstüne gider.',
      ],
      note: 'Telefonda sürüklemeden önce karta bir an basılı tutun — böylece panoyu kaydırmak engellenmez.',
    },
    {
      title: 'Liste',
      body: `Sütun başlığına tıklanarak sıralanan bir fırsat tablosu. Sağdaki sütunlar düğmesi özel alanlar dahil neyin gösterileceğini seçer; seçim hatırlanır.

«Aşama» sütunundaki aşama çubuğu tıklanabilir: fırsatı taşımak için bir bölüme, kapatmak için sonuncusuna tıklayın.

Satırları işaretlediğinizde altta bir eylem çubuğu belirir: **Aşamayı değiştir**, **Sorumlu**, **Satış hattına taşı**, **Takipçiler**, **Sil**. **Filtreye uyan tümü için** eylemi filtredeki her fırsata uygular (en fazla 1000).`,
      note: 'Listenin hızlı kalması için toplam, istek üzerine **Sayıyı göster** ile hesaplanır.',
    },
    {
      title: 'Aktiviteler',
      body: `Fırsatlar en yakın açık aktivitelerine göre sıralanır: **Gecikmiş**, **Bugün**, **Bu hafta**, **Gelecek hafta**, **Daha sonra** ve **Aktivite yok**.

Bir kartı başka bir sütuna sürüklediğinizde fırsatın en yakın aktivitesi o güne taşınır (saat aynı kalır). «Aktivite yok» sütununa bırakamazsınız: bir aktiviteyi kaldırmak için onu fırsat kartında tamamlandı olarak işaretleyin.

Kenar çubuğundaki **Aktivitelerim**, fırsatlardaki tüm açık aktivitelerinizi «tamamlandı» onay kutularıyla listeler.`,
    },
    {
      title: 'Takvim',
      body: 'Fırsatlar, kapanış tarihine — veya herhangi bir özel «Tarih» alanına (takvimin sağ üstünden seçilir) — göre ay veya hafta ızgarasında gösterilir. O tarihi değiştirmek için bir fırsatı başka bir güne sürükleyin. Tıklamak fırsatı açar.',
    },
    {
      title: 'Filtre ve sayaçlar',
      body: `Panonun üstündeki filtre alanı fırsat adında, müşteride ve yorumda arar. Tıklamak paneli açar: solda hazır filtreler — **Devam eden**, **Fırsatlarım**, **Kapanan** ve kaydettikleriniz; sağda alanlar: sorumlu, tutar, aşamalar, aşama grubu, tarihler, kaynak, müşteri ve özel liste alanları.

**Gecikmiş**, **Bugün için**, **Planlanmış**, **Aktivite yok** sayaçları geçerli filtredeki fırsatları aktivitelerine göre sayar; tıklamak yalnızca bu fırsatları bırakır.

Görünüm (kanban, liste, aktiviteler, takvim), satış hattı ve filtre hatırlanır — CRM bir dahaki sefere aynı şekilde açılır.`,
      steps: [
        'Filtreyi açın ve alanları seçin.',
        '**+ Filtreyi kaydet**’e basın ve bir ad verin.',
        'Filtre soldaki listede görünür — yalnızca siz görürsünüz.',
      ],
    },
    {
      title: 'Fırsat kartı',
      body: `Fırsat, geçerli görünümün üzerinde bir panel olarak açılır. Üstte: satış hattı, ad (yerinde düzenlenir), tutar, sorumlu ve aşama okları: fırsatı taşımak için bir oka tıklayın, **Fırsatı kapat** onu **Kazanıldı** veya **Kaybedildi** olarak bitirir.

Solda — alanların bulunduğu bölüm kartları. Boş alanlarda «doldurulmadı» yazar; değiştirmek için bir değere tıklayın. «Müşteri» bloğu şirketi ve kişiyi arama ve e-posta düğmeleri ve Cari hesaplar kartlarına bir bağlantıyla gösterir.

Sağda — zaman akışı: **Aktivite** sekmesi bir arama, toplantı, görev veya e-posta planlar, **Yorum** sekmesi iş arkadaşlarına not bırakır. Altında açık aktivitelerin sabitlenmiş **Yapılacaklar** listesi bulunur: onay kutusu birini tamamlandı olarak işaretler, gecikmiş olanlar kırmızıdır. Ardından fırsatın güne göre tüm geçmişi gelir.

**İş arkadaşlarıyla tartış** fırsat sohbetini açar. Telefonda alanlar ve zaman akışı ayrı sekmelerdir.`,
      example: {
        title: 'Toplantıdan sonra arama',
        body: 'Toplantı iyi geçti ve müşteri bir teklif istiyor. Toplantıyı tamamlandı olarak işaretleyin, fırsatı «Teklif» aşamasına taşıyın ve 15 dakika önceden hatırlatıcıyla öbür gün için bir arama planlayın — CRM size hatırlatır ve fırsat kaybolmaz.',
      },
      note: 'Siz fırsatı açık tutarken bir iş arkadaşınız onu değiştirirse portal güncel sürümü gösterir ve sizi uyarır — kimse kimsenin üzerine yazmaz.',
    },
    {
      title: 'Satış hatları ve aşamalar',
      body: `Bir CRM yöneticisi satış hatlarını **Satış hatları** bölümünde ayarlar: ad, renk, aşamalar ve sıraları (sürükleyerek). **Kazanıldı** ve **Kaybedildi** aşamaları her zaman en sonda gelir ve yeniden adlandırılabilir.

Kaldırılan bir aşamada hâlâ fırsat varsa portal bunların nereye taşınacağını sorar. Fırsatları olan bir satış hattı ancak fırsatlar için başka bir satış hattı seçilerek silinebilir.`,
    },
    {
      title: 'Ayarlar',
      body: `CRM **Ayarlar** bölümünde varsayılan para birimi ve para birimleri listesi, fırsatların görünürlüğü (herkes her şeyi görür veya yalnızca kendi fırsatlarını), kaynaklar, kaybetme nedenleri, aktivite hatırlatıcıları, kart bölümleri ve özel alanlar bulunur.

Özel alanlar metin, uzun metin, sayı, para, tarih, liste, listeden birkaç değer, evet/hayır, bağlantı ve çalışan olabilir. **Listede**, alanı Liste görünümüne bir sütun olarak ekler.`,
    },
    {
      title: 'Çöp kutusu',
      body: 'Silinen fırsatlar aktiviteleri ve geçmişleriyle birlikte **Çöp kutusu**na gider. Sorumlu, oluşturan ve CRM yöneticileri bunları geri yükleyebilir.',
    },
  ],
  faq: [
    {
      q: 'İş arkadaşlarımın fırsatlarını neden göremiyorum?',
      a: 'Yönetici «Yalnızca kendi fırsatları» seçeneğini açtı. Sorumlu, takipçi veya oluşturan olduğunuz fırsatları görürsünüz. Takipçi olarak eklenmeyi isteyin.',
    },
    {
      q: 'Kapanmış bir fırsatı nasıl yeniden açarım?',
      a: 'Fırsatı açın ve sonuç bandındaki **Yeniden işleme al**’a basın, ardından bir aşama seçin. **Kapanan** filtresi kapanmış fırsatları bulmaya yardımcı olur.',
    },
    {
      q: 'Aktivite hatırlatmaları nereye gelir?',
      a: 'Portalın diğer bildirimlerinin gittiği yere: zil, anlık bildirim, Telegram veya e-posta — [Bildirimler](/account/notifications) bölümünde «CRM» grubu için ayarladığınız gibi.',
    },
    {
      q: 'Bir fırsatı başka bir satış hattına taşıyabilir miyim?',
      a: 'Evet: fırsat kartında başlığın üstündeki satış hattı adına tıklayın ve başka birini seçin. Fırsat o hattın ilk aşamasından başlar. Birkaç fırsat için listede **Satış hattına taşı**’yı kullanın.',
    },
    {
      q: 'Fırsatları Excel’e nasıl aktarırım?',
      a: 'Liste görünümünde **CSV dışa aktar**’a basın — geçerli filtredeki fırsatlar seçilen sütunlarla aktarılır. Dosya Excel’de açılır.',
    },
    {
      q: 'Bir müşterinin fırsatlarını nerede görebilirim?',
      a: 'Cari hesaplar’daki şirket veya kişi kartında, «Geçmiş» sekmesinde: bağlantılarıyla oluşturulan, kazanılan ve kaybedilen fırsatlar. CRM’de — «Müşteri» alanına göre filtreleyin.',
    },
  ],
  fields: {
    lostReasons: {
      title: 'Kaybetme nedenleri',
      text: 'Bir fırsat kaybedildi olarak kapatıldığında portal bir neden sorar. Daha sonra bu nedenler müşterilerin neden ayrıldığını gösterir.',
    },
    customFields: {
      title: 'Özel alanlar',
      text: 'Kart bölümlerindeki ek fırsat alanları. «Listede» bir Liste sütunu ekler, «Zorunlu» değeri olmadan fırsat oluşturulamayacağı anlamına gelir.',
    },
  },
};
