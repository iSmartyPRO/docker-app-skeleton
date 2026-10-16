export default {
  id: 'files',
  module: 'files',
  version: 1,
  route: '/app/files',
  title: 'tour.files.title',
  steps: [
    { id: 'intro', title: 'tour.files.intro.title', text: 'tour.files.intro.text' },
    { id: 'places', target: 'files.places', placement: 'right', title: 'tour.files.places.title', text: 'tour.files.places.text' },
    { id: 'search', target: 'files.search', placement: 'right', title: 'tour.files.search.title', text: 'tour.files.search.text' },
    { id: 'upload', target: 'files.upload', placement: 'bottom', title: 'tour.files.upload.title', text: 'tour.files.upload.text' },
    { id: 'spaces', target: 'files.spaces', placement: 'right', title: 'tour.files.spaces.title', text: 'tour.files.spaces.text' },
    { id: 'trash', target: 'files.trash', placement: 'right', title: 'tour.files.trash.title', text: 'tour.files.trash.text' },
  ],
};
