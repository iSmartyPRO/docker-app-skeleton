export default {
  id: 'assistant',
  icon: 'robot',
  title: 'Robot assistant',
  tagline: 'A friendly helper on every page.',
  summary: 'The robot in the corner tells you what the section you’re in can do and answers questions from the help. Drag it anywhere, change it or turn it off.',
  highlights: [
    {
      icon: '💬',
      title: 'Help for the section',
      text: 'Click the robot: a tip, the short and full guide, frequent questions.',
    },
    {
      icon: '🔎',
      title: 'Ask',
      text: 'Type a question in your own words — the robot finds the answer across all help.',
    },
    {
      icon: '✋',
      title: 'Where it suits you',
      text: 'Drag the robot with the mouse or a finger — it remembers the spot on this device.',
    },
    {
      icon: '🎨',
      title: '28 characters and your colour',
      text: 'Robots, professions, kids, characters in Kyrgyz style, superheroes and animals — tap the avatar in the robot’s panel, pick a character and, if you like, its colour. An administrator may allow only some, or one for everyone.',
    },
  ],
  tips: [
    'In the way? Drag the robot to the edge or choose the “Small” size.',
    '“Hide until reload” removes it for a while, “Turn off” for good (turn it back on under Account → Appearance).',
  ],
  sections: [
    {
      id: 'settings',
      title: 'Settings',
      body: 'Under [Account → Appearance](/account/appearance#assistant): show the assistant, which robot, size, back to the corner, offers again. Administrators choose the default robot under Settings → Modules → Robot assistant and can switch the module off for everyone.',
    },
  ],
  faq: [
    {
      q: 'How do I remove the robot?',
      a: 'Click the robot → ⋯ → “Turn the assistant off”. Bring it back under Account → Appearance.',
    },
    {
      q: 'The robot covers a button',
      a: 'Drag it elsewhere — the spot is remembered.',
    },
  ],
  related: [
    'start',
    'account',
  ],
};
