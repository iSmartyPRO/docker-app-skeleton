export default {
  groups: {
    drive: '文件服务器',
    tasks: '任务',
    crm: 'CRM',
    calendar: '日历',
    chat: '聊天',
    files: '文件',
    masterplan: '总体规划',
    approvals: '审批',
    contracts: '合同',
    procurement: '采购',
    warehouse: '仓库',
    employees: '员工',
  },
  events: {
    drive_linkActivity: {
      title: '我的链接上的动态',
      desc: '您的公开链接的访客上传、修改或删除了文件（每次访问通知一次）',
    },
    tasks_assigned: {
      title: '我收到任务',
      desc: '您成为执行人、协办人或审核人',
    },
    tasks_status: {
      title: '状态变更',
      desc: '您参与的任务进入其他状态',
    },
    tasks_result: {
      title: '添加了结果',
      desc: '在您创建的任务中',
    },
    tasks_priority: {
      title: '变为紧急',
      desc: '您的任务优先级被提升为紧急',
    },
    tasks_due_soon: {
      title: '临近截止日期',
      desc: '距截止日期不到一天',
    },
    tasks_overdue: {
      title: '任务已逾期',
      desc: '已超过截止日期',
    },
    tasks_accepted: {
      title: '我的任务已被接受',
      desc: '执行人接受了您创建的任务',
    },
    tasks_not_accepted: {
      title: '未按时接受',
      desc: '执行人未按时接受您的任务',
    },
    tasks_accept_overdue: {
      title: '接受任务',
      desc: '分配给您的任务等待接受的时间过长',
    },
    tasks_project: {
      title: '我关注的项目',
      desc: '您订阅的项目中新建和完成的任务',
    },
    tasks_reminder: {
      title: '任务提醒',
      desc: '您或他人在任务中设置的提醒',
    },
    crm_assigned: {
      title: '交易分配给我',
      desc: '您成为某笔交易的负责人',
    },
    crm_activity: {
      title: '给我的活动',
      desc: '有人在交易中为您安排了电话、会议或任务',
    },
    crm_activity_due: {
      title: '活动提醒',
      desc: '在您的活动截止时间之前',
    },
    crm_stage: {
      title: '我关注的交易阶段',
      desc: '您负责或关注的交易进入其他阶段',
    },
    calendar_invited: {
      title: '邀请',
      desc: '有人邀请您参加日程',
    },
    calendar_updated: {
      title: '日程已更改',
      desc: '您的日程时间或地点已更改',
    },
    calendar_cancelled: {
      title: '日程已取消',
      desc: '您受邀参加的日程已取消',
    },
    calendar_rsvp: {
      title: '对我的邀请的答复',
      desc: '有人接受或拒绝',
    },
    calendar_subscribed: {
      title: '我关注的日历',
      desc: '您订阅的日历中新建和更改的日程',
    },
    calendar_reminder: {
      title: '日程提醒',
      desc: '在日程开始之前',
    },
    chat_mention: {
      title: '提及',
      desc: '有人 @了您',
    },
    chat_message: {
      title: '聊天消息',
      desc: '您的聊天中的新消息（仅推送，正在阅读时不推送）',
    },
    files_shared: {
      title: '与我共享',
      desc: '有人与您共享了文件或文件夹',
    },
    files_linkActivity: {
      title: '我的公开链接上的动态',
      desc: '访客通过启用了“通知我”的链接上传或修改文件（每次访问通知一次）',
    },
    masterplan_expiring: {
      title: '我的保留或预订即将到期',
      desc: '到期前24小时和2小时（可配置）',
    },
    masterplan_expired: {
      title: '保留或预订已被计时器释放',
      desc: '您自己的，或作为销售经理在您负责区域内的',
    },
    masterplan_status: {
      title: '房源单元已预订、已售、已回退',
      desc: '面向销售经理和管理层，限其负责区域',
    },
    masterplan_report: {
      title: '新的施工报告',
      desc: '涉及您持有或负责的房源单元',
    },
    masterplan_review: {
      title: '报告审核',
      desc: '有报告等待审核／您的报告已发布或被退回',
    },
    masterplan_construction: {
      title: '施工告警',
      desc: '没有最新报告的对象、超过阈值的延误',
    },
    masterplan_access: {
      title: '访问申请',
      desc: '有人申请访问总体规划',
    },
    approval_request: {
      title: '等待我审批',
      desc: '有单据进入您的阶段或被转交给您',
    },
    approval_question: {
      title: '向我提问',
      desc: '审批人就您的单据提问，或向您提问',
    },
    approval_answer: {
      title: '我的问题收到答复',
      desc: '单据已重新回到您的审批中',
    },
    approval_approved: {
      title: '我的单据已批准',
      desc: '所有阶段均已批准',
    },
    approval_rejected: {
      title: '我的单据被拒绝',
      desc: '附审批人的备注',
    },
    approval_returned: {
      title: '已退回修改',
      desc: '修改后重新提交',
    },
    approval_progress: {
      title: '我的单据通过了一个阶段',
      desc: '最后阶段之前每个获批的阶段',
    },
    approval_reminder: {
      title: '审批提醒',
      desc: '响应时限已用去75%时，以及逾期时',
    },
    approval_escalation: {
      title: '升级处理',
      desc: '他人的审批已逾期，而您是其升级处理联系人',
    },
    approval_withdrawn: {
      title: '被发起人撤回',
      desc: '等待您处理的单据已被撤回',
    },
    contracts_assigned: {
      title: '我是合同的律师或负责人',
      desc: '有人在合同中指定了您',
    },
    contracts_status: {
      title: '合同状态',
      desc: '已签署、生效、即将到期、已完成、已解除、已续期',
    },
    contracts_version: {
      title: '合同新版本',
      desc: '附带更改内容',
    },
    contracts_risk: {
      title: '高重要性风险',
      desc: '律师在我的合同中发现了严重问题',
    },
    contracts_reminder: {
      title: '合同到期提醒',
      desc: '到期前30天和7天，以及拒绝期限之前',
    },
    contracts_payment: {
      title: '我的合同的款项',
      desc: '定金已确认、退还或抵扣；已收到款项',
    },
    contracts_payment_due: {
      title: '即将到期的付款',
      desc: '我的合同付款日前几天及当天',
    },
    contracts_payment_overdue: {
      title: '付款已逾期',
      desc: '通知业务负责人和财务，每笔付款一次',
    },
    procurement_to_pay: {
      title: '有申请等待付款',
      desc: '会计：已批准的申请进入付款台账',
    },
    procurement_paid: {
      title: '我的申请已付款',
      desc: '每笔付款，包括部分付款',
    },
    procurement_delivered: {
      title: '我的申请已交货',
      desc: '交货已确认，全部或部分',
    },
    procurement_assigned: {
      title: '我负责某个申请',
      desc: '有人将您指定为申请的采购人',
    },
    procurement_due_soon: {
      title: '付款截止或交货截止临近',
      desc: '提前一天通知一次（可配置）',
    },
    procurement_overdue: {
      title: '付款或交货已逾期',
      desc: '在截止日期次日通知一次',
    },
    warehouse_transfer_incoming: {
      title: '有待验收的调入调拨',
      desc: '通知目标仓库的物资责任人',
    },
    warehouse_requested: {
      title: '提交了领料申请',
      desc: '通知该仓库的仓管员',
    },
    warehouse_issued: {
      title: '货物已发放给我',
      desc: '发给我的出库单或我的领料申请已过账',
    },
    warehouse_discrepancy: {
      title: '验收差异',
      desc: '调拨验收时存在差异',
    },
    warehouse_handover: {
      title: '工具交接',
      desc: '同事向我交接工具，或已接受／拒绝我的交接',
    },
    warehouse_stock_low: {
      title: '低于最低库存（每日）',
      desc: '按仓库汇总发送给物资责任人和采购人员',
    },
    warehouse_expiring: {
      title: '批次即将过期',
      desc: '保质期即将结束',
    },
    warehouse_service: {
      title: '工具维保到期',
      desc: '维护或校准即将到期或已逾期',
    },
    warehouse_tool_overdue: {
      title: '未按时归还',
      desc: '已发放物品超过归还日期',
    },
    warehouse_post_failed: {
      title: '已批准但未过账',
      desc: '报废获批时库存已不足',
    },
    warehouse_inventory_assigned: {
      title: '盘点：盘点或复盘',
      desc: '有人请我盘点库位或复盘',
    },
    warehouse_inventory_due: {
      title: '定期盘点到期',
      desc: '计划中的部分盘点到期（物资责任人和盘点人员）',
    },
    employees_clearance: {
      title: '资质证书即将到期',
      desc: '在到期日之前及当天通知人事、员工本人及其负责人',
    },
  },
  lead: '选择在哪里接收通知、何时免打扰以及通知内容。门户中的铃铛始终保留所有通知。',
  whereTitle: '接收渠道',
  whereLead: '已关联到您账户的渠道。关闭某个渠道即停止通过它发送任何通知。',
  test: '发送测试',
  thisDevice: '本设备',
  testNote: '测试消息会通过所有已连接的渠道发送（包括已关闭的），以便检查连接。',
  devices: '设备：{n}',
  notConfigured: '管理员尚未配置。',
  state: {
    on: '开',
    off: '关',
    disconnected: '未连接',
    admin: '不可用',
    always: '始终',
  },
  delivery: {
    sent: '已送达',
    off: '已被您关闭',
    unreachable: '未连接',
    quiet: '暂缓：免打扰时段',
    paused: '暂缓：已暂停',
    deferred: '暂缓至免打扰时段或暂停结束',
    expired: '未发送：暂缓时间过长',
    skipped: '未使用',
  },
  short: {
    inbox: '铃铛',
    push: '推送',
    email: '邮件',
    telegram: 'TG',
    whatsapp: 'WA',
    mattermost: 'MM',
  },
  whenTitle: '接收时间',
  whenLead: '在夜间或一段时间内暂停推送和消息。铃铛仍会收集所有通知。',
  pauseButton: '暂停',
  pause: {
    h1: '暂停1小时',
    h3: '暂停3小时',
    tomorrow: '暂停至明天上午',
    monday: '暂停至周一上午',
  },
  pausedUntil: '通知已暂停至 {time}',
  resume: '立即恢复',
  quiet: '免打扰时段',
  from: '从',
  to: '至',
  weekends: '以及整个周末',
  quietNote: '您自己设置的提醒仍会准时送达。',
  zoneNote: '时间按您的时区显示：{zone}。',
  zoneChange: '更改',
  whatTitle: '通知内容',
  whatLead: '每行是一个事件，每列是一个渠道。灰色列表示未连接或已在上方关闭。',
  presetsButton: '预设',
  presets: {
    recommended: '推荐',
    recommendedDesc: '默认设置：重要事项全渠道通知，其余仅推送。',
    important: '仅重要事项',
    importantDesc: '在门户之外仅通知任务分配、提及、邀请、逾期任务和提醒。',
    everything: '全部全渠道',
    everythingDesc: '每个事件都通过所有已连接的渠道发送。',
    bellOnly: '仅铃铛',
    bellOnlyDesc: '除提醒外，门户之外不发送任何通知。',
  },
  alwaysTag: '始终',
  subTag: '按订阅',
  matrixNote: '您创建的提醒会自行选择渠道，且始终送达。',
  subsTitle: '订阅',
  subsLead: '关注整个项目或日历，无需参与其中的每一项。',
  noSubs: '暂无订阅。可在项目页面（🔔）或共享日历的日历菜单中订阅（⋯ → 变更时通知我）。',
  subType: {
    tasks_project: '任务项目',
    calendar_calendar: '日历',
  },
  unsubscribe: '取消订阅',
  historyTitle: '最近通知',
  historyLead: '每条通知的去向。将鼠标悬停在渠道上可查看送达或未送达的原因。',
  noHistory: '暂无内容。',
};
