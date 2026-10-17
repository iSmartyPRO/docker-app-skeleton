export default {
  priority: ['Low', 'Normal', 'High', 'Urgent'],
  noProject: 'No project',
  starter: {
    name: 'General',
    description: 'Team tasks that do not belong to a specific project.',
  },
  // Statuses of a new project, in order (to do → done).
  statuses: ['To do', 'In progress', 'Review', 'Done'],
  notify: {
    deadline: 'Deadline: {due}',
    assigned: {
      title: '{ref} is assigned to you',
      acceptBy: 'Please accept it by {time}',
    },
    accepted: {
      title: '{ref} is accepted',
      comment: ': “{comment}”',
    },
    acceptOverdue: {
      title: 'Accept {ref}: waiting {hours} h',
      body: 'The originator is waiting for you to accept the task or discuss it.',
    },
    notAccepted: {
      title: '{ref} is not accepted in {hours} h',
      assignee: 'Assignee: {name}',
    },
    status: { title: '{ref}: status changed to “{status}”' },
    comment: { title: 'New comment on {ref}' },
    mention: {
      title: '{actor} mentioned you in {ref}',
      body: '{actor}: {snippet}\n{title}',
    },
    priority: { title: '{ref}: priority is now {priority}' },
    dueSoon: { title: '{ref} is due within 24 hours' },
    projectNew: { title: 'New task in {project}: {ref}' },
    projectDone: { title: '{ref} is done ({project})' },
    overdue: { title: '{ref} is overdue' },
    reminder: { title: 'Reminder: {ref}' },
    result: { title: 'Result added to {ref}' },
  },
};
