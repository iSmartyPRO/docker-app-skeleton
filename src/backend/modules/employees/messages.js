import { formatDate } from '../../services/datetime.js';
import { translator } from '../../services/i18n/index.js';

/** Notification texts of the Employees module in the recipient's language (locales/<lang>/employees.js) and regional settings. */

const dayText = (value, locale, regional) => (value ? formatDate(String(value).slice(0, 10), regional || undefined, locale) : '');

export const EMPLOYEE_MESSAGES = {
  clearance: (t, { employee, clearance, expiresOn, left, regional, self }) => {
    const date = dayText(expiresOn, t.locale, regional);
    const state = left < 0 ? t('employees.notify.clearance.expired', { date }) : left === 0 ? t('employees.notify.clearance.today') : t('employees.notify.clearance.expires', { date, days: left });
    return {
      title: self ? t('employees.notify.clearance.own', { clearance, state }) : t('employees.notify.clearance.other', { clearance, employee, state }),
      body: t(self ? 'employees.notify.clearance.ownBody' : 'employees.notify.clearance.otherBody'),
    };
  },
};

/** `render` for notify(): the recipient's language and regional settings. */
export function employeeMessage(kind, params) {
  return (locale, regional) => EMPLOYEE_MESSAGES[kind](translator(locale), { ...params, regional: regional || null });
}
