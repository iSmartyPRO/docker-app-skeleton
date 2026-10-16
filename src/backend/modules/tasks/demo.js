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
  { title: { ru: 'Согласовать план запуска офиса', en: 'Agree the office launch plan' }, who: 'anna', due: -2, priority: 2, important: true },
  { title: { ru: 'Заказать мебель для переговорной', en: 'Order furniture for the meeting room' }, who: 'pavel', due: 1 },
  { title: { ru: 'Подключить интернет и Wi-Fi', en: 'Connect the internet and Wi-Fi' }, who: 'pavel', due: 3 },
  { title: { ru: 'Подготовить приветственный набор для сотрудников', en: 'Prepare a welcome kit for employees' }, who: 'maria', due: 5 },
  { title: { ru: 'Заключить договор на уборку с ООО «Пример»', en: 'Sign a cleaning contract with Example LLC' }, who: 'anna', due: 7 },
  { title: { ru: 'Настроить доступ к порталу для новых сотрудников', en: 'Set up portal access for new employees' }, who: null, due: 2 },
  { title: { ru: 'Разместить объявление о переезде', en: 'Post the moving announcement' }, who: 'maria', due: 0 },
  { title: { ru: 'Проверить пожарную безопасность помещения', en: 'Check the fire safety of the premises' }, who: 'pavel', due: 10 },
];

export const DEMO_PEOPLE = {
  anna: { ru: 'Анна Демова', en: 'Anna Demo' },
  pavel: { ru: 'Павел Примеров', en: 'Paul Example' },
  maria: { ru: 'Мария Образцова', en: 'Mary Sample' },
};

registerDemo({
  module: 'tasks',
  describe: {
    ru: 'Проект «Демо: запуск офиса» с восемью задачами разных сроков и исполнителей.',
    en: 'A «Demo: office launch» project with eight tasks of different deadlines and assignees.',
  },
  async seed(ctx) {
    const tasks = contextFromRequest(ctx.request, 'tasks.admin');
    const project = await createProject(
      tasks,
      {
        name: ctx.t({ ru: 'Демо: запуск офиса', en: 'Demo: office launch' }),
        description: ctx.t({ ru: 'Пример проекта из демо-данных. Удаляется кнопкой «Удалить демо-данные».', en: 'A sample project from the demo data. «Remove demo data» deletes it.' }),
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
