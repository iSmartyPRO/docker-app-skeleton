/** Guided tour of the AD directory (texts: i18n/directory.js → tour.directory.*). Steps whose anchor is not rendered (no right, phone) are skipped. */
export default {
  id: 'directory',
  module: 'directory',
  version: 1,
  route: '/app/directory',
  title: 'tour.directory.title',
  steps: [
    { id: 'intro', title: 'tour.directory.intro.title', text: 'tour.directory.intro.text' },
    { id: 'demo', target: 'directory.demo', placement: 'bottom', title: 'tour.directory.demo.title', text: 'tour.directory.demo.text' },
    { id: 'tree', target: 'directory.tree', placement: 'right', title: 'tour.directory.tree.title', text: 'tour.directory.tree.text' },
    { id: 'filters', target: 'directory.filters', placement: 'bottom', title: 'tour.directory.filters.title', text: 'tour.directory.filters.text' },
    { id: 'list', target: 'directory.list', placement: 'top', title: 'tour.directory.list.title', text: 'tour.directory.list.text' },
    { id: 'create', target: 'directory.create', placement: 'bottom', title: 'tour.directory.create.title', text: 'tour.directory.create.text' },
    { id: 'columns', target: 'directory.columns', placement: 'left', title: 'tour.directory.columns.title', text: 'tour.directory.columns.text' },
    { id: 'nav', target: 'directory.nav', placement: 'right', title: 'tour.directory.nav.title', text: 'tour.directory.nav.text' },
  ],
};
