/** Guided tour of the Employees module (texts: i18n/employees.js → tour.employees.*). Steps without their anchor (no right) are skipped. */
export default {
  id: 'employees',
  module: 'employees',
  version: 1,
  route: '/app/employees',
  title: 'tour.employees.title',
  steps: [
    { id: 'intro', title: 'tour.employees.intro.title', text: 'tour.employees.intro.text' },
    { id: 'list', target: 'emp.list', placement: 'top', title: 'tour.employees.list.title', text: 'tour.employees.list.text' },
    { id: 'filters', target: 'emp.filters', placement: 'bottom', title: 'tour.employees.filters.title', text: 'tour.employees.filters.text' },
    { id: 'add', target: 'emp.add', placement: 'bottom', title: 'tour.employees.add.title', text: 'tour.employees.add.text' },
    { id: 'export', target: 'emp.export', placement: 'bottom', title: 'tour.employees.export.title', text: 'tour.employees.export.text' },
    { id: 'chart', target: 'emp.nav.chart', placement: 'right', title: 'tour.employees.chart.title', text: 'tour.employees.chart.text' },
    { id: 'import', target: 'emp.nav.import', placement: 'right', title: 'tour.employees.import.title', text: 'tour.employees.import.text' },
    { id: 'done', title: 'tour.employees.done.title', text: 'tour.employees.done.text' },
  ],
};
