export default {
  id: 'kb',
  module: 'kb',
  version: 1,
  route: '/app/kb',
  title: 'tour.kb.title',
  steps: [
    { id: 'intro', target: 'kb.hero', placement: 'bottom', title: 'tour.kb.intro.title', text: 'tour.kb.intro.text' },
    { id: 'search', target: 'kb.search', placement: 'right', title: 'tour.kb.search.title', text: 'tour.kb.search.text' },
    { id: 'tree', target: 'kb.tree', placement: 'right', title: 'tour.kb.tree.title', text: 'tour.kb.tree.text' },
    { id: 'folders', target: 'kb.folders', placement: 'bottom', title: 'tour.kb.folders.title', text: 'tour.kb.folders.text' },
    { id: 'recent', target: 'kb.recent', placement: 'top', title: 'tour.kb.recent.title', text: 'tour.kb.recent.text' },
    // Only for editors and managers of the knowledge base (the buttons are not rendered otherwise).
    { id: 'newFolder', target: 'kb.newFolder', placement: 'bottom', title: 'tour.kb.newFolder.title', text: 'tour.kb.newFolder.text' },
    { id: 'access', target: 'kb.access', placement: 'bottom', title: 'tour.kb.access.title', text: 'tour.kb.access.text' },
  ],
};
