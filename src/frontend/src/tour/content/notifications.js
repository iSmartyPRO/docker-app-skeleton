/** Account → Notifications: started from the «Тур» button of the page. */
export default {
  id: 'notifications',
  module: 'notifications',
  version: 1,
  route: '/account/notifications',
  title: 'tour.notifications.title',
  steps: [
    { id: 'bell', target: 'header.notifications', placement: 'bottom', title: 'tour.notifications.bell.title', text: 'tour.notifications.bell.text' },
    { id: 'channels', target: 'np.channels', placement: 'bottom', title: 'tour.notifications.channels.title', text: 'tour.notifications.channels.text' },
    { id: 'test', target: 'np.test', placement: 'left', title: 'tour.notifications.test.title', text: 'tour.notifications.test.text' },
    { id: 'quiet', target: 'np.quiet', placement: 'top', title: 'tour.notifications.quiet.title', text: 'tour.notifications.quiet.text' },
    { id: 'events', target: 'np.events', placement: 'top', title: 'tour.notifications.events.title', text: 'tour.notifications.events.text' },
    { id: 'subs', target: 'np.subs', placement: 'top', title: 'tour.notifications.subs.title', text: 'tour.notifications.subs.text' },
    { id: 'history', target: 'np.history', placement: 'top', title: 'tour.notifications.history.title', text: 'tour.notifications.history.text' },
  ],
};
