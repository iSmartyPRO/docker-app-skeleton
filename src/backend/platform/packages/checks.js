import { compare, major, satisfies, short } from './version.js';

/*
 * Installation checks (spec §5) with the messages an administrator sees, in
 * Russian and English. Pure functions: the installer passes what is
 * installed now.
 *
 *   installed: Map(id → { id, version, name {ru,en}, requires [{ id, version }], source: 'bundled'|'package', nameForms? })
 *
 * Every problem is { code, params, message: { ru, en } }.
 */

// Instrumental case of module names for «„Склад“ 1.4 работает с „Закупками“ 1.x…».
// A package may give its own in manifest.json → nameForms.ru.ins.
const RU_INSTRUMENTAL = {
  approvals: 'Согласованиями',
  dashboard: 'Дашбордом',
  tasks: 'Задачами',
  calendar: 'Календарём',
  chat: 'Чатами',
  resources: 'Онлайн-ресурсами',
  assistant: 'Роботом-помощником',
  files: 'Файлами',
  kb: 'Базой знаний',
  contracts: 'Договорами',
  companies: 'Контрагентами',
  crm: 'CRM',
  procurement: 'Закупками',
  warehouse: 'Складом',
  masterplan: 'Мастерпланом',
  drive: 'Файловым сервером',
  org: 'Оргструктурой',
  employees: 'Сотрудниками',
  directory: 'Каталогом AD',
  qr: 'QR-кодами',
  remote: 'Удалённым доступом',
};

const nameIn = (entry, id, lang) => entry?.name?.[lang] || entry?.name?.en || id;
const ru = (entry, id) => nameIn(entry, id, 'ru');
const en = (entry, id) => nameIn(entry, id, 'en');
const ruIns = (entry, id) => entry?.nameForms?.ru?.ins || RU_INSTRUMENTAL[id] || ru(entry, id);
const problem = (code, params, ruText, enText) => ({ code, params, message: { ru: ruText, en: enText } });

export const BAD_PACKAGE = problem('BAD_PACKAGE', {}, 'Файл повреждён или выпущен не нами', 'The file is damaged or was not issued by us');

/** The «damaged or not ours» answer with the technical reason kept for the log. */
export const badPackage = (reason) => ({ ...BAD_PACKAGE, params: { reason: String(reason || '').slice(0, 300) } });

/** Core version: `need` or newer with the same first number. */
export function checkCore(need, have) {
  if (compare(have, need) < 0) return problem('CORE_TOO_OLD', { need, have }, `Нужно ядро ${need} или новее, у вас ${have}`, `Core ${need} or newer is required, you have ${have}`);
  if (major(have) !== major(need)) {
    const m = major(need);
    return problem('CORE_MAJOR', { need, have }, `Модуль рассчитан на ядро ${m}.x (${need} или новее), у вас ${have}`, `The module is made for core ${m}.x (${need} or newer), you have ${have}`);
  }
  return null;
}

function checkRequirement(link, installed) {
  if (!link.id) return null; // integrations are switched on in Settings → Integrations (modules/dependencies.js)
  const current = installed.get(link.id);
  const label = current || link;
  if (!current) {
    return link.version
      ? problem('REQUIRES_MISSING', { id: link.id, need: link.version }, `Нужен модуль „${ru(label, link.id)}“ версии ${link.version} или новее — он не установлен`, `Module “${en(label, link.id)}” version ${link.version} or newer is required — it is not installed`)
      : problem('REQUIRES_MISSING', { id: link.id }, `Нужен модуль „${ru(label, link.id)}“ — он не установлен`, `Module “${en(label, link.id)}” is required — it is not installed`);
  }
  if (!link.version || satisfies(current.version, link.version)) return null;
  if (compare(current.version, link.version) < 0) {
    return problem('REQUIRES_VERSION', { id: link.id, need: link.version, have: current.version }, `Нужен модуль „${ru(label, link.id)}“ ${link.version} или новее, у вас ${current.version}`, `Module “${en(label, link.id)}” ${link.version} or newer is required, you have ${current.version}`);
  }
  const m = major(link.version);
  return problem('REQUIRES_MAJOR', { id: link.id, need: link.version, have: current.version }, `Нужен модуль „${ru(label, link.id)}“ ${m}.x (${link.version} или новее), у вас ${current.version}`, `Module “${en(label, link.id)}” ${m}.x (${link.version} or newer) is required, you have ${current.version}`);
}

