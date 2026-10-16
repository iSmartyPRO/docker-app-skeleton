export default {
  id: 'kb',
  purpose: {
    ru: 'База знаний — библиотека регламентов, инструкций и шаблонов: папки любой глубины, статьи, файлы и ссылки, просмотр PDF и Office прямо в браузере, права на папки и публичные ссылки.',
    en: 'The knowledge base is a library of policies, how-tos and templates: folders of any depth, articles, files and links, PDF and Office previews in the browser, folder permissions and public links.',
  },
  audience: { ru: 'Все сотрудники читают; редакторы отделов (HR, юристы, IT) наполняют свои разделы.', en: 'Everyone reads; department editors (HR, legal, IT) fill their sections.' },
  setup: [
    { title: { ru: 'Оформление по умолчанию', en: 'Default look' }, text: { ru: 'Иконка и цвет папок без своих настроек — в [настройках](/admin/settings/kb).', en: 'Icon and colour of folders without their own — in the [settings](/admin/settings/kb).' } },
    { title: { ru: 'Типы и размер файлов', en: 'File types and size' }, text: { ru: 'Какие группы файлов можно загружать и максимальный размер.', en: 'Which file groups may be uploaded and the maximum size.' } },
    { title: { ru: 'Структура и права', en: 'Structure and access' }, text: { ru: 'Создайте разделы по отделам и дайте редакторам право правки на свои папки; остальным — просмотр.', en: 'Create sections per department, give editors edit rights on their folders and everyone else view.' } },
    { title: { ru: 'Публичные ссылки', en: 'Public links' }, text: { ru: 'Разрешите их, если нужно делиться материалами с внешними людьми, и при необходимости требуйте пароль.', en: 'Allow them if materials are shared outside; require a password if needed.' } },
  ],
  roles: { 'kb.admin': { ru: 'Полный доступ ко всем папкам и настройкам модуля.', en: 'Full access to every folder and the module settings.' } },
  access: { ru: 'Права наследуются вниз по папкам; у папки и материала можно задать свои.', en: 'Access is inherited down the folders; a folder or material can have its own.' },
  scenarios: [
    { title: { ru: 'Онбординг', en: 'Onboarding' }, text: { ru: 'Раздел «Новичкам» со статьями «Первый день», «Кто за что отвечает» и ссылками на формы.', en: 'A «Newcomers» section with «Your first day», «Who does what» and links to forms.' } },
    { title: { ru: 'Шаблоны договоров', en: 'Contract templates' }, text: { ru: 'Юристы ведут папку шаблонов; остальные видят только актуальные версии.', en: 'Lawyers keep a templates folder; others see only the current versions.' } },
  ],
  faq: [
    { q: { ru: 'Почему Word показывается как PDF?', en: 'Why does Word show as PDF?' }, a: { ru: 'Для точной вёрстки нужен сервер документов (Collabora). Без него показывается упрощённый просмотр.', en: 'Exact layout needs a document server (Collabora). Without it a simplified view is shown.' } },
    { q: { ru: 'Связаны ли файлы базы знаний с «Файлами»?', en: 'Are KB files linked with Files?' }, a: { ru: 'Да, они хранятся в модуле «Файлы»; один файл может быть в нескольких статьях.', en: 'Yes, they are stored in Files; one file can appear in several articles.' } },
  ],
};
