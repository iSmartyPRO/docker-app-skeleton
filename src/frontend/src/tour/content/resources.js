export default {
  id: 'resources',
  module: 'resources',
  version: 1,
  route: '/app/resources',
  title: 'tour.resources.title',
  steps: [
    { id: 'intro', target: 'rs.head', placement: 'bottom', title: 'tour.resources.intro.title', text: 'tour.resources.intro.text' },
    { id: 'grid', target: 'rs.grid', placement: 'top', title: 'tour.resources.grid.title', text: 'tour.resources.grid.text' },
    { id: 'filters', target: 'rs.filters', placement: 'bottom', title: 'tour.resources.filters.title', text: 'tour.resources.filters.text' },
    { id: 'customize', target: 'rs.customize', placement: 'bottom', title: 'tour.resources.customize.title', text: 'tour.resources.customize.text' },
    // The catalogue: only for administrators of the board.
    { id: 'manage', target: 'rs.manage', placement: 'bottom', title: 'tour.resources.manage.title', text: 'tour.resources.manage.text' },
    { id: 'add', target: 'rs.add', route: '/app/resources/manage', when: ({ can }) => can('resources.admin'), placement: 'bottom', title: 'tour.resources.add.title', text: 'tour.resources.add.text' },
    { id: 'modules', target: 'rs.modules', route: '/app/resources/manage', when: ({ can }) => can('resources.admin'), placement: 'bottom', title: 'tour.resources.modules.title', text: 'tour.resources.modules.text' },
    { id: 'cats', target: 'rs.cats', route: '/app/resources/manage', when: ({ can }) => can('resources.admin'), placement: 'bottom', title: 'tour.resources.cats.title', text: 'tour.resources.cats.text' },
  ],
};