/** Modules (other than `id`) whose `requires` name `id`: [{ entry, link }]. */
export function dependentsOf(id, installed) {
  const out = [];
  for (const entry of installed.values()) {
    if (entry.id === id) continue;
    const link = (entry.requires || []).find((item) => item.id === id);
    if (link) out.push({ entry, link });
  }
  return out;
}

/**
 * Everything that stops installing or updating `manifest`. Returns
 * { action: 'install'|'update', current, problems: [...] }.
 */
export function checkInstall(manifest, { installed, coreVersion }) {
  const problems = [];
  const id = manifest.id;
  const current = installed.get(id) || null;
  const core = checkCore(manifest.core, coreVersion);
  if (core) problems.push(core);
  if (current?.source === 'bundled') {
    problems.push(problem('BUILTIN', { id }, `Модуль „${ru(current, id)}“ встроен в эту версию портала — его нельзя установить из файла`, `“${en(current, id)}” is built into this portal version and cannot be installed from a file`));
  } else if (current) {
    const order = compare(manifest.version, current.version);
    if (order < 0) problems.push(problem('DOWNGRADE', { have: current.version, file: manifest.version }, `Установлена ${current.version}, в файле ${manifest.version} — понижение запрещено`, `Version ${current.version} is installed, the file has ${manifest.version} — downgrading is not allowed`));
    if (order === 0) problems.push(problem('SAME_VERSION', { version: current.version }, `Версия ${current.version} уже установлена`, `Version ${current.version} is already installed`));
  }
  for (const link of manifest.requires || []) {
    const found = checkRequirement(link, installed);
    if (found) problems.push(found);
  }
  if (current) {
    for (const { entry, link } of dependentsOf(id, installed)) {
      if (!link.version || satisfies(manifest.version, link.version)) continue;
      const m = major(link.version);
      problems.push(
        problem(
          'BREAKS_DEPENDENT',
          { id: entry.id, version: entry.version, needs: `${m}.x`, file: manifest.version },
          `„${ru(entry, entry.id)}“ ${short(entry.version)} работает с „${ruIns(manifest, id)}“ ${m}.x, а в файле ${short(manifest.version)} — сначала обновите „${ru(entry, entry.id)}“`,
          `“${en(entry, entry.id)}” ${short(entry.version)} works with “${en(manifest, id)}” ${m}.x, but the file has ${short(manifest.version)} — update “${en(entry, entry.id)}” first`
        )
      );
    }
  }
  return { action: current && current.source !== 'bundled' ? 'update' : 'install', current, problems };
}

/** What stops removing `id`: other installed modules that require it. */
export function checkUninstall(id, { installed }) {
  const current = installed.get(id);
  if (!current) return [problem('NOT_INSTALLED', { id }, 'Модуль не установлен', 'The module is not installed')];
  if (current.source === 'bundled') return [problem('BUILTIN_REMOVE', { id }, `Модуль „${ru(current, id)}“ встроен в портал — его можно только выключить`, `“${en(current, id)}” is built into the portal — it can only be switched off`)];
  const dependents = dependentsOf(id, installed).map(({ entry }) => entry);
  if (!dependents.length) return [];
  const ruList = dependents.map((entry) => `„${ru(entry, entry.id)}“`).join(', ');
  const enList = dependents.map((entry) => `“${en(entry, entry.id)}”`).join(', ');
  const many = dependents.length > 1;
  return [
    problem(
      'HAS_DEPENDENTS',
      { id, dependents: dependents.map((entry) => entry.id).join(',') },
      `Сначала удалите ${ruList} — ${many ? 'они используют' : 'он использует'} „${ru(current, id)}“`,
      `Remove ${enList} first — ${many ? 'they use' : 'it uses'} “${en(current, id)}”`
    ),
  ];
}
