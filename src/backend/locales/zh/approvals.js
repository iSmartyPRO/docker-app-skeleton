export default {
  notify: {
    quoted: '“{title}”',
    by: '发起人：{actor}',
    due: '截止：{date}',
    stage: '阶段：{stage}',
    request: {
      title: '待您审批：{doc}',
      delegated: '{actor} 将审批转交给您：{doc}',
    },
    question: {
      title: '{actor} 就 {doc} 提问',
      body: '答复后单据将返回审批。',
    },
    answer: {
      title: '{actor} 已答复：{doc}',
      body: '单据已重新提交给您审批。',
    },
    approved: { title: '已批准：{doc}' },
    progress: { title: '阶段“{stage}”已批准：{doc}' },
    rejected: { title: '已拒绝：{doc}' },
    returned: {
      title: '已退回修改：{doc}',
      body: '请修改后重新提交。',
    },
    withdrawn: { title: '发起人已撤回：{doc}' },
    reminder: { title: '提醒：{doc} 等待您的决定' },
    overdue: { title: '已逾期：{doc}' },
    escalation: {
      title: '升级处理：{doc} 已逾期',
      waiting: '等待：{approvers}',
    },
    noApprovers: {
      title: '无人可审批 {doc}',
      body: '阶段“{stage}”没有有效的审批人，请检查审批流程。',
    },
  },
};
