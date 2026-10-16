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
  },
  seedable: false,
  async seed() {
    /* Nothing to create without a real SMB server. */
  },
});
