/*
 * Frontend entry of the Remote access module (imported by its web/index.js): what
 * the module adds outside its own pages. Keep it small — anything heavy is lazy.
 */
import { registerTour } from '../../tour/engine';
import remoteTour from './tour';

registerTour(remoteTour);
