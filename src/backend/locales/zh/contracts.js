export default {
  status: {
    draft: '草稿',
    approval: '审批中',
    question: '待答复',
    approved: '已批准',
    signed: '已签署',
    active: '生效中',
    expiring: '即将到期',
    completed: '已完成',
    rejected: '已拒绝',
    terminated: '已解除',
  },
  notify: {
    name: '{number}“{title}”',
    days_other: '{count} 天',
    ends: '{date} 到期',
    importance: { high: '高', medium: '中', low: '低' },
    depositKind: { deposit: '定金', advance: '预付款' },
    assigned: {
      lawyer: '您是合同 {name} 的律师',
      owner: '您是合同 {name} 的业务负责人',
    },
    status: { title: '合同 {name}：{status}' },
    prolonged: {
      title: '合同 {name} 已续期',
      body: '新有效期至 {date}',
    },
    version: {
      title: '合同 {name} 的新版本 {no}',
      changed: '变更内容：{comment}',
    },
    risk: {
      title: '合同 {name} 的风险 #{no}（{importance}）',
      clause: '条款 {clause}',
    },
    reminderEnd: { title: '合同 {name} 将在 {days}后到期' },
    reminderNotice: {
      title: '合同 {name}：请在 {date} 前提出不续期',
      lastDay: '今天是发送不续期通知的最后一天',
      left: '距发送不续期通知还剩 {days}',
      renews: '否则将在 {date} 后自动续期',
    },
    depositReceived: { title: '已收到{kind}：合同 {name}' },
    depositStatus: {
      title: '合同 {name} 的{kind}：{status}',
      expected: '待收',
      received: '已收到',
      credited: '已抵作价款',
      returned: '已退还',
      forfeited: '已没收',
    },
    paymentReceived: {
      full: '已全额付款：合同 {name}',
      part: '已收到付款：合同 {name}',
      totals: '已付 {paid} / {total}（{percent}%）',
    },
    paymentDue: {
      today: '今日到期付款：合同 {name}',
      in: '{days}后到期付款：合同 {name}',
      body: '{amount} — {date} 前',
    },
    paymentOverdue: {
      title: '付款已逾期：合同 {name}',
      body: '{amount} — 应于 {date} 支付',
    },
  },
  csv: {
    head: ['编号', '对方编号', '标的', '往来单位', '类型', '方向', '金额', '货币', '签订日期', '开始', '结束', '自动续期', '状态', '业务负责人', '律师'],
    direction: { supplier: '供应商', client: '客户' },
    framework: '框架',
    yes: '是',
  },
  paymentsCsv: {
    head: ['分组', '合同编号', '合同', '往来单位', '用途', '到期日', '金额', '已付', '剩余', '货币', '负责人'],
    group: { overdue: '已逾期', today: '今天', week: '本周', later: '以后' },
    purpose: { deposit: '定金', advance: '预付款', first: '首付款', monthly: '月付款', rest: '尾款', full: '全额付款' },
  },
};
