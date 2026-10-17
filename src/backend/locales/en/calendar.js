export default {
  personal: 'My calendar',
  lead: {
    days_one: '{count} day',
    days_other: '{count} days',
    hours_one: '{count} hour',
    hours_other: '{count} hours',
    minutes_one: '{count} min',
    minutes_other: '{count} min',
  },
  notify: {
    invited: {
      title: 'Invitation: {title}',
      by: '{actor} invited you',
    },
    updated: { title: 'Event changed: {title}' },
    cancelled: { title: 'Event cancelled: {title}' },
    rsvp: {
      accepted: '{actor} accepted: {title}',
      declined: '{actor} declined: {title}',
      tentative: '{actor} may attend: {title}',
    },
    followNew: { title: 'New in “{calendar}”: {title}' },
    followUpdated: { title: 'Changed in “{calendar}”: {title}' },
    followDeleted: { title: 'Removed from “{calendar}”: {title}' },
    reminder: {
      now: 'Starting now: {title}',
      in: 'In {lead}: {title}',
    },
  },
};
