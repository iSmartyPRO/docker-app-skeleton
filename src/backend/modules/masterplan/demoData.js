/* Demo facts other modules' demos build on (no side effects; exported through masterplan/api.js). */

/** Units the Contracts demo turns into sale contracts (they wait in «Бронь»). */
export const DEMO_CONTRACT_UNITS = ['A-1-03', 'A-1-05'];

/**
 * The demo sales people (shared demo accounts, the same keys as the CRM demo's DEMO_SELLERS): used when the
 * CRM — an optional package — is not installed, so the units still get managers and the project its team.
 */
export const DEMO_SELLERS_FALLBACK = {
  sales1: { key: 'emp.sales1', name: { ru: 'Алексей Продажин', en: 'Alexey Seller', ky: 'Алексей Продажин' } },
  sales3: { key: 'emp.sales3', name: { ru: 'Ольга Сделкина', en: 'Olga Deal', ky: 'Ольга Сделкина' } },
  north: { key: 'org.north', name: { ru: 'Игорь Северов', en: 'Igor North', ky: 'Игорь Северов' } },
};
