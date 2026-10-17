export default {
  title: 'Sohbetler',
  tagline: 'İş arkadaşları, gruplar ve görev tartışmalarıyla anlık mesajlaşma',
  summary: 'İş arkadaşlarınızla birebir yazışın, grup sohbetleri kurun ve görevleri doğrudan kartlarında tartışın. Dosya ve ekran görüntüsü paylaşın, mesajları yanıtlayın, tepki verin ve tek tıklamayla görüntülü arama başlatın. Bir sohbete bakmıyorsanız yeni mesaj size anlık bildirim olarak ulaşır.',
  highlights: [
    {
      title: 'Birebir ve grup',
      text: 'Her iş arkadaşıyla bir sohbet ve ekiplerinizin ve projelerinizin ihtiyaç duyduğu kadar grup.',
    },
    {
      title: 'Görev sohbetleri',
      text: 'Her görevin, tüm katılımcılarının zaten içinde olduğu kendi tartışması vardır.',
    },
    {
      title: 'Dosyalar ve ekran görüntüleri',
      text: 'Ataç, sürükle-bırak veya Ctrl+V — görseller doğrudan yazışmada görünür.',
    },
    {
      title: 'Bahsetmeler',
      text: '@ ve bir ad yazın — iş arkadaşınız sohbeti sessize almış olsa bile bildirim alır.',
    },
    {
      title: 'Görüntülü arama',
      text: 'Tek düğme ve toplantı bağlantısı herkes için sohbette.',
    },
    {
      title: 'Gürültüsüz anlık bildirimler',
      text: 'Bildirim yalnızca o sohbete bakmadığınızda gelir.',
    },
  ],
  tips: [
    'Ekran görüntüsü mü aldınız? Mesaj kutusunda **Ctrl+V**’ye basmanız yeterli.',
    'Bir iş arkadaşınızdan bahsetmek için **@** yazın — gözünden kaçmaz.',
    'Yeni satır için **Shift+Enter**, göndermek için **Enter**.',
    'Bir mesajı alıntılamak için üzerine gelin ve “Yanıtla”ya tıklayın.',
    'Grup çok mu gürültülü? **⋯** menüsü → “Sessize al”.',
    'Önemli sohbetleri sabitleyin — her zaman listenin en üstünde kalırlar.',
  ],
  sections: [
    {
      title: 'Birebir ve grup sohbetleri',
      body: `Tüm yazışmalar [Sohbetler](/app/chat) bölümündedir. Önce sabitlenenler, ardından son mesaj zamanına göre diğerleri gelir. Listenin üstündeki filtreler: **Tümü**, **Okunmamış**, **Kişiler**, **Gruplar**, **Görevler**.

- **Birebir sohbet** iki kişi arasındadır. Her iş arkadaşıyla bir tane olur ve geçmiş saklanır.
- **Grup sohbeti** bir ekip, departman veya proje içindir. Oluşturan kişi sahibi olur.

Portal üst bilgisindeki sohbet düğmesi her sayfada okunmamış sayısını gösterir ve son yazışmalarınızı açar.`,
      steps: [
        'Sohbet listesinin üstündeki **✎** simgesine tıklayın (“Yeni sohbet”).',
        'Birebir sohbet için “Kişi” seçili kalsın ve bir iş arkadaşı seçin.',
        'Grup için “Grup”a geçin, bir ad girin ve üyeleri seçin.',
        '“Grup oluştur”a tıklayın.',
      ],
      example: {
        title: 'Departman grubu',
        body: 'Bir amir “Satış ekibi” grubunu oluşturur ve altı satış temsilcisini ekler. Duyurular, programlar ve kısa sorular artık tek yerdedir; yeni çalışanlar daha sonra “Kişiler” panelinden eklenir.',
      },
      note: '“Grup” sekmesi yoksa yönetici grup oluşturmaya yalnızca sohbet yöneticilerinin izin verdiği anlamına gelir. Sizin için bir grup oluşturmalarını isteyin.',
    },
    {
      title: 'Görev sohbetleri',
      body: `Her görevin kendi sohbeti vardır. Sohbet doğrudan görev kartında açılır ve sohbet listesinde **Görevler** filtresi altında da görünür. Adı görevden gelir, örneğin \`TSK-12 · Sözleşme\`.

Görev olayları sohbete otomatik olarak düşer: durum değişiklikleri, yeni sorumlular vb. Bunlar gri satırlar olarak gösterilir ve okunmamış sayılmaz.

Görevi görebilen herkes sohbetini de görebilir. Yönetilecek ayrı bir üye listesi yoktur.`,
      example: {
        title: 'Bir görevle ilgili soru',
        body: 'Sorumlu görev sohbetine yazar: “@ivanov, sözleşmedeki ödeme koşulları neler?” Ivanov bildirim alır ve orada yanıtlar; bir ay sonra bile tüm hikâye görevin yanında durur.',
      },
      note: 'Görev sohbeti sabitlenemez veya gizlenemez, ancak sessize alınabilir. Görevin kendisine gitmek için **⋯** menüsünde “Görevi aç”ı seçin.',
    },
    {
      title: 'Mesajlar',
      body: `**Enter** mesajı gönderir, **Shift+Enter** yeni satır ekler.

Basit biçimlendirme:
- \`**kalın**\` → **kalın**
- \`_italik_\` veya \`*italik*\` → italik
- \`~~üstü çizili~~\` → üstü çizili
- \`\` \`kod\` \`\` ve üçlü ters tırnak içindeki kod blokları
- bağlantılar kendiliğinden tıklanabilir hâle gelir

Bir ila üç emojiden oluşan mesaj büyük gösterilir.

İşlemlerini görmek için bir mesajın üzerine gelin:
- **Yanıtla** mesajınızı alıntıyla gönderir; alıntıya tıklamak asıl mesaja götürür.
- 👍 ❤️ 😂 😮 🙏 🔥 veya herhangi bir emojiyle **tepki verin**; kimin bıraktığını görmek için tepkinin üzerine gelin.
- **Diğer** ile metni kopyalayabilir, kendi mesajınızı düzenleyebilir veya silebilirsiniz.`,
      example: {
        title: 'Hızlı yanıt',
        body: 'Bir iş arkadaşınız gruba sorar: “Yarın demoyu kim yapabilir?” Ayrı bir mesaj yerine 👍 ile tepki verin — veya yanıt soruya bağlı kalsın diye “Yanıtla”ya tıklayıp “Ben, 11:00’de” yazın.',
      },
      note: 'Yalnızca kendi mesajlarınızı düzenleyip silebilirsiniz. Silinen mesajın yerinde “Mesaj silindi” notu kalır. Grup sahibi ve sohbet yöneticileri herhangi bir mesajı silebilir.',
    },
    {
      title: 'Bahsetmeler',
      body: `Sohbet üyelerini görmek için **@** yazın. Ok tuşlarıyla bir kişi seçin ve **Enter** veya **Tab**’a basın.

Bahsedilen kişi, profilinde etkinleştirdiği tüm kanallardan bildirim alır: zil, anlık bildirim, e-posta, Telegram, Mattermost. Bu, **sohbeti sessize almış olsa bile** çalışır. Sohbet listesinde böyle bir yazışma **@** işaretiyle gösterilir.`,
      example: {
        title: 'Doğru kişiye seslenmek',
        body: '30 kişilik bir grupta birçok kişi sohbeti sessize almıştır. “@petrova, lütfen faturayı kontrol edin” yazın — Petrova bildirim alır, başka kimse rahatsız edilmez.',
      },
    },
    {
      title: 'Dosyalar ve görseller',
      body: `Dosya göndermenin üç yolu:
- mesaj kutusunun yanındaki ataç;
- dosyaları sohbet penceresine sürükleyin;
- bir ekran görüntüsünü veya kopyalanmış bir dosyayı **Ctrl+V** ile yapıştırın.

Dosyalar hemen yüklenir; bir metin ekleyip birlikte gönderin. Görsellerin önizlemesi gösterilir — tam ekran görmek için tıklayın. Diğer dosyalar adı ve boyutuyla bir kart olarak görünür. Görseller, PDF, metin, ses ve video tarayıcıda açılır, diğer her şey indirilir.

Sohbette paylaşılan her şey yan paneldeki **Dosyalar** sekmesindedir; ↗ düğmesi dosyanın gönderildiği mesajı gösterir.`,
      note: 'Tek bir dosyanın boyutu sınırlıdır (varsayılan olarak 100 MB). Dosya daha büyükse “… N MB’tan büyük” uyarısını görürsünüz.',
    },
    {
      title: 'Okundu bilgisi ve yazıyor göstergesi',
      body: `- **✓** — mesaj gönderildi.
- **✓✓** — diğerleri okudu.
- Altta “Ivan yazıyor…” — karşı taraf yazıyor.
- **Yeni mesajlar** çubuğu okunmamış kısmın nereden başladığını gösterir.
- Aşağı ok düğmesi sizi son mesajlara geri götürür ve kaç yeni mesaj geldiğini gösterir.

Görünür bir sekmede sohbetin sonuna kadar kaydırdığınızda mesajlar okunmuş sayılır.`,
    },
    {
      title: 'Arama',
      body: `- **Sohbet listesinde** — listenin üstündeki “Sohbetlerde ara” kutusu sohbetleri ada göre, iş arkadaşlarını isme göre bulur.
- **Bir sohbetin içinde** — üst bilgideki büyüteç “Bu sohbette ara”yı açar. En az iki harf yazın; ne kadar eski olursa olsun mesaja gitmek için bir sonuca tıklayın.`,
      steps: [
        'Sohbeti açın ve üst bilgideki büyütece tıklayın.',
        'Mesajdaki bir kelimeyi yazın, örneğin “fatura”.',
        'Sonuca tıklayın — yazışmada vurgulanır.',
      ],
    },
    {
      title: 'Sabitleme, sessize alma, gizleme',
      body: `Sohbet üst bilgisindeki **⋯** menüsü yalnızca size ait ayarları içerir; diğer üyeler bunları görmez:
- **Sabitle** 📌 sohbeti listenin en üstünde tutar.
- **Sessize al** 🔕 bu sohbetin anlık bildirimlerini durdurur ve okunmamış rozetini griye çevirir. Bahsetmeler (@) yine size ulaşır.
- **Listeden gizle** sohbeti listeden kaldırır; geçmiş saklanır.`,
      note: 'Gizlenen sohbet, yeni bir mesaj gelir gelmez kendiliğinden geri döner. Birebir sohbeti hemen geri getirebilirsiniz: “Yeni sohbet” → iş arkadaşını seçin.',
    },
    {
      title: 'Görüntülü arama',
      body: 'Sohbet üst bilgisindeki kamera düğmesi bir toplantı oluşturur (varsayılan olarak Jitsi) ve onu yeni bir sekmede açar. Sohbette hemen bir “Aramaya katıl” bağlantısı belirir, böylece üyeler tek tıklamayla katılır. Hiçbir şey yüklemeniz gerekmez — bir tarayıcı yeterlidir.',
      example: {
        title: 'Hızlı kısa toplantı',
        body: '“Satış ekibi” grubunda kameraya tıklayın — sohbette bir arama kartı belirir. Sohbete bakmayan iş arkadaşları anlık bildirim alır ve doğrudan telefonlarından katılır.',
      },
      note: 'Kamera düğmesi yoksa yönetici görüntülü aramaları kapatmıştır.',
    },
    {
      title: 'Anlık bildirimler',
      body: `Yeni bir mesaj telefonunuza veya bilgisayarınıza **yalnızca o anda o sohbete bakmıyorsanız** anlık bildirim olarak ulaşır. Her sohbet cihazda tek bir bildirim tutar — yenisi eskisinin yerini alır.

Anlık bildirim şu durumlarda gelmez:
- sessize alınmış sohbetler için (bahsetmeler hariç);
- bu cihazda anlık bildirimler açık değilse;
- portal bildirimleri tarayıcı veya telefon ayarlarında engellenmişse.`,
      steps: [
        'Telefonda portalı uygulama (PWA) olarak yükleyin: iPhone’da Paylaş → “Ana Ekrana Ekle”, Android’de Chrome’da “Yükle”.',
        '[Profil → Bildirimler](/account/notifications) bölümünü açın.',
        '“Bu cihazda anlık bildirimler”i açın ve bildirimlere izin verin.',
        '“Test et”e tıklayın — bir test bildirimi gelmelidir.',
      ],
      note: 'iPhone’da anlık bildirimler yalnızca yüklü uygulamada ve iOS 16.4’ten itibaren çalışır. Anlık bildirimler her cihazda ayrı ayrı açılır.',
    },
    {
      title: 'Bir grubu yönetme',
      body: `Grubu oluşturan kişi grubun **sahibidir** (üye listesinde “sahip” olarak işaretlenir). Sahip şunları yapabilir:
- kişi ekleme: yan panel **Kişiler** → “Kişi ekle”;
- üye çıkarma: adın yanındaki çarpı;
- grubu yeniden adlandırma: **⋯** menüsü → “Yeniden adlandır”;
- herhangi bir mesajı silme.

Her üye ayrılabilir: **⋯** menüsü → “Sohbetten ayrıl”. Sahip ayrılırsa rol en eski üyeye geçer.

Üyelerdeki ve addaki değişiklikler sohbette gri satırlar olarak görünür.`,
      note: 'Yeni üyeler, katılmadan önce gönderilen mesajlar dahil grubun tüm geçmişini görür.',
    },
    {
      title: 'Yönetim',
      body: `Modül ayarları: **Yönetim → Ayarlar → Modüller → Sohbetler**.
- **Açık** — sohbetler, üst bilgi düğmesi ve görev sohbetleri.
- **Herkes için grup sohbetleri** — kapalıyken grupları yalnızca sohbet yöneticileri oluşturur.
- **En büyük dosya** — tek bir dosyanın sınırı, 1 ile 2048 MB arası (varsayılan 100).
- **Görüntülü aramalar** — toplantı bağlantısı şablonu; \`{room}\` benzersiz bir koda dönüşür. Varsayılan \`https://meet.jit.si/{room}\`; arama düğmesini gizlemek için boş bırakın.

**Sohbet yöneticisi** izni, kısıtlandığında grup oluşturmaya ve herhangi bir mesajı silmeye olanak tanır. Roller aracılığıyla verilir.`,
      example: {
        title: 'Kendi video sunucunuz',
        body: 'Şirket `meet.company.com` adresinde kendi Jitsi sunucusunu çalıştırıyor. “Görüntülü aramalar” alanına `https://meet.company.com/{room}` yazın — her yeni arama bu sunucu üzerinden yapılır.',
      },
    },
  ],
  faq: [
    {
      q: 'Neden anlık bildirim almıyorum?',
      a: 'Sırayla kontrol edin: bu cihazda anlık bildirimler açık ([Profil → Bildirimler](/account/notifications) → “Bu cihazda anlık bildirimler”); bildirimler tarayıcıda veya telefonda engellenmemiş; sohbet sessize alınmamış. iPhone’da anlık bildirimler yalnızca yüklü uygulamada çalışır. Ve unutmayın: sohbet ekranınızda açıksa onun için anlık bildirim gönderilmez.',
    },
    {
      q: 'Gizlenen bir sohbeti nasıl geri getiririm?',
      a: 'Bir sonraki yeni mesajla kendiliğinden geri gelir. Birebir sohbeti hemen açabilirsiniz: “Yeni sohbet” → iş arkadaşını seçin — tüm geçmiş yerinde durur.',
    },
    {
      q: 'Bir görev sohbetini kim görebilir?',
      a: 'Görevin kendisini görebilen herkes: oluşturanı, sorumluları, gözlemcileri ve görevde erişimi olan herkes. Sohbet her zaman görevin erişimini izler.',
    },
    {
      q: 'Gönderilmiş bir mesajı düzenleyebilir veya silebilir miyim?',
      a: 'Evet, kendi mesajlarınızı: mesajın üzerine gelin → “Diğer” → “Düzenle” veya “Sil”. Düzenlenen mesaj “düzenlendi” olarak işaretlenir, silinenin yerinde “Mesaj silindi” kalır.',
    },
    {
      q: 'Bir sohbeti sessize aldığımı veya sabitlediğimi başkaları görür mü?',
      a: 'Hayır. Sabitleme, sessize alma ve gizleme yalnızca sizin kişisel ayarlarınızdır.',
    },
    {
      q: 'Neden grup oluşturamıyorum?',
      a: 'Yönetici grup oluşturmaya yalnızca sohbet yöneticilerinin izin verdi. Grubu oluşturmalarını veya size bu izni vermelerini isteyin.',
    },
    {
      q: 'Bir dosya gönderilmiyor — ne yapmalıyım?',
      a: 'Büyük olasılıkla boyut sınırını aşıyordur — portal “… N MB’tan büyük” uyarısını gösterir. Dosyayı sıkıştırın veya [Bilgi bankası](/app/kb) üzerinden bir bağlantı paylaşın.',
    },
    {
      q: 'Bir gruptan nasıl ayrılırım?',
      a: 'Sohbet üst bilgisindeki **⋯** menüsü → “Sohbetten ayrıl”. Yalnızca sahip sizi yeniden eklerse geri dönebilirsiniz.',
    },
  ],
  fields: {
    groupName: {
      title: 'Grup adı',
      text: 'Tüm üyeler bunu sohbet listelerinde görür. Sahip grubu daha sonra yeniden adlandırabilir.',
    },
    groupMembers: {
      title: 'Üyeler',
      text: 'Bir iş arkadaşınızın adını yazmaya başlayın. Grubun sahibi siz olursunuz ve daha sonra da kişi ekleyebilirsiniz.',
    },
    addMembers: {
      title: 'Kişi ekle',
      text: 'Yeni üyeler grubun tüm geçmişini görür. Kişileri sahip ekler ve çıkarır.',
    },
    mute: {
      title: 'Sessize al',
      text: 'Bu sohbet için anlık bildirim gelmez, ancak bahsetmeler (@) yine size ulaşır. Bunu yalnızca siz görürsünüz.',
    },
    pin: {
      title: 'Sabitle',
      text: 'Sohbet listenizin en üstünde kalır.',
    },
    hide: {
      title: 'Listeden gizle',
      text: 'Sohbet listenizden çıkar ve bir sonraki yeni mesajla geri gelir. Geçmiş saklanır.',
    },
    allowGroups: {
      title: 'Herkes için grup sohbetleri',
      text: 'Grupları yalnızca sohbet yöneticileri oluşturacaksa kapatın. Mevcut gruplar kalır.',
    },
    maxUploadMb: {
      title: 'En büyük dosya',
      text: 'Bir mesajdaki tek bir dosyanın sınırı, 1 ile 2048 MB arası. Varsayılan 100 MB.',
    },
    callUrl: {
      title: 'Görüntülü aramalar',
      text: 'Toplantı bağlantısı; `{room}` benzersiz bir koda dönüşür, örneğin `https://meet.jit.si/{room}`. Arama düğmesini gizlemek için boş bırakın.',
    },
  },
};
