export default {
  id: 'org',
  purpose: 'The org structure is the company’s map in the portal: the legal entity, the head office, branches, departments and sites with their heads. It is a core service and always on. Approvals route a document to «the head of the author’s unit», modules pick units by purpose (warehouses of a site, construction sites), the org chart shows who reports to whom.',
  audience: 'The portal administrator or HR builds the tree; heads and staff see the org chart; modules and Approvals use it by themselves.',
  setup: [
    {
      title: 'Unit types',
      text: 'Check the types on «Types and purposes»: by default Company, Head office, Branch, Department, Site. Rename them for your company or add your own (e.g. «Store»).',
    },
    {
      title: 'The company and its legal entity',
      text: 'Create the top node of type «Company» and link it to a legal entity from the [legal entities directory](/admin/settings/legalEntities). A group of companies gets one node per entity.',
    },
    {
      title: 'Offices, branches, departments, sites',
      text: 'Add the units and drag them into place. Set a time zone only where it differs: the others inherit it from above.',
    },
    {
      title: 'Heads',
      text: 'Give every unit a head — an employee (with the Employees module) or a portal account. Without one, the question goes up to the unit above.',
    },
    {
      title: 'People in units',
      text: 'Without the Employees module place accounts in units — on the unit card or in «Users → a person → Org structure». With the module the unit comes from the employee card.',
    },
    {
      title: 'Approval routes',
      text: 'In the [routes](/admin/settings/approvals) add a stage with the approver «Head of the author’s unit». Pick an author in the preview to see who exactly will approve.',
    },
  ],
  roles: {
    'org.manage': 'Changes the tree, types and purposes, places people. Everyone signed in can look at the structure.',
  },
  access: 'Anyone signed in reads the structure — it is the company’s shared map. The unit of an account is changed by holders of `org.manage` or `users.manage`.',
  scenarios: [
    {
      title: 'A request goes to the head',
      text: 'An accountant of «Finance» files a purchase request — the head of the department approves first. If the head files it, the director approves.',
    },
    {
      title: 'A new branch',
      text: 'Create «North branch» with the city’s time zone, drag the sales team and the site into it — approvals and deadlines follow the new place at once.',
    },
    {
      title: 'A reorganisation',
      text: 'A team moves to another department: drag it. The move shows in the unit’s history and the activity log; running approvals stay as they are.',
    },
  ],
  faq: [
    {
      q: 'How do I delete a unit?',
      a: 'Only an empty unit without subunits and people can be deleted. Otherwise close it — «Closed» keeps the history and it disappears from pickers.',
    },
    {
      q: 'What if no head is found?',
      a: 'The route’s escalation people approve the stage, otherwise the module administrators. The process history notes it.',
    },
    {
      q: 'Do I need the Employees module?',
      a: 'No. The structure works with portal accounts alone. The Employees module adds people without portal access, explicit managers and headcount.',
    },
    {
      q: 'Can I undo a move?',
      a: 'Right after a drop there is «Undo». Later, drag the unit back; both moves stay in the history.',
    },
  ],
};
