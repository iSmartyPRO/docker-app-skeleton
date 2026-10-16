/*
 * Registers what the AD directory module adds outside its own page (imported once by
 * App.jsx): its guided tour, and the «AD» tab of employee cards (Employees module,
 * modules/employees/extensions.js; the server side is modules/directory/employeeSection.js).
 */
import { lazy } from 'react';
import { registerTour } from '../../tour/engine';
import { registerEmployeeTab } from '../employees/extensions';
import directoryTour from './tour';

registerTour(directoryTour);

registerEmployeeTab({
  id: 'ad',
  labelKey: 'directory.employeeTab.title',
  order: 50,
  when: ({ data }) => Boolean(data),
  Component: lazy(() => import('./EmployeeAdTab')),
});
