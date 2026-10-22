export default {
  id: 'remote',
  module: 'remote',
  version: 1,
  route: '/app/remote',
  title: 'tour.remote.title',
  steps: [
    { id: 'intro', title: 'tour.remote.intro.title', text: 'tour.remote.intro.text' },
    { id: 'catalogue', target: 'rm.catalogue', placement: 'top', title: 'tour.remote.catalogue.title', text: 'tour.remote.catalogue.text' },
    { id: 'my', target: 'rm.my', placement: 'bottom', title: 'tour.remote.my.title', text: 'tour.remote.my.text' },
    // Journal and settings: only for administrators of the module.
    { id: 'journal', target: 'rm.journal', when: ({ can }) => can('remote.admin'), placement: 'bottom', title: 'tour.remote.journal.title', text: 'tour.remote.journal.text' },
  ],
};
