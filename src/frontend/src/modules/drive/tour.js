/** Guided tour of the File server (texts: tour.drive.*, copied into the package by module.json localeKeys); registered by register.js. */
export default {
  id: 'drive',
  module: 'drive',
  version: 1,
  route: '/app/drive',
  title: 'tour.drive.title',
  steps: [
    { id: 'intro', title: 'tour.drive.intro.title', text: 'tour.drive.intro.text' },
    { id: 'nav', target: 'drive.nav', placement: 'right', title: 'tour.drive.nav.title', text: 'tour.drive.nav.text' },
    { id: 'folders', target: 'drive.folders', placement: 'right', title: 'tour.drive.folders.title', text: 'tour.drive.folders.text' },
    { id: 'access', target: 'drive.access', placement: 'right', title: 'tour.drive.access.title', text: 'tour.drive.access.text' },
    { id: 'connections', target: 'drive.connections', placement: 'right', title: 'tour.drive.connections.title', text: 'tour.drive.connections.text' },
  ],
};
