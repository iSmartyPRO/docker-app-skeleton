/** Guided tour of the CRM (texts: i18n/businessTours.js → tour.crm.*). Steps whose anchor is not on the page (no right, phone layout) are skipped. */
export default {
  id: 'crm',
  module: 'crm',
  version: 1,
  route: '/app/crm',
  title: 'tour.crm.title',
  steps: [
    { id: 'intro', title: 'tour.crm.intro.title', text: 'tour.crm.intro.text' },
    { id: 'pipelines', target: 'crm.pipelines', placement: 'bottom', title: 'tour.crm.pipelines.title', text: 'tour.crm.pipelines.text' },
    { id: 'board', target: 'crm.board', placement: 'top', title: 'tour.crm.board.title', text: 'tour.crm.board.text' },
    { id: 'card', target: 'crm.card', placement: 'right', title: 'tour.crm.card.title', text: 'tour.crm.card.text' },
    { id: 'counters', target: 'crm.counters', placement: 'bottom', title: 'tour.crm.counters.title', text: 'tour.crm.counters.text' },
    { id: 'filters', target: 'crm.filters', placement: 'bottom', title: 'tour.crm.filters.title', text: 'tour.crm.filters.text' },
    { id: 'views', target: 'crm.views', placement: 'bottom', title: 'tour.crm.views.title', text: 'tour.crm.views.text' },
    { id: 'activities', target: 'crm.activities', placement: 'right', title: 'tour.crm.activities.title', text: 'tour.crm.activities.text' },
  ],
};
