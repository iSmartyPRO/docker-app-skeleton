export default {
  id: 'tasks',
  module: 'tasks',
  version: 1,
  route: '/app/tasks',
  title: 'tour.tasks.title',
  steps: [
    { id: 'intro', target: 'tasks.hero', placement: 'bottom', title: 'tour.tasks.intro.title', text: 'tour.tasks.intro.text' },
    { id: 'create', target: 'tasks.create', placement: 'bottom', title: 'tour.tasks.create.title', text: 'tour.tasks.create.text' },
    { id: 'roles', target: 'tasks.roles', placement: 'bottom', title: 'tour.tasks.roles.title', text: 'tour.tasks.roles.text' },
    { id: 'projects', target: 'tasks.projects', placement: 'right', title: 'tour.tasks.projects.title', text: 'tour.tasks.projects.text' },
    { id: 'done', title: 'tour.tasks.done.title', text: 'tour.tasks.done.text' },
  ],
};
