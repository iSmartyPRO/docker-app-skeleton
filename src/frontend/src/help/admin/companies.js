export default {
  id: 'companies',
  purpose: {
    ru: 'Контрагенты — единый справочник компаний и людей: реквизиты из государственных реестров по ИНН, сотрудники и их карьера, история изменений и рейтинг. Его используют CRM, закупки, договоры, склад и мастерплан.',
    en: 'Counterparties is one directory of companies and people: details from public registers by tax id, employees and their careers, change history and rating. CRM, procurement, contracts, warehouse and masterplan use it.',
  },
  audience: { ru: 'Продажи, закупки, юристы и бухгалтерия.', en: 'Sales, purchasing, legal and accounting.' },
  setup: [
    { title: { ru: 'Страны', en: 'Countries' }, text: { ru: 'В [настройках](/admin/settings/companies) выберите страну по умолчанию и список стран — у каждой свои идентификаторы и реестр.', en: 'In the [settings](/admin/settings/companies) choose the default country and the list — each has its own ids and register.' } },
    { title: { ru: 'Роли компаний', en: 'Company roles' }, text: { ru: 'Клиент, поставщик, партнёр… — переименуйте или добавьте свои с цветом.', en: 'Client, supplier, partner… — rename them or add your own with a colour.' } },
    { title: { ru: 'Свои поля', en: 'Custom fields' }, text: { ru: 'Дополнительные поля для компаний и людей, при необходимости — только для отдельных стран.', en: 'Extra fields for companies and people, optionally for some countries only.' } },
    { title: { ru: 'Кто может править', en: 'Who may edit' }, text: { ru: '«Все» или «Ответственные» (ответственный, автор и администраторы).', en: '«Everyone» or «Owners» (the responsible person, the author and administrators).' } },
  ],
  roles: { 'companies.admin': { ru: 'Правка и окончательное удаление любых карточек, настройки модуля.', en: 'Edit and permanently delete any card, module settings.' } },
  scenarios: [
    { title: { ru: 'Новый поставщик', en: 'A new supplier' }, text: { ru: 'Закупщик вводит ИНН — карточка заполняется из реестра, дубликаты находятся автоматически.', en: 'A buyer enters the tax id — the card fills from the register and duplicates are found automatically.' } },
    { title: { ru: 'Контакт сменил работу', en: 'A contact changed jobs' }, text: { ru: 'Человеку добавляют новую должность — история в старой компании сохраняется.', en: 'The person gets a new position — the history at the old company is kept.' } },
  ],
  faq: [
    { q: { ru: 'Что будет с CRM, если выключить контрагентов?', en: 'What happens to CRM without Counterparties?' }, a: { ru: 'CRM продолжит работать, но клиентов нельзя будет выбирать из справочника.', en: 'CRM keeps working, but clients cannot be picked from the directory.' } },
    { q: { ru: 'Удаляются ли карточки?', en: 'Are cards deleted?' }, a: { ru: 'Обычно их архивируют; окончательно удалить может только администратор модуля.', en: 'Usually they are archived; only the module administrator can delete for good.' } },
  ],
};
