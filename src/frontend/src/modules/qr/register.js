/*
 * Frontend entry of the QR codes module (imported by its web/index.js): what the
 * module adds outside its own pages. Keep it small — anything heavy is lazy.
 */
import { registerTour } from '../../tour/engine';
import qrTour from './tour';

registerTour(qrTour);
