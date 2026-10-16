export default {
  id: 'chat',
  module: 'chat',
  version: 1,
  route: '/app/chat',
  title: 'tour.chat.title',
  steps: [
    { id: 'intro', target: 'chat.list', placement: 'right', title: 'tour.chat.intro.title', text: 'tour.chat.intro.text' },
    { id: 'new', target: 'chat.new', placement: 'bottom', title: 'tour.chat.new.title', text: 'tour.chat.new.text' },
    { id: 'search', target: 'chat.search', placement: 'right', title: 'tour.chat.search.title', text: 'tour.chat.search.text' },
    { id: 'filters', target: 'chat.filters', placement: 'right', title: 'tour.chat.filters.title', text: 'tour.chat.filters.text' },
    { id: 'header', target: 'header.chat', placement: 'bottom', title: 'tour.chat.header.title', text: 'tour.chat.header.text' },
  ],
};
