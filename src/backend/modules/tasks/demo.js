import { registerDemo } from '../../services/demo.js';
import { contextFromRequest } from '../shared/acl.js';
import { createProject, createTask } from './service.js';

/*
 * Demo data of Tasks (reference implementation — copy this file for another
 * module, see docs/extending.md «Demo data»): one team project with tasks in
 * every state, given to demo colleagues. Deleting the project removes its
 * tasks, statuses and access rows (ON DELETE CASCADE); the tasks are tracked
 * too, so the counts read «1 project, 8 tasks».
 */

const TASKS = [
  { title: { ru: 'Согласовать план запуска офиса', en: 'Agree the office launch plan', ky: 'Кеңсени ачуу планын макулдашуу', tr: 'Ofis açılış planını onaylatın', zh: '审定办公室启用计划' }, who: 'anna', due: -2, priority: 2, important: true },
  { title: { ru: 'Заказать мебель для переговорной', en: 'Order furniture for the meeting room', ky: 'Сүйлөшүү бөлмөсүнө эмерек буйрутма кылуу', tr: 'Toplantı odası için mobilya sipariş edin', zh: '为会议室订购家具' }, who: 'pavel', due: 1 },
  { title: { ru: 'Подключить интернет и Wi-Fi', en: 'Connect the internet and Wi-Fi', ky: 'Интернет жана Wi-Fi туташтыруу', tr: 'İnternet ve Wi-Fi bağlantısını kurun', zh: '接通互联网和 Wi-Fi' }, who: 'pavel', due: 3 },
  { title: { ru: 'Подготовить приветственный набор для сотрудников', en: 'Prepare a welcome kit for employees', ky: 'Кызматкерлер үчүн саламдашуу топтомун даярдоо', tr: 'Çalışanlar için bir hoş geldin paketi hazırlayın', zh: '为员工准备欢迎礼包' }, who: 'maria', due: 5 },
  { title: { ru: 'Заключить договор на уборку с ООО «Пример»', en: 'Sign a cleaning contract with Example LLC', ky: '«Мисал» ЖЧК менен тазалоо келишимин түзүү', tr: 'Örnek Ltd. Şti. ile temizlik sözleşmesi imzalayın', zh: '与“示例”有限责任公司签订保洁合同' }, who: 'anna', due: 7 },
  { title: { ru: 'Настроить доступ к порталу для новых сотрудников', en: 'Set up portal access for new employees', ky: 'Жаңы кызматкерлерге порталга кирүү укугун жөндөө', tr: 'Yeni çalışanlar için portal erişimini ayarlayın', zh: '为新员工开通门户访问权限' }, who: null, due: 2 },
  { title: { ru: 'Разместить объявление о переезде', en: 'Post the moving announcement', ky: 'Көчүү тууралуу жарыя жайгаштыруу', tr: 'Taşınma duyurusunu yayımlayın', zh: '发布搬迁通知' }, who: 'maria', due: 0 },
  { title: { ru: 'Проверить пожарную безопасность помещения', en: 'Check the fire safety of the premises', ky: 'Имараттын өрт коопсуздугун текшерүү', tr: 'Binanın yangın güvenliğini kontrol edin', zh: '检查场所消防安全' }, who: 'pavel', due: 10 },
];

export const DEMO_PEOPLE = {
  anna: { ru: 'Анна Демова', en: 'Anna Demo', ky: 'Анна Демова' },
  pavel: { ru: 'Павел Примеров', en: 'Paul Example', ky: 'Павел Примеров' },
  maria: { ru: 'Мария Образцова', en: 'Mary Sample', ky: 'Мария Образцова' },
};

registerDemo({
  module: 'tasks',
  describe: {
    ru: 'Проект «Демо: запуск офиса» с восемью задачами разных сроков и исполнителей.',
    en: 'A «Demo: office launch» project with eight tasks of different deadlines and assignees.',
    ky: 'Ар кандай мөөнөттөгү жана аткаруучулары бар сегиз тапшырмалуу «Демо: кеңсени ачуу» долбоору.',
    tr: 'Farklı son tarihli ve sorumlulu sekiz görev içeren bir «Demo: ofis açılışı» projesi.',
    zh: '“演示：办公室启用”项目，包含八个截止日期和执行人各不相同的任务。',
  },
  async seed(ctx) {
    const tasks = contextFromRequest(ctx.request, 'tasks.admin');
    const project = await createProject(
      tasks,
      {
        name: ctx.t({ ru: 'Демо: запуск офиса', en: 'Demo: office launch', ky: 'Демо: кеңсени ачуу', tr: 'Demo: ofis açılışı', zh: '演示：办公室启用' }),
        description: ctx.t({ ru: 'Пример проекта из демо-данных. Удаляется кнопкой «Удалить демо-данные».', en: 'A sample project from the demo data. «Remove demo data» deletes it.', ky: 'Демо маалыматтардан алынган долбоордун мисалы. «Демо маалыматтарды өчүрүү» баскычы аны өчүрөт.', tr: 'Demo verilerinden örnek bir proje. «Demo verilerini kaldır» onu siler.', zh: '演示数据中的示例项目。“删除演示数据”会将其删除。' }),
        color: '#0EA5E9',
        visibility: 'team',
      },
      { locale: ctx.locale, allowed: true }
    );
    await ctx.track('task_projects', project.id);
    const people = {};
    for (const [key, name] of Object.entries(DEMO_PEOPLE)) people[key] = await ctx.demoUser(key, { displayName: ctx.t(name) });
    for (const item of TASKS) {
      const task = await createTask(tasks, {
        projectId: project.id,
        title: ctx.t(item.title),
        assigneeId: item.who ? people[item.who] : ctx.userId,
        dueAt: ctx.day(item.due, '18:00').toISOString(),
        priority: item.priority,
        important: item.important,
      });
      await ctx.track('tasks', task.id);
    }
  },
});
