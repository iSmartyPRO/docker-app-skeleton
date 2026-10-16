/** Guided tour of «Ждёт меня» (texts: i18n/businessTours.js → tour.approvals.*). Row steps are skipped while nothing waits. */
export default {
  id: 'approvals',
  module: 'approvals',
  version: 1,
  route: '/app/approvals',
  title: 'tour.approvals.title',
  steps: [
    { id: 'intro', target: 'header.inbox', placement: 'bottom', title: 'tour.approvals.intro.title', text: 'tour.approvals.intro.text' },
    { id: 'kpis', target: 'apr.kpis', placement: 'bottom', title: 'tour.approvals.kpis.title', text: 'tour.approvals.kpis.text' },
    { id: 'row', target: 'apr.row', placement: 'bottom', title: 'tour.approvals.row.title', text: 'tour.approvals.row.text' },
    { id: 'actions', target: 'apr.actions', placement: 'left', title: 'tour.approvals.actions.title', text: 'tour.approvals.actions.text' },
    { id: 'mine', target: 'apr.tab.mine', placement: 'bottom', title: 'tour.approvals.mine.title', text: 'tour.approvals.mine.text' },
    { id: 'substitute', target: 'apr.substitute', placement: 'bottom', title: 'tour.approvals.substitute.title', text: 'tour.approvals.substitute.text' },
  ],
};
