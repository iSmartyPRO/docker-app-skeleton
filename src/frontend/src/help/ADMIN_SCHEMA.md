# Admin docs schema («О модуле»)

One file per module per language: `help/admin/<lang>/<id>.js`, `export default { … }`, plain strings
(`{ ru, en }` below marks a text; per-language rules as in [SCHEMA.md](SCHEMA.md)). It is the administrator's page
`/admin/modules/<id>/docs` (spec platform-2.0 §2). Rich text follows
[SCHEMA.md](SCHEMA.md) (`**bold**`, `` `code` ``, `- ` bullets, `[label](/admin/settings/tasks)` links).

The page also shows, without anything written here:

- the version, status, category and changelog (server manifest, `modules/manifest.js`);
- **roles and permissions** — every permission of the module from the catalog, with its i18n title and description;
- **dependencies and links** — `requires`, `enhances` and the modules that enhance this one;
- the highlights and the link to the user guide from `help/content/<id>.js` (when it exists).

```js
export default {
  id: 'tasks',                  // = file name = module id
  purpose: { ru, en },          // what the module does for the company (2–3 sentences)
  audience: { ru, en },         // who uses it: roles in the company, one short paragraph or bullets
  setup: [                      // set-up steps, in order (3–7)
    { title: { ru, en }, text: { ru, en } },
  ],
  roles: {                      // optional: what a permission means in practice, beyond its label
    'tasks.admin': { ru, en },
  },
  access: { ru, en },           // optional: access beyond permissions (per-project lists, owners…)
  scenarios: [                  // 2–4 typical cases from a real company
    { title: { ru, en }, text: { ru, en } },
  ],
  faq: [{ q: { ru, en }, a: { ru, en } }],   // 3–6 questions administrators really ask
};
```

Write for the administrator who sets the portal up: what to switch on, in which order, who gets which
right, what happens to data. No implementation details (those live in `docs/<module>.md`).
