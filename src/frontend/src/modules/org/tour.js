/** Guided tour of Settings → Org structure (texts: i18n/org.js → tour.org.*). */
export default {
  id: 'org',
  module: 'org',
  version: 1,
  route: '/admin/settings/org',
  title: 'tour.org.title',
  steps: [
    { id: 'intro', title: 'tour.org.intro.title', text: 'tour.org.intro.text' },
    { id: 'tree', target: 'org.tree', placement: 'right', title: 'tour.org.tree.title', text: 'tour.org.tree.text' },
    { id: 'add', target: 'org.add', placement: 'bottom', title: 'tour.org.add.title', text: 'tour.org.add.text' },
    { id: 'details', target: 'org.details', placement: 'left', title: 'tour.org.details.title', text: 'tour.org.details.text' },
    { id: 'chart', target: 'org.tab.chart', placement: 'bottom', title: 'tour.org.chart.title', text: 'tour.org.chart.text' },
    { id: 'types', target: 'org.tab.types', placement: 'bottom', title: 'tour.org.types.title', text: 'tour.org.types.text' },
    { id: 'done', title: 'tour.org.done.title', text: 'tour.org.done.text' },
  ],
};
