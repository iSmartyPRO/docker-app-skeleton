/*
 * Registers the guided tours of the Org structure settings and the Employees
 * module with the tours engine (docs/extending.md → «Guided tours»).
 * Imported once by App.jsx, so module tours auto-start on the first visit.
 */
import { registerTour } from '../../tour/engine';
import orgTour from '../org/tour';
import employeesTour from '../employees/tour';

export const PEOPLE_TOURS = [orgTour, employeesTour];

PEOPLE_TOURS.forEach((tour) => registerTour(tour));
