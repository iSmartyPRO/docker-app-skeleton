export default {
  // Local names of currencies (others show their ISO code).
  currency: {
    KGS: 'KGS',
  },
  email: {
    open: 'Open',
    footer: 'You receive this because notifications are on in your profile.',
  },
  notify: {
    test: {
      title: 'Notification test',
      body: 'If you can read this, the channel works.',
    },
    adminTest: {
      title: '{app}: notification test',
    },
  },
  // One-time sign-in codes and links (e-mail, messengers).
  signin: {
    linkSubject: 'Sign in to {app}',
    linkText: '{app}: your sign-in link (valid for {minutes} minutes, single use):\n{link}\n\nIf you did not request it, ignore this message.',
    codeSubject: 'Your sign-in code: {code}',
    codeText: '{app}: your sign-in code is {code}. It expires in {minutes} minutes. Do not share it.',
  },
  pwa: {
    shortcuts: { tasks: 'Tasks', calendar: 'Calendar', kb: 'Knowledge base' },
    pushTest: {
      title: 'Notifications work',
      body: 'This is how notifications will look on this device.',
    },
  },
};
