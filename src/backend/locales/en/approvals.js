export default {
  notify: {
    quoted: '“{title}”',
    by: 'By {actor}',
    due: 'Due: {date}',
    stage: 'Stage: {stage}',
    request: {
      title: 'Waiting for your approval: {doc}',
      delegated: '{actor} passed an approval to you: {doc}',
    },
    question: {
      title: '{actor} asks about {doc}',
      body: 'Answer to return it to approval.',
    },
    answer: {
      title: '{actor} answered: {doc}',
      body: 'The document is back on your approval.',
    },
    approved: { title: 'Approved: {doc}' },
    progress: { title: 'Stage “{stage}” approved: {doc}' },
    rejected: { title: 'Rejected: {doc}' },
    returned: {
      title: 'Returned for rework: {doc}',
      body: 'Make the changes and send it again.',
    },
    withdrawn: { title: 'Withdrawn by the author: {doc}' },
    reminder: { title: 'Reminder: {doc} waits for your decision' },
    overdue: { title: 'Overdue: {doc}' },
    escalation: {
      title: 'Escalation: {doc} is overdue',
      waiting: 'Waiting for: {approvers}',
    },
    noApprovers: {
      title: 'Nobody can approve {doc}',
      body: 'Stage “{stage}” has no active approvers. Check the route.',
    },
  },
};
