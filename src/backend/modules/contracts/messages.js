import { formatDate } from '../../services/datetime.js';

/*
 * Notification texts of the Contracts module, per recipient language and
 * region settings (dates in their format). Pattern: crm/messages.js.
 */

const STATUS = {
  ru: { draft: 'Проект', approval: 'На согласовании', question: 'Нужен ответ', approved: 'Согласован', signed: 'Подписан', active: 'Действует', expiring: 'Истекает', completed: 'Завершён', rejected: 'Отклонён', terminated: 'Расторгнут' },
  en: { draft: 'Draft', approval: 'In approval', question: 'Answer needed', approved: 'Approved', signed: 'Signed', active: 'In force', expiring: 'Expiring', completed: 'Completed', rejected: 'Rejected', terminated: 'Terminated' },
};
const IMPORTANCE = { ru: { high: 'высокая', medium: 'средняя', low: 'низкая' }, en: { high: 'high', medium: 'medium', low: 'low' } };
const ROLE = { ru: { lawyer: 'юристом', owner: 'ответственным' }, en: { lawyer: 'the lawyer', owner: 'the business owner' } };

const lines = (...parts) => parts.filter(Boolean).join('\n');
const day = (value, locale, regional) => (value ? formatDate(value, regional || undefined, locale) : '');
const name = (c) => `${c.number} «${c.title}»`;
const nameEn = (c) => `${c.number} “${c.title}”`;
const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const daysRu = (n) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
const daysEn = (n) => `${n} day${n === 1 ? '' : 's'}`;

export const CONTRACT_MESSAGES = {
  assigned: ({ contract, role, actor }) => ({
    ru: { title: `Вы назначены ${ROLE.ru[role]} по договору ${name(contract)}`, body: lines(contract.counterparty, actor) },
    en: { title: `You are ${ROLE.en[role]} of contract ${nameEn(contract)}`, body: lines(contract.counterparty, actor) },
  }),
  status: ({ contract, status, actor, comment, regional }) => ({
    ru: {
      title: `Договор ${name(contract)}: ${STATUS.ru[status] || status}`,
      body: lines(status === 'expiring' && contract.endsOn ? `Окончание ${day(contract.endsOn, 'ru', regional)}` : '', comment, actor),
    },
    en: {
      title: `Contract ${nameEn(contract)}: ${STATUS.en[status] || status}`,
      body: lines(status === 'expiring' && contract.endsOn ? `Ends ${day(contract.endsOn, 'en', regional)}` : '', comment, actor),
    },
  }),
  prolonged: ({ contract, endsOn, regional }) => ({
    ru: { title: `Договор ${name(contract)} пролонгирован`, body: `Новый срок — до ${day(endsOn, 'ru', regional)}` },
    en: { title: `Contract ${nameEn(contract)} was prolonged`, body: `New term until ${day(endsOn, 'en', regional)}` },
  }),
  version: ({ contract, no, comment, actor }) => ({
    ru: { title: `Новая версия ${no} договора ${name(contract)}`, body: lines(comment ? `Что изменено: ${comment}` : '', actor) },
    en: { title: `New version ${no} of contract ${nameEn(contract)}`, body: lines(comment ? `What changed: ${comment}` : '', actor) },
  }),
  risk: ({ contract, risk, actor }) => ({
    ru: { title: `Риск #${risk.no} (${IMPORTANCE.ru[risk.importance]}) в договоре ${name(contract)}`, body: lines(risk.clause ? `Пункт ${risk.clause}` : '', risk.text, actor) },
    en: { title: `Risk #${risk.no} (${IMPORTANCE.en[risk.importance]}) in contract ${nameEn(contract)}`, body: lines(risk.clause ? `Clause ${risk.clause}` : '', risk.text, actor) },
  }),
  reminderEnd: ({ contract, left, target, regional }) => ({
    ru: { title: `Договор ${name(contract)} заканчивается через ${daysRu(left)}`, body: lines(`Окончание ${day(target, 'ru', regional)}`, contract.counterparty) },
    en: { title: `Contract ${nameEn(contract)} ends in ${daysEn(left)}`, body: lines(`Ends ${day(target, 'en', regional)}`, contract.counterparty) },
  }),
  reminderNotice: ({ contract, left, target, regional }) => ({
    ru: {
      title: `Договор ${name(contract)}: отказ от пролонгации — до ${day(target, 'ru', regional)}`,
      body: lines(left === 0 ? 'Сегодня последний день, чтобы уведомить об отказе' : `Осталось ${daysRu(left)}, чтобы уведомить об отказе`, contract.endsOn ? `Иначе договор продлится после ${day(contract.endsOn, 'ru', regional)}` : ''),
    },
    en: {
      title: `Contract ${nameEn(contract)}: refuse prolongation by ${day(target, 'en', regional)}`,
      body: lines(left === 0 ? 'Today is the last day to send the refusal' : `${daysEn(left)} left to send the refusal`, contract.endsOn ? `Otherwise it renews after ${day(contract.endsOn, 'en', regional)}` : ''),
    },
  }),
};

/** `render` for notify(): the recipient's language and region settings. */
export function contractMessage(kind, params) {
  return (locale, regional) => {
    const texts = CONTRACT_MESSAGES[kind]({ ...params, regional: regional || null });
    return texts[locale] || texts.en;
  };
}

export const statusName = (status, locale = 'ru') => (STATUS[locale] || STATUS.en)[status] || status;
