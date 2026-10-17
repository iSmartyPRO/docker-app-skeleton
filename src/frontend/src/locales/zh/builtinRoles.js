export default {
  superadmin: {
    name: '超级管理员',
    desc: '完全访问权限，包括角色、安全、登录方式和系统设置。',
  },
  admin: {
    name: '管理员',
    desc: '日常管理：用户、组、品牌外观和集成。',
  },
  moderator: {
    name: '协管员',
    desc: '为用户提供帮助：编辑个人资料、重置密码、锁定账户。',
  },
  auditor: {
    name: '审计员',
    desc: '只读访问用户、日志和设置。',
  },
  user: {
    name: '用户',
    desc: '仅限个人中心。',
  },
};
