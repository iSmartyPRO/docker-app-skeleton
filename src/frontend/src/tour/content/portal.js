/** The portal tour: started on the first sign-in, again from Help → «Пройти тур». */
export default {
  id: 'portal',
  module: 'portal',
  version: 1,
  title: 'tour.portal.title',
  steps: [
    { id: 'welcome', title: 'tour.portal.welcome.title', text: 'tour.portal.welcome.text' },
    { id: 'launcher', target: 'header.launcher', placement: 'bottom', title: 'tour.portal.launcher.title', text: 'tour.portal.launcher.text' },
    { id: 'inbox', target: 'header.inbox', placement: 'bottom', title: 'tour.portal.inbox.title', text: 'tour.portal.inbox.text' },
    { id: 'notifications', target: 'header.notifications', placement: 'bottom', title: 'tour.portal.notifications.title', text: 'tour.portal.notifications.text' },
    { id: 'chat', target: 'header.chat', placement: 'bottom', title: 'tour.portal.chat.title', text: 'tour.portal.chat.text' },
    { id: 'help', target: 'header.help', placement: 'bottom', title: 'tour.portal.help.title', text: 'tour.portal.help.text' },
    { id: 'theme', target: 'header.theme', placement: 'bottom', title: 'tour.portal.theme.title', text: 'tour.portal.theme.text' },
    { id: 'admin', target: 'header.admin', placement: 'bottom', title: 'tour.portal.admin.title', text: 'tour.portal.admin.text' },
    { id: 'profile', target: 'header.user', placement: 'bottom', title: 'tour.portal.profile.title', text: 'tour.portal.profile.text' },
    { id: 'done', title: 'tour.portal.done.title', text: 'tour.portal.done.text' },
  ],
};
