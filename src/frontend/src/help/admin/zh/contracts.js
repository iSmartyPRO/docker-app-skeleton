export default {
  purpose: '合同是公司的合同台账：文件版本、律师标注的风险、审批、日期和带提醒的自动续期、收付款和定金，以及与申请、交易和对象的关联。',
  audience: '律师、合同负责人、财务和管理层。',
  setup: [
    {
      title: '启用模块',
      text: '模块默认关闭；合同通过「审批」（核心服务）流转。',
    },
    {
      title: '类型和编号',
      text: '在[设置](/admin/settings/contracts)中：合同类型、编号模板、到期提醒时间。',
    },
    {
      title: '审批流程',
      text: '在[审批](/admin/settings/approvals)中为「合同」设置阶段：律师、财务、总经理，可按金额和类型设置条件。',
    },
    {
      title: '权限',
      text: '律师获得 contracts.legal，财务获得 contracts.finance。',
    },
  ],
  roles: {
    'contracts.create': '创建合同。',
    'contracts.view_all': '所有合同。',
    'contracts.legal': '风险、「已签署」和「已解除」。',
    'contracts.finance': '确认定金、登记付款、收付款台账。',
    'contracts.admin': '设置及其他所有操作。',
  },
  scenarios: [
    {
      title: '供货合同',
      text: '经办人上传草稿，律师标注风险，审批通过后签署；到期前 30 天会收到提醒。',
    },
    {
      title: '出售住宅',
      text: '销售合同关联到总体规划中的房源单元：签署和付款会更新该房源单元的状态和已付金额。',
    },
  ],
  faq: [
    {
      q: '没有往来单位模块怎么办？',
      a: '往来单位以文本形式输入。',
    },
    {
      q: '版本在哪里？',
      a: '在卡片的「版本」选项卡中，并附有变更说明。',
    },
  ],
};
