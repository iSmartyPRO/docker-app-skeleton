export default {
  personal: '我的日历',
  lead: {
    days_other: '{count} 天',
    hours_other: '{count} 小时',
    minutes_other: '{count} 分钟',
  },
  notify: {
    invited: {
      title: '邀请：{title}',
      by: '{actor} 邀请了您',
    },
    updated: { title: '日程已变更：{title}' },
    cancelled: { title: '日程已取消：{title}' },
    rsvp: {
      accepted: '{actor} 已接受：{title}',
      declined: '{actor} 已拒绝：{title}',
      tentative: '{actor} 可能参加：{title}',
    },
    followNew: { title: '“{calendar}”中有新日程：{title}' },
    followUpdated: { title: '“{calendar}”中日程已变更：{title}' },
    followDeleted: { title: '已从“{calendar}”中删除：{title}' },
    reminder: {
      now: '即将开始：{title}',
      in: '{lead}后开始：{title}',
    },
  },
};
