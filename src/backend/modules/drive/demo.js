import { registerDemo } from '../../services/demo.js';

/*
 * Drive (the company file server) has no demo data on purpose: its folders
 * live on a real SMB server, and the portal never invents shares or files
 * there. The entry is registered so that the Modules page explains this and
 * «Демо всего портала» passes over the module without an error. Nothing is
 * created, so nothing is tracked and the module never shows as «filled».
 */

registerDemo({
  module: 'drive',
  describe: {
    ru: 'Демо-данных нет: файловый сервер показывает папки настоящего SMB-сервера. Подключите сервер в настройках модуля, и здесь появятся его общие папки; «Демо всего портала» модуль пропускает.',
    en: 'No demo data: the file server shows the folders of a real SMB server. Connect a server in the module settings to see its shared folders; «Demo of the whole portal» passes over the module.',
    ky: 'Демо маалыматтар жок: файл сервери чыныгы SMB серверинин папкаларын көрсөтөт. Модулдун жөндөөлөрүндө серверди туташтырсаңыз, бул жерде анын жалпы папкалары пайда болот; «Бүт порталдын демосу» бул модулду өткөрүп жиберет.',
    tr: 'Demo verisi yok: dosya sunucusu gerçek bir SMB sunucusunun klasörlerini gösterir. Paylaşılan klasörlerini görmek için modül ayarlarında bir sunucu bağlayın; «Tüm portalın demosu» bu modülü atlar.',
    zh: '没有演示数据：文件服务器显示的是真实 SMB 服务器的文件夹。请在模块设置中连接服务器，即可在此看到其共享文件夹；“整个门户的演示”会跳过此模块。',
  },
  seedable: false,
  async seed() {
    /* Nothing to create without a real SMB server. */
  },
});
