/*
 * Built-in tours. Adding one: a file here (see engine.js for the format),
 * a line below, its texts in i18n/tours.js (ru + en) and data-tour="…"
 * anchors on the page — docs/extending.md → «Guided tours».
 */
import { registerTour } from '../engine.js';
import portal from './portal.js';
import dashboard from './dashboard.js';
import tasks from './tasks.js';
import files from './files.js';
import drive from './drive.js';
import chat from './chat.js';
import calendar from './calendar.js';
import kb from './kb.js';
import companies from './companies.js';
import resources from './resources.js';
import notifications from './notifications.js';

export const BUILTIN_TOURS = [portal, dashboard, tasks, files, drive, chat, calendar, kb, companies, resources, notifications];

BUILTIN_TOURS.forEach((tour) => registerTour(tour));
