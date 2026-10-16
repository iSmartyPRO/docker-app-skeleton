export default {
  id: 'warehouse',
  purpose: {
    ru: 'Склад — оперативный учёт остатков: номенклатура со штрихкодами, склады и ячейки, приход, выдача, перемещения, списания, инструмент по экземплярам, инвентаризация с телефона. Это не бухгалтерия: данные выгружаются в учётную систему.',
    en: 'Warehouse is operational stock keeping: items with barcodes, warehouses and bins, receipts, issues, transfers, write-offs, tools by instance, inventory from a phone. It is not bookkeeping: data is exported to the accounting system.',
  },
  audience: { ru: 'Кладовщики (МОЛ), прорабы, снабжение, бухгалтерия.', en: 'Storekeepers, foremen, supply and accounting.' },
  setup: [
    { title: { ru: 'Включите модуль', en: 'Switch the module on' }, text: { ru: 'Он выключен по умолчанию; списания согласуются через «Согласования».', en: 'It is off by default; write-offs are approved through Approvals.' } },
    { title: { ru: 'Склады и МОЛ', en: 'Warehouses and keepers' }, text: { ru: 'Создайте склады, назначьте материально ответственных и, при необходимости, ячейки.', en: 'Create warehouses, assign the responsible keepers and, if needed, bins.' } },
    { title: { ru: 'Номенклатура', en: 'Items' }, text: { ru: 'Импортируйте из Excel или заведите вручную: единицы, упаковки, штрихкоды, минимальные остатки.', en: 'Import from Excel or create by hand: units, packs, barcodes, minimum stock.' } },
    { title: { ru: 'Валюта и пороги', en: 'Currency and thresholds' }, text: { ru: 'Базовая валюта, курсы и порог согласования списаний — в [настройках](/admin/settings/warehouse).', en: 'Base currency, rates and the write-off approval threshold — in the [settings](/admin/settings/warehouse).' } },
    { title: { ru: 'Связки', en: 'Links' }, text: { ru: 'С «Закупками» приход оформляется по заявке, с «Мастерпланом» выдача идёт на объект.', en: 'With Procurement receipts follow requests; with Masterplan issues go to objects.' } },
  ],
  roles: {
    'warehouse.view': { ru: 'Просмотр остатков на всех складах.', en: 'View stock on every warehouse.' },
    'warehouse.request': { ru: 'Запросы на выдачу.', en: 'Issue requests.' },
    'warehouse.operate': { ru: 'Проведение документов (приход, выдача, перемещение).', en: 'Post documents (receipt, issue, transfer).' },
    'warehouse.writeoff': { ru: 'Списания.', en: 'Write-offs.' },
    'warehouse.inventory': { ru: 'Инвентаризации.', en: 'Inventory sessions.' },
    'warehouse.cost': { ru: 'Видеть суммы и себестоимость; без права деньги скрываются.', en: 'See amounts and cost; without it money is hidden.' },
    'warehouse.backdate': { ru: 'Документы задним числом.', en: 'Backdated documents.' },
    'warehouse.admin': { ru: 'Настройки, справочники и всё остальное.', en: 'Settings, directories and everything else.' },
  },
  access: { ru: 'Права можно выдать глобально (право) или на один склад (назначение); МОЛ склада имеет права на свой склад.', en: 'Rights are global (a permission) or per warehouse (an assignment); a warehouse’s keeper has rights on it.' },
  scenarios: [
    { title: { ru: 'Приход по заявке', en: 'Receipt from a request' }, text: { ru: 'Поставка по согласованной заявке закупки: кладовщик сканирует товар и проводит приход с телефона.', en: 'A delivery for an approved purchase request: the storekeeper scans goods and posts the receipt from a phone.' } },
    { title: { ru: 'Инструмент на объект', en: 'Tools to a site' }, text: { ru: 'Перфоратор выдаётся прорабу с датой возврата; просрочка видна в виджете и уведомлениях.', en: 'A drill is issued to a foreman with a return date; overdue returns show in a widget and notifications.' } },
  ],
  faq: [
    { q: { ru: 'Можно уйти в минус?', en: 'Can stock go negative?' }, a: { ru: 'Нет, документ без достаточного остатка не проводится.', en: 'No, a document without enough stock is refused.' } },
    { q: { ru: 'Как передать данные в бухгалтерию?', en: 'How does data reach accounting?' }, a: { ru: 'Выгрузками CSV и через API.', en: 'Through CSV exports and the API.' } },
  ],
};
