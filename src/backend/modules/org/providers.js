/*
 * The org structure is a core service and must work without the Employees
 * module. When that module is on it lends the org structure what only it
 * knows — who the head employee's portal account is, explicit managers,
 * headcount — through one provider registered at import time
 * (modules/employees/index.js). Every function is optional; the core falls
 * back to portal accounts (users.org_unit_id, org_units.head_user_id).
 *
 *   registerPeopleProvider({
 *     enabled: async () => boolean,                      // the module is on
 *     usersOfEmployees: async (ids) => Map(employeeId → userId),
 *     employeeUnit: async (employeeId) => ({ unitId, userId }) | null,
 *     explicitManagerOf: async (userId) => userId | null, // «Руководитель» on the employee card
 *     headcount: async () => Map(unitId → n),             // working employees per unit
 *     employeesById: async (ids) => Map(id → { id, name, photoUrl, userId, position }),
 *     employeeOfUser: async (userId) => ({ id, name, status, position, photoUrl }) | null,
 *     searchEmployees: async (q, { req, canManageOrg }) => [{ id, name, photoUrl, userId, position }] | null,  // head picker (null: not for this person)
 *   })
 */

let provider = null;

export function registerPeopleProvider(definition) {
  provider = definition || null;
  return () => {
    if (provider === definition) provider = null;
  };
}

/** The provider while its module is on, else null. */
export async function activeProvider() {
  if (!provider) return null;
  try {
    if (provider.enabled && !(await provider.enabled())) return null;
  } catch {
    return null;
  }
  return provider;
}
