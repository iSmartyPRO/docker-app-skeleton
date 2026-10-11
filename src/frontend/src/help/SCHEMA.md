# Help content schema

One file per module: `help/content/<id>.js`, `export default { … }`. Every text is `{ ru, en }`.
Russian is the primary language of the portal's users; both must say the same thing.

```js
export default {
  id: 'tasks',                 // = file name; also the module id for /app/<id>
  icon: 'tasks',               // a MenuIcon name (components/icons/menuIcons.jsx, premiumIcons.jsx)
  title: { ru, en },           // "Задачи"
  tagline: { ru, en },         // one line, what it is for
  summary: { ru, en },         // 2–3 sentences: what you can do here
  highlights: [                // 4–6 key capabilities = the SHORT info (scan in 10 seconds)
    { icon: '⚡', title: { ru, en }, text: { ru, en } },   // text: one sentence
  ],
  tips: [{ ru, en }],          // 3–6 one-line practical tips
  sections: [                  // the FULL guide
    {
      id: 'results',           // anchor: /help/tasks#results  (kebab-case, unique in the file)
      title: { ru, en },
      body: { ru, en },        // rich text, see below
      steps: [{ ru, en }],     // optional: numbered how-to
      example: { title: { ru, en }, body: { ru, en } },   // optional: a concrete case
      note: { ru, en },        // optional: callout (important nuance)
    },
  ],
  faq: [{ q: { ru, en }, a: { ru, en } }],                 // 3–8 real questions
  fields: {                    // hints shown next to form fields via <Hint id="tasks.resultRequired" />
    resultRequired: { title: { ru, en }, text: { ru, en }, more: 'results' },  // text: 1–2 sentences; more: section id
  },
  related: ['calendar', 'chat'],
};
```

Rich text (body, text, a, note): paragraphs separated by a blank line; `**bold**`, `` `code` ``,
lines starting with `- ` are bullets, `1. ` numbered; `[label](/app/tasks)` internal links.
Write for end users, not developers: plain words, concrete examples, no implementation details.
