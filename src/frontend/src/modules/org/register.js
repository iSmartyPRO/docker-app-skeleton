/*
 * Frontend entry of the Org structure module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { registerTour } from '../../tour/engine';
import orgTour from './tour';

registerTour(orgTour);
