// 中文文案 —— 前端文本的单一事实源（key 集合即由本文件推导）。
// 口吻：简洁、动词开头、工程化；术语保留英文（commit / diff / branch / PR / Skill / Agent / sandbox）。
// 插值用 {name} 占位；详见 local/refactor-2026/02-功能与前端文案.md。

const messages = {
  // 全局 / 品牌
  'app.name': 'Codex-Platform',
  'app.tagline': '可对话的工程工作台',

  // 启动 / 鉴权
  'boot.loading.title': '正在启动 Codex-Platform',
  'boot.loading.subtitle': '正在读取服务器配置…',
  'boot.unavailable.title': 'Codex-Platform 暂不可用',
  'login.title': '解锁 Codex-Platform',
  'login.hint': '此部署需要访问令牌才能控制 Codex 运行时。',
  'login.placeholder': 'CODEX_PLATFORM_AUTH_TOKEN',
  'login.submit': '解锁',
  'login.checking': '正在校验…',
  'login.rejected': '已保存的令牌被拒绝，请重新输入。',
  'logout': '退出',

  // 主题 / 设置
  'settings.theme': '主题',
  'settings.theme.auto': '跟随系统',
  'settings.theme.light': '浅色',
  'settings.theme.dark': '深色',
  'settings.language': '语言',

  // 侧栏 / 导航
  'sidebar.newThread': '新对话',
  'sidebar.search': '搜索',
  'sidebar.skills': 'Skills',
  'sidebar.agents': 'Agents',
  'sidebar.automations': '自动化',
  'sidebar.projects': '项目',
  'sidebar.settings': '设置',
  'sidebar.addProject': '添加项目',
  'topbar.demo': '演示模式',
  'topbar.connected': '已连接',
  'topbar.disconnected': '连接断开，正在重连…',
  'topbar.pendingApprovals': '{n} 项待批准',

  // Composer
  'composer.placeholder': '描述要做的事，或要求后续变更',
  'composer.send': '发送',
  'composer.interrupt': '中断',
  'composer.addContext': '添加上下文',
  'composer.change.summary': '{n} 个文件已更改',
  'composer.change.review': '在此审查',

  // Timeline / 状态行
  'step.thinking': '正在思考…',
  'step.completed': '已完成',
  'step.failed': '执行失败',
  'step.awaitingApproval': '等待批准',
  'timeline.empty.title': '从一条指令开始',
  'timeline.empty.hint': '在下方描述任务，Codex 会规划并执行。',

  // 审批
  'approval.title': '需要批准',
  'approval.accept.label': '批准并运行',
  'approval.acceptForSession.label': '本会话始终允许',
  'approval.decline.label': '拒绝',
  'approval.cancel.label': '取消回合',
  'approval.resolved': '已处理',

  // Inspector
  'inspector.tab.review': '审查',
  'inspector.tab.plan': '计划',
  'inspector.tab.diff': '差异',
  'inspector.tab.files': '文件',
  'inspector.tab.git': 'Git',
  'inspector.tab.terminal': '终端',
  'inspector.tab.browser': '浏览器',
  'inspector.tab.artifacts': '产物',
  'inspector.tab.raw': '原始事件',

  // 通用 / 错误
  'common.copy': '复制',
  'common.copied': '已复制',
  'common.retry': '重试',
  'common.cancel': '取消',
  'common.confirm': '确认',
  'common.delete': '删除',
  'common.refresh': '刷新',
  'error.network': '网络错误，请重试。',
  'error.unauthorized': '会话已失效，请重新登录。',
  'error.rateLimited': '请求过于频繁，请稍后再试。',
  'error.generic': '出错了：{message}'
} as const;

export default messages;
