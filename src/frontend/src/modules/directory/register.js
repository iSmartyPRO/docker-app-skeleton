/*
 * Registers what the AD directory module adds outside its own page (loaded by
 * modules/registry.js): its guided tour, and the «AD» tab of employee cards (Employees module,
 * the «employees.tabs» extension point; the server side is modules/directory/employeeSection.js).
 */
import { lazy } from 'react';
import { registerTour } from '../../tour/engine';
import { contribute } from '../../platform/extensions';
import directoryTour from './tour';

registerTour(directoryTour);

// The «AD» tab of employee cards (the Employees module reads «employees.tabs»).
contribute('employees.tabs', {
  id: 'ad',
  labelKey: 'directory.employeeTab.title',
  order: 50,
  when: ({ data }) => Boolean(data),
  Component: lazy(() => import('./EmployeeAdTab')),
});
