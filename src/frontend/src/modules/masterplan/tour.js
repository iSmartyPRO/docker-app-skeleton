/** Guided tour of the Masterplan (texts: i18n/businessTours.js → tour.masterplan.*). Opens the last (or only) project's site plan; without a project the plan steps are skipped. */
export default {
  id: 'masterplan',
  module: 'masterplan',
  version: 1,
  route: '/app/masterplan',
  title: 'tour.masterplan.title',
  steps: [
    { id: 'layers', target: 'mp.layers', placement: 'bottom', title: 'tour.masterplan.layers.title', text: 'tour.masterplan.layers.text' },
    { id: 'legend', target: 'mp.legend', placement: 'bottom', title: 'tour.masterplan.legend.title', text: 'tour.masterplan.legend.text' },
    { id: 'unit', target: 'mp.stage', placement: 'top', title: 'tour.masterplan.unit.title', text: 'tour.masterplan.unit.text' },
    { id: 'chess', target: 'mp.nav.chess', placement: 'right', title: 'tour.masterplan.chess.title', text: 'tour.masterplan.chess.text' },
    { id: 'registry', target: 'mp.nav.registry', placement: 'right', title: 'tour.masterplan.registry.title', text: 'tour.masterplan.registry.text' },
    { id: 'construction', target: 'mp.nav.construction', placement: 'right', title: 'tour.masterplan.construction.title', text: 'tour.masterplan.construction.text' },
    { id: 'bookings', target: 'mp.nav.bookings', placement: 'right', title: 'tour.masterplan.bookings.title', text: 'tour.masterplan.bookings.text' },
  ],
};
