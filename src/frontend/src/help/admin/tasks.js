export default {
  id: 'tasks',
  purpose: {
    ru: 'Задачи — общий инструмент поручений: проекты со своими статусами, доска и список, сроки, напоминания, результат и чат у каждой задачи. Руководитель видит, кто что делает и что просрочено, без таблиц и переписки в мессенджерах.',
    en: 'Tasks is the shared tool for assignments: projects with their own statuses, a board and a list, deadlines, reminders, a result and a chat in every task. Managers see who does what and what is overdue without spreadsheets or messenger threads.',
  },
  audience: {
    ru: 'Все сотрудники. Руководители ставят поручения и следят за сроками, исполнители принимают задачи в работу и сдают результат, администратор задач настраивает проекты и правила.',
    en: 'Every employee. Managers set assignments and watch deadlines, assignees accept tasks and hand in results, the tasks administrator sets up projects and rules.',
  },
  setup: [
    { title: { ru: 'Решите, кто создаёт проекты', en: 'Decide who creates projects' }, text: { ru: 'В [настройках модуля](/admin/settings/tasks) выберите «Все» или «Только администраторы». В небольших компаниях удобнее «Все».', en: 'In the [module settings](/admin/settings/tasks) choose «Everyone» or «Administrators only». «Everyone» suits small companies.' } },
    { title: { ru: 'Задайте сроки принятия', en: 'Set acceptance deadlines' }, text: { ru: 'Сколько часов у исполнителя, чтобы нажать «Принять в работу» — для обычных и важных задач. Непринятая вовремя задача подсвечивается, постановщик получает уведомление.', en: 'How many hours an assignee has to press «Accept» — for normal and important tasks. A task not accepted in time is highlighted and the originator is notified.' } },
    { title: { ru: 'Отметьте группу руководства', en: 'Mark the leadership group' }, text: { ru: 'Задачи от участников выбранных групп становятся «Поручениями»: они видны отдельно и их нельзя тихо отклонить.', en: 'Tasks set by members of the chosen groups become «Orders»: they are listed separately and cannot be quietly declined.' } },
    { title: { ru: 'Создайте проекты отделов', en: 'Create department projects' }, text: { ru: 'Короткий ключ проекта (например, `HR`) станет префиксом номеров задач. Доступ: «Все могут редактировать», «Все читают» или «Только я» — потом его можно уточнить по группам и ролям.', en: 'The project key (e.g. `HR`) prefixes task numbers. Access: «Everyone can edit», «Everyone reads» or «Only me» — refine it later by groups and roles.' } },
    { title: { ru: 'Выдайте право tasks.admin', en: 'Grant tasks.admin' }, text: { ru: 'Тем, кто должен управлять всеми проектами (обычно офис-менеджер или PMO), — через роль в «Роли».', en: 'To those who manage every project (an office manager or PMO) — through a role in «Roles».' } },
  ],
  roles: {
    'tasks.admin': { ru: 'Управление каждым проектом (статусы, доступ, архив), настройки модуля. Личные задачи других людей без проекта остаются закрытыми и для администратора.', en: 'Manage every project (statuses, access, archive) and the module settings. Other people’s personal tasks without a project stay private even to the administrator.' } },
  access: {
    ru: 'Доступ к задачам задаётся в каждом проекте: просмотр, правка или управление — для всех, пользователя, группы или роли. Участники задачи (постановщик, исполнитель, соисполнители, наблюдатели) видят её независимо от уровня проекта.',
    en: 'Access is set per project: view, edit or manage — for everyone, a user, a group or a role. Task participants (originator, assignee, co-assignees, auditors) see the task regardless of the project level.',
  },
  scenarios: [
    { title: { ru: 'Поручения директора', en: 'Director’s orders' }, text: { ru: 'Директор входит в группу «Руководство». Его задачи помечаются как поручения, исполнитель обязан принять их за 4 часа, а просрочки видны на дашборде.', en: 'The director is in the «Leadership» group. Their tasks are marked as orders, the assignee must accept within 4 hours, and overdue ones show on the dashboard.' } },
    { title: { ru: 'Повторяющиеся задачи', en: 'Recurring tasks' }, text: { ru: 'Бухгалтерия создаёт шаблон «Сверка с поставщиками» с расписанием «каждый месяц, 25-го» — задача появляется сама и назначается ответственному.', en: 'Accounting creates a «Supplier reconciliation» template scheduled «monthly on the 25th» — the task appears by itself and goes to the person in charge.' } },
    { title: { ru: 'Поток заявок', en: 'A request flow' }, text: { ru: 'IT-отдел настраивает поток «Заявки в IT»: новые задачи распределяются между сотрудниками по очереди.', en: 'The IT team sets up an «IT requests» flow: new tasks are distributed among the team in turn.' } },
  ],
  faq: [
    { q: { ru: 'Что будет с задачами, если выключить модуль?', en: 'What happens to tasks if the module is switched off?' }, a: { ru: 'Они скрываются, но не удаляются. После включения всё вернётся как было.', en: 'They are hidden, not deleted. Switching the module back on restores everything.' } },
    { q: { ru: 'Почему у задачи нет чата?', en: 'Why does a task have no chat?' }, a: { ru: 'Чат задачи — часть модуля «Чаты». Включите его, и обсуждение появится у каждой задачи.', en: 'The task chat is part of the Chats module. Switch it on and every task gets its discussion.' } },
    { q: { ru: 'Можно ли изменить ключ проекта?', en: 'Can a project key be changed?' }, a: { ru: 'Нет — ключ входит в номера и ссылки задач, поэтому он постоянный.', en: 'No — the key is part of task numbers and links, so it is permanent.' } },
    { q: { ru: 'Видны ли сроки задач в календаре?', en: 'Are deadlines shown in the calendar?' }, a: { ru: 'Да, если включён «Календарь»: каждый видит сроки своих задач рядом со встречами.', en: 'Yes, with the Calendar on: everyone sees their task deadlines next to their meetings.' } },
  ],
};
