/*
 * Frontend entry of the CRM module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { registerTour } from '../../tour/engine';
import crmTour from './tour';
// How deal events read in conversations (Chat).
import './chatEvents';

registerTour(crmTour);
