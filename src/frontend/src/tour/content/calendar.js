export default {
  id: 'calendar',
  module: 'calendar',
  version: 1,
  route: '/app/calendar',
  title: 'tour.calendar.title',
  steps: [
    { id: 'grid', target: 'cal.grid', placement: 'left', title: 'tour.calendar.grid.title', text: 'tour.calendar.grid.text' },
    { id: 'create', target: 'cal.create', placement: 'right', title: 'tour.calendar.create.title', text: 'tour.calendar.create.text' },
    { id: 'mini', target: 'cal.mini', placement: 'right', title: 'tour.calendar.mini.title', text: 'tour.calendar.mini.text' },
    { id: 'calendars', target: 'cal.calendars', placement: 'right', title: 'tour.calendar.calendars.title', text: 'tour.calendar.calendars.text' },
    { id: 'more', target: 'cal.more', placement: 'right', title: 'tour.calendar.more.title', text: 'tour.calendar.more.text' },
    { id: 'toolbar', target: 'cal.toolbar', placement: 'bottom', title: 'tour.calendar.toolbar.title', text: 'tour.calendar.toolbar.text' },
    { id: 'prefs', target: 'cal.prefs', placement: 'bottom', title: 'tour.calendar.prefs.title', text: 'tour.calendar.prefs.text' },
  ],
};
