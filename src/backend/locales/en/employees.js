export default {
  notify: {
    clearance: {
      expired: 'expired on {date}',
      today: 'expires today',
      expires: 'expires on {date} (in {days} d)',
      own: 'Your clearance «{clearance}» {state}',
      other: 'Clearance «{clearance}»: {employee} — {state}',
      ownBody: 'Contact HR to renew it.',
      otherBody: 'Renew it, or keep the person away from work that needs it.',
    },
  },
  csv: {
    head: ['Last name', 'First name', 'Middle name', 'Position', 'Unit', 'Site', 'Status', 'Work e-mail', 'Work phone', 'Mobile'],
    hrHead: ['Personnel number', 'Employment', 'Hire date', 'Termination date', 'Portal account'],
    status: { active: 'Working', vacation: 'On vacation', terminated: 'Terminated', candidate: 'Candidate' },
    employment: { staff: 'Staff', part_time: 'Part-time', contractor: 'Contractor', seasonal: 'Seasonal' },
  },
};
