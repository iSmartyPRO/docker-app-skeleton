import { formatDate } from '../../services/datetime.js';

/** Notification texts of the Employees module, per recipient language and regional settings. */

const dayText = (value, locale, regional) => (value ? formatDate(String(value).slice(0, 10), regional || undefined, locale) : '');

export const EMPLOYEE_MESSAGES = {
  clearance: ({ employee, clearance, expiresOn, left, regional, self }) => {
    const ru = left < 0 ? `истёк ${dayText(expiresOn, 'ru', regional)}` : left === 0 ? 'истекает сегодня' : `истекает ${dayText(expiresOn, 'ru', regional)} (через ${left} дн.)`;
    const en = left < 0 ? `expired on ${dayText(expiresOn, 'en', regional)}` : left === 0 ? 'expires today' : `expires on ${dayText(expiresOn, 'en', regional)} (in ${left} d)`;
    return {
      ru: { title: self ? `Ваш допуск «${clearance}» ${ru}` : `Допуск «${clearance}»: ${employee} — ${ru}`, body: self ? 'Обратитесь в отдел кадров, чтобы продлить его.' : 'Продлите допуск или отстраните сотрудника от работ, где он нужен.' },
      en: { title: self ? `Your clearance «${clearance}» ${en}` : `Clearance «${clearance}»: ${employee} — ${en}`, body: self ? 'Contact HR to renew it.' : 'Renew it, or keep the person away from work that needs it.' },
    };
  },
};

/** `render` for notify(): the recipient's language and regional settings. */
export function employeeMessage(kind, params) {
  return (locale, regional) => {
    const texts = EMPLOYEE_MESSAGES[kind]({ ...params, regional: regional || null });
    return texts[locale] || texts.en;
  };
}
