export default {
  id: 'companies',
  module: 'companies',
  version: 1,
  route: '/app/companies',
  title: 'tour.companies.title',
  steps: [
    { id: 'intro', title: 'tour.companies.intro.title', text: 'tour.companies.intro.text' },
    { id: 'list', target: 'cmp.nav.companies', placement: 'right', title: 'tour.companies.list.title', text: 'tour.companies.list.text' },
    { id: 'filters', target: 'cmp.filters', placement: 'bottom', title: 'tour.companies.filters.title', text: 'tour.companies.filters.text' },
    { id: 'create', target: 'cmp.create', placement: 'bottom', title: 'tour.companies.create.title', text: 'tour.companies.create.text' },
    { id: 'people', target: 'cmp.nav.people', placement: 'right', title: 'tour.companies.people.title', text: 'tour.companies.people.text' },
    { id: 'mine', target: 'cmp.nav.mine', placement: 'right', title: 'tour.companies.mine.title', text: 'tour.companies.mine.text' },
    { id: 'archive', target: 'cmp.nav.archive', placement: 'right', title: 'tour.companies.archive.title', text: 'tour.companies.archive.text' },
    { id: 'settings', target: 'cmp.nav.settings', placement: 'right', title: 'tour.companies.settings.title', text: 'tour.companies.settings.text' },
  ],
};
