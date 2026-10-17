export default {
  notify: {
    clearance: {
      expired: '已于 {date} 过期',
      today: '今天到期',
      expires: '将于 {date} 到期（{days} 天后）',
      own: '您的资质证书“{clearance}”{state}',
      other: '资质证书“{clearance}”：{employee} — {state}',
      ownBody: '请联系人事部门办理续期。',
      otherBody: '请办理续期，或不要安排此人从事需要该证书的工作。',
    },
  },
  csv: {
    head: ['姓', '名', '父称', '职位', '部门', '工地', '状态', '工作邮箱', '工作电话', '手机'],
    hrHead: ['工号', '用工类型', '入职日期', '离职日期', '门户账户'],
    status: { active: '在职', vacation: '休假中', terminated: '已离职', candidate: '候选人' },
    employment: { staff: '正式员工', part_time: '兼职', contractor: '外包', seasonal: '季节工' },
  },
};
