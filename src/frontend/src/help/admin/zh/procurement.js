export default {
  purpose: '采购将申请从发票一路推进到交货：员工附上发票提交申请，申请经审批后进入财务部的付款台账，完成付款（分批或全额），交货后关闭。',
  audience: '申请人、审批人、财务部和供应部门。',
  setup: [
    {
      title: '启用模块',
      text: '模块默认关闭。需要「审批」（核心服务，始终开启）。',
    },
    {
      title: '名录',
      text: '采购类别、付款法人实体和货币，在[设置](/admin/settings/procurement)中配置。',
    },
    {
      title: '审批流程',
      text: '在[审批](/admin/settings/approvals)中为「采购申请」设置阶段，例如按金额设置。',
    },
    {
      title: '权限',
      text: '财务部获得 procurement.pay，管理层获得 procurement.view_all。',
    },
    {
      title: '关联',
      text: '启用往来单位、总体规划、CRM 和合同，即可从名录中选择供应商、对象、交易和合同。',
    },
  ],
  roles: {
    'procurement.create': '在「任何人都可提交申请」关闭时提交申请。',
    'procurement.view_all': '所有申请，而不仅是自己的和自己审批过的。',
    'procurement.pay': '付款台账和登记付款。',
    'procurement.admin': '名录、设置、审批流程和所有申请。',
  },
  scenarios: [
    {
      title: '采购设备',
      text: '工长为“北区”工地附上发票提交申请，负责人批准，财务部分两次付款，仓库验收货物。',
    },
    {
      title: '退回修改',
      text: '审批人附上意见退回申请；发起人附上新发票后重新提交。',
    },
  ],
  faq: [
    {
      q: '必须使用往来单位吗？',
      a: '不必须。没有该模块时，供应商以文本形式输入。',
    },
    {
      q: '谁能看到申请？',
      a: '发起人、负责人、审批人，以及拥有 view_all/pay/admin 权限的人。',
    },
  ],
};
