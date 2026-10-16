export default {
  id: 'dashboard',
  module: 'dashboard',
  version: 1,
  route: '/app/dashboard',
  title: 'tour.dashboard.title',
  steps: [
    { id: 'intro', target: 'dashboard.title', placement: 'bottom', title: 'tour.dashboard.intro.title', text: 'tour.dashboard.intro.text' },
    { id: 'grid', target: 'dashboard.grid', placement: 'top', title: 'tour.dashboard.grid.title', text: 'tour.dashboard.grid.text' },
    // Only for people who may arrange their own dashboard (the buttons are not rendered otherwise).
    { id: 'add', target: 'dashboard.add', placement: 'bottom', title: 'tour.dashboard.add.title', text: 'tour.dashboard.add.text' },
    { id: 'customize', target: 'dashboard.customize', placement: 'bottom', title: 'tour.dashboard.customize.title', text: 'tour.dashboard.customize.text' },
  ],
};
