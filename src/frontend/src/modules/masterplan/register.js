/*
 * Frontend entry of the Masterplan module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { lazy } from 'react';
import { registerTour } from '../../tour/engine';
import { registerLinkBlock } from '../../platform/links';
import masterplanTour from './tour';

registerTour(masterplanTour);

// «Связи» of a CRM deal: the units linked to it (while Masterplan is on).
registerLinkBlock('crm.deal', { id: 'masterplan', module: 'masterplan', Component: lazy(() => import('./integrations/DealUnitsBlock')) });
