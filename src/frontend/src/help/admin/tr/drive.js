export default {
  purpose: 'Dosya sunucusu, şirketin Windows paylaşımlarını (SMB, Samba) tarayıcıda tek bir ağ sürücüsü olarak açar: görüntüleme, düzenleme, yüklemeler, bağlantılar ve etkinlik günlüğü. İzinler sunucudan gelir (NTFS, Active Directory grupları); portal bunları hiçbir zaman atlamaz.',
  audience: 'Paylaşılan klasörlerle çalışan kişiler; sunucuları bağlayan ve erişimi yöneten sistem yöneticisi.',
  setup: [
    {
      title: 'Açın ve sürücüye ad verin',
      text: 'Modül varsayılan olarak kapalıdır. [Ayarlar](/admin/settings/drive) bölümünde bir ad verin, örneğin «Şirket sürücüsü».',
    },
    {
      title: 'Sunucuları ve klasörleri ekleyin',
      text: 'Sunucu adresi ve kişilerin göreceği paylaşımlar. Oturum açmada her kişinin kendi etki alanı hesabı kullanılır.',
    },
    {
      title: 'Active Directory’yi bağlayın',
      text: '[AD entegrasyonu](/admin/settings/ad), «Erişim yönetimi» (klasör erişim grupları) ve etki alanı parolasının yeniden kullanılması için gereklidir.',
    },
    {
      title: 'Bağlantılar ve günlük',
      text: 'Herkese açık bağlantı politikası, etkinlik günlüğü ve günlüğün ne kadar süre saklanacağı.',
    },
  ],
  roles: {
    'drive.admin': 'Modül ayarları, sunucular ve klasörler.',
    'drive.audit': 'Etkinlik günlüğü: kim neyi açtı, değiştirdi veya sildi.',
    'drive.access': 'AD’deki klasör erişim gruplarının üyeliği (korumalı olanlar hariç). NTFS izinleri yalnızca süper yöneticiler içindir.',
  },
  scenarios: [
    {
      title: 'Uzaktan çalışma',
      text: 'Bir çalışan departman klasörünü evden, VPN olmadan tarayıcıda açar; izinler ofistekiyle aynıdır.',
    },
    {
      title: 'Klasör erişimi verme',
      text: 'Bir amir erişim ister — yönetici kişiyi «Erişim» panelinde klasörün okuma grubuna ekler ve işlem günlüğe yazılır.',
    },
  ],
  faq: [
    {
      q: 'Portal kopya saklıyor mu?',
      a: 'Hayır, dosyalar dosya sunucusunda kalır; yalnızca önizlemeler önbelleğe alınır.',
    },
    {
      q: 'Active Directory olmadan çalışır mı?',
      a: 'Paylaşımlara düz erişim için evet. AD olmadan yalnızca erişim grubu yönetimi kullanılamaz.',
    },
  ],
};
