export default {
  groups: {
    console: '控制台',
    people: '人员和访问',
    audit: '审计',
    settings: '设置',
    module_kb: '知识库',
    module_tasks: '任务',
    module_calendar: '日历',
    module_files: '文件',
    module_drive: '文件服务器',
    module_dashboard: '仪表板',
    module_chat: '聊天',
    api: 'API',
    module_resources: '在线资源',
    module_qr: '二维码',
    module_remote: '远程访问',
    module_companies: '往来单位',
    module_crm: 'CRM',
    module_masterplan: '总体规划',
    module_approvals: '审批',
    module_contracts: '模块：合同',
    module_procurement: '采购',
    module_warehouse: '仓库',
    module_org: '组织架构',
    module_employees: '员工',
    module_directory: 'AD 目录',
  },
  console_access: {
    title: '打开管理控制台',
    desc: '在 /admin 中进行任何操作都需要此权限。',
  },
  users_view: {
    title: '查看用户',
    desc: '查看账户、组和角色。',
  },
  users_manage: {
    title: '管理用户',
    desc: '创建账户、编辑个人资料、重置密码、锁定，以及在自身权限范围内分配组和角色。',
  },
  users_delete: {
    title: '删除用户',
    desc: '永久删除账户。',
  },
  groups_manage: {
    title: '管理组',
    desc: '创建组，设置其角色和成员。',
  },
  roles_manage: {
    title: '管理角色',
    desc: '创建角色并更改其授予的权限。',
  },
  activity_view: {
    title: '查看日志',
    desc: '安全事件和登录历史。',
  },
  settings_view: {
    title: '查看设置',
    desc: '查看所有设置页面，但不可更改。',
  },
  settings_general: {
    title: '品牌和外观',
    desc: '名称、标志、主题、字体、图标。',
  },
  settings_security: {
    title: '安全策略',
    desc: '网站访问、锁定、会话、IP 过滤。',
  },
  settings_auth: {
    title: '登录方式',
    desc: '密码、Active Directory、Telegram、一次性验证码。',
  },
  settings_integrations: {
    title: '集成',
    desc: '电子邮件、Telegram、WhatsApp、Wazzup、Active Directory。',
  },
  settings_system: {
    title: '系统',
    desc: 'API 速率限制和运行环境信息。',
  },
  settings_modules: {
    title: '模块',
    desc: '启用或停用模块，并更改其系统设置。',
  },
  kb_admin: {
    title: '知识库管理员',
    desc: '完全访问所有文件夹和资料，不受文件夹访问权限限制。',
  },
  tasks_admin: {
    title: '任务管理员',
    desc: '管理所有项目及其任务和访问权限，不受项目访问权限限制。',
  },
  calendar_admin: {
    title: '日历管理员',
    desc: '管理所有共享日历及其访问权限。个人日历仍保持私密。',
  },
  files_admin: {
    title: '文件管理员',
    desc: '管理所有共享空间及其访问权限。个人文件仍保持私密。',
  },
  drive_admin: {
    title: '文件服务器管理员',
    desc: '添加文件服务器和文件夹，查看所有公开链接。内容访问权限仍由服务器决定。',
  },
  drive_audit: {
    title: '文件服务器操作日志',
    desc: '查看谁在文件服务器上打开、下载、修改或删除了什么，并导出日志。',
  },
  drive_access: {
    title: '文件服务器：文件夹访问组（系统管理员）',
    desc: '文件服务器 →「访问权限」：在文件夹安全组（sg_…）中添加和移除人员，受保护的根组除外。更改使用管理员自己的 AD 账户执行。',
  },
  dashboard_admin: {
    title: '仪表板管理员',
    desc: '设置默认仪表板，所有人在自行调整前都会看到它。',
  },
  chat_admin: {
    title: '聊天管理员',
    desc: '在群聊创建受限时创建群聊，删除任意消息。',
  },
  api_tokens: {
    title: '个人 API 令牌',
    desc: '创建以您自身权限运作并受权限范围限制的令牌。',
  },
  api_admin: {
    title: 'API 管理',
    desc: '任何人的令牌、访问模板、Webhook、请求日志和 API 设置。',
  },
  resources_admin: {
    title: '管理在线资源',
    desc: '添加、编辑资源并调整顺序，选择每个资源的可见对象。',
  },
  qr_admin: {
    title: '管理二维码模板',
    desc: '准备供员工选择的模板，锁定品牌颜色和标志。',
  },
  remote_view: {
    title: '查看计算机',
    desc: '浏览计算机目录及其状态。',
  },
  remote_connect: {
    title: '远程协助',
    desc: '以协助模式连接计算机（需员工同意）。',
  },
  remote_monitor: {
    title: '监看工作',
    desc: '以监看模式连接监看范围内的计算机。始终会通知员工。',
  },
  remote_admin: {
    title: '管理远程访问',
    desc: '添加计算机、设置监看范围和策略、查看全部日志。',
  },
  companies_admin: {
    title: '往来单位管理员',
    desc: '修改任意卡片、永久删除以及配置模块。',
  },
  crm_admin: {
    title: 'CRM 管理员',
    desc: '设置、销售漏斗和阶段；可查看和编辑所有交易。',
  },
  crm_all: {
    title: '全部交易',
    desc: '可查看和编辑任何交易，无论负责人是谁。',
  },
  masterplan_admin: {
    title: '管理员',
    desc: '全部权限：层级结构、总平面图、团队、名录、预订规则。',
  },
  masterplan_executive: {
    title: '管理层',
    desc: '可查看所有内容，包括最低价格和金额；关闭／开放销售、回退状态、不受限制地修改价格。',
  },
  masterplan_sales_head: {
    title: '销售经理',
    desc: '区域内的所有销售：保留、预订、延期、释放、合同、附原因回退；在限额内调价；可查看最低价格。',
  },
  masterplan_sales: {
    title: '销售代表',
    desc: '保留和预订可售房源单元，可将自己的预订延期一次，附原因释放自己的预订；仅可查看自己预订的客户。',
  },
  masterplan_finance: {
    title: '财务',
    desc: '确认定金和全款（预订 → 定金，合同 → 已售）；可查看金额。',
  },
  masterplan_legal: {
    title: '法务',
    desc: '合同（编号和日期）和交接单；可查看客户和金额。',
  },
  masterplan_construction_head: {
    title: '施工负责人',
    desc: '区域内的施工：阶段、日志、审核；可查看状态，但不含客户和金额；负责交付。',
  },
  masterplan_foreman: {
    title: '工长',
    desc: '仅限所在区域的报告和阶段进度；无销售数据。',
  },
  masterplan_marketing: {
    title: '市场营销',
    desc: '房源单元的媒体资料和特征；状态和价格，不含客户。',
  },
  approvals_admin: {
    title: '审批管理员',
    desc: '所有单据类型的审批流程、紧急程度、所有人的代理设置；可查看和管理任何审批。',
  },
  contracts_create: {
    title: '创建合同',
    desc: '将合同添加到台账并提交审批。',
  },
  contracts_view_all: {
    title: '查看所有合同',
    desc: '管理层：整个台账。其他人可查看自己的合同、本组的合同以及由其审批的合同。',
  },
  contracts_legal: {
    title: '律师',
    desc: '所有合同；风险；将合同标记为已签署、生效、已完成和已解除。',
  },
  contracts_admin: {
    title: '合同管理员',
    desc: '设置、合同审批流程，以及律师可执行的所有操作。',
  },
  contracts_finance: {
    title: '财务（合同）',
    desc: '确认定金、登记收款、收款台账。可查看有定金或付款计划的合同。',
  },
  procurement_create: {
    title: '提交采购申请',
    desc: '当模块设置中关闭「任何人都可提交申请」时需要此权限。',
  },
  procurement_view_all: {
    title: '查看所有申请',
    desc: '管理层：所有申请及其汇总。其他人可查看自己的申请、本组的申请以及由其审批的申请。',
  },
  procurement_pay: {
    title: '会计：付款',
    desc: '付款台账，凭付款单标记付款；可查看已批准的申请。',
  },
  procurement_admin: {
    title: '采购管理员',
    desc: '类别、货币、编号规则、审批流程；可管理任何申请。',
  },
  warehouse_view: {
    title: '查看库存',
    desc: '库存和可用量（不含金额）、「我的工具」、自己的单据。适用于所有仓库（或按分配适用于指定仓库）。',
  },
  warehouse_request: {
    title: '提交领料申请',
    desc: '创建领料申请（草稿 → 仓管员）。',
  },
  warehouse_operate: {
    title: '仓管员',
    desc: '创建并过账入库、出库、调拨和退货单。',
  },
  warehouse_writeoff: {
    title: '报废',
    desc: '报废（超过阈值需审批）。',
  },
  warehouse_inventory: {
    title: '盘点',
    desc: '库存盘点及其单据。',
  },
  warehouse_cost: {
    title: '查看成本和金额',
    desc: '在所有页面、报表、导出和 API 响应中显示成本和金额。',
  },
  warehouse_backdate: {
    title: '补录过去日期的单据',
    desc: '在未结账期间内使用过去日期的单据。',
  },
  warehouse_admin: {
    title: '仓库管理员',
    desc: '名录、仓库、库位、定额、调整、设置。',
  },
  org_manage: {
    title: '管理组织架构',
    desc: '编辑和移动部门，指定负责人，设置部门类型和用途，将账户归入部门。',
  },
  employees_view: {
    title: '员工名录',
    desc: '在职人员的姓名、职位、部门、工地和工作联系方式。',
  },
  employees_hr: {
    title: '人事：员工全部信息',
    desc: '所有卡片和状态、个人联系方式和生日、证件、资质证书、人事备注；创建卡片和门户账户。',
  },
  employees_admin: {
    title: '员工模块管理员',
    desc: '职位名录和模块设置。',
  },
  ad_view: {
    title: 'AD 目录：查看',
    desc: '浏览受管根节点下的 OU、用户、组和计算机，以及日志。',
  },
  ad_manage: {
    title: 'AD 目录：管理账户',
    desc: '创建用户、编辑属性、移动、启用／停用、解锁、组成员关系（文件夹访问组除外）。使用管理员自己的 AD 账户执行。',
  },
  ad_passwords: {
    title: 'AD 目录：重置密码',
    desc: '重置密码（附带「下次登录时必须更改」）并解锁账户。需要 LDAPS 或 StartTLS。',
  },
  ad_admin: {
    title: 'AD 目录：管理员',
    desc: '模块内的全部权限，包括受保护的（管理类）账户。',
  },
};
