export default {
  priority: ['低', '普通', '高', '紧急'],
  noProject: '无项目',
  starter: {
    name: '通用',
    description: '不属于特定项目的团队任务。',
  },
  // Statuses of a new project, in order (to do → done).
  statuses: ['待办', '进行中', '审核', '已完成'],
  notify: {
    deadline: '截止日期：{due}',
    assigned: {
      title: '{ref} 已分配给您',
      acceptBy: '请在 {time} 前接受任务',
    },
    accepted: {
      title: '{ref} 已被接受',
      comment: '：“{comment}”',
    },
    acceptOverdue: {
      title: '请接受 {ref}：已等待 {hours} 小时',
      body: '创建人正在等待您接受任务或进行沟通。',
    },
    notAccepted: {
      title: '{ref} 在 {hours} 小时内未被接受',
      assignee: '执行人：{name}',
    },
    status: { title: '{ref}：状态已变更为“{status}”' },
    comment: { title: '{ref} 有新评论' },
    mention: {
      title: '{actor} 在 {ref} 中提到了您',
      body: '{actor}：{snippet}\n{title}',
    },
    priority: { title: '{ref}：优先级已变为{priority}' },
    dueSoon: { title: '{ref} 将在 24 小时内到期' },
    projectNew: { title: '{project} 中的新任务：{ref}' },
    projectDone: { title: '{ref} 已完成（{project}）' },
    overdue: { title: '{ref} 已逾期' },
    reminder: { title: '提醒：{ref}' },
    result: { title: '{ref} 已添加结果' },
  },
};
