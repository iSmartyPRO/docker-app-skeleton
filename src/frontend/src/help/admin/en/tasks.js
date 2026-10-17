export default {
  id: 'tasks',
  purpose: 'Tasks is the shared tool for assignments: projects with their own statuses, a board and a list, deadlines, reminders, a result and a chat in every task. Managers see who does what and what is overdue without spreadsheets or messenger threads.',
  audience: 'Every employee. Managers set assignments and watch deadlines, assignees accept tasks and hand in results, the tasks administrator sets up projects and rules.',
  setup: [
    {
      title: 'Decide who creates projects',
      text: 'In the [module settings](/admin/settings/tasks) choose «Everyone» or «Administrators only». «Everyone» suits small companies.',
    },
    {
      title: 'Set acceptance deadlines',
      text: 'How many hours an assignee has to press «Accept» — for normal and important tasks. A task not accepted in time is highlighted and the originator is notified.',
    },
    {
      title: 'Mark the leadership group',
      text: 'Tasks set by members of the chosen groups become «Orders»: they are listed separately and cannot be quietly declined.',
    },
    {
      title: 'Create department projects',
      text: 'The project key (e.g. `HR`) prefixes task numbers. Access: «Everyone can edit», «Everyone reads» or «Only me» — refine it later by groups and roles.',
    },
    {
      title: 'Grant tasks.admin',
      text: 'To those who manage every project (an office manager or PMO) — through a role in «Roles».',
    },
  ],
  roles: {
    'tasks.admin': 'Manage every project (statuses, access, archive) and the module settings. Other people’s personal tasks without a project stay private even to the administrator.',
  },
  access: 'Access is set per project: view, edit or manage — for everyone, a user, a group or a role. Task participants (originator, assignee, co-assignees, auditors) see the task regardless of the project level.',
  scenarios: [
    {
      title: 'Director’s orders',
      text: 'The director is in the «Leadership» group. Their tasks are marked as orders, the assignee must accept within 4 hours, and overdue ones show on the dashboard.',
    },
    {
      title: 'Recurring tasks',
      text: 'Accounting creates a «Supplier reconciliation» template scheduled «monthly on the 25th» — the task appears by itself and goes to the person in charge.',
    },
    {
      title: 'A request flow',
      text: 'The IT team sets up an «IT requests» flow: new tasks are distributed among the team in turn.',
    },
  ],
  faq: [
    {
      q: 'What happens to tasks if the module is switched off?',
      a: 'They are hidden, not deleted. Switching the module back on restores everything.',
    },
    {
      q: 'Why does a task have no chat?',
      a: 'The task chat is part of the Chats module. Switch it on and every task gets its discussion.',
    },
    {
      q: 'Can a project key be changed?',
      a: 'No — the key is part of task numbers and links, so it is permanent.',
    },
    {
      q: 'Are deadlines shown in the calendar?',
      a: 'Yes, with the Calendar on: everyone sees their task deadlines next to their meetings.',
    },
  ],
};
