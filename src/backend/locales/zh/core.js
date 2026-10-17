export default {
  // Local names of currencies (others show their ISO code).
  currency: {
    KGS: 'KGS',
  },
  email: {
    open: '打开',
    footer: '您收到此邮件，是因为您在个人资料中开启了通知。',
  },
  notify: {
    test: {
      title: '通知测试',
      body: '如果您能看到这条消息，说明该渠道工作正常。',
    },
    adminTest: {
      title: '{app}：通知测试',
    },
  },
  // One-time sign-in codes and links (e-mail, messengers).
  signin: {
    linkSubject: '登录 {app}',
    linkText: '{app}：您的登录链接（{minutes} 分钟内有效，仅可使用一次）：\n{link}\n\n如果不是您本人申请，请忽略此消息。',
    codeSubject: '您的登录验证码：{code}',
    codeText: '{app}：您的登录验证码为 {code}，{minutes} 分钟内有效。请勿告诉他人。',
  },
  pwa: {
    shortcuts: { tasks: '任务', calendar: '日历', kb: '知识库' },
    pushTest: {
      title: '通知工作正常',
      body: '此设备上的通知将如此显示。',
    },
  },
};
