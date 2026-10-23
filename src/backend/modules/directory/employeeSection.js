import { modules } from '../../platform/registry.js';
import { employeeSection } from './service.js';

/*
 * The «AD» section of an employee card (docs/employees.md → «Hooks for other modules»):
 * the linked AD account, «Create AD user for the employee» and the link picker. Shown to
 * HR (employees.hr) while this module is on; the actions themselves check ad.* rights.
 * Employees is an optional link: the section exists only while that module is installed.
 */
export function registerEmployeeSection() {
  modules.whenLoaded('employees', (employees) =>
    employees.registerEmployeeExtension({
      id: 'ad',
      module: 'directory',
      visible: (rights) => Boolean(rights.hr),
      load: (req, employee) => employeeSection(req, employee),
    })
  );
}
