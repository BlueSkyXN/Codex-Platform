import type { MessageKey } from './types.js';

// English copy. Typed as Record<MessageKey, string> so a missing or stray key
// fails the type check — keeping en and zh-CN key sets in lockstep.
const messages: Record<MessageKey, string> = {
  // global / brand
  'app.name': 'Codex-Platform',
  'app.tagline': 'A conversational engineering workbench',

  // boot / auth
  'boot.loading.title': 'Loading Codex-Platform',
  'boot.loading.subtitle': 'Reading server configuration…',
  'boot.unavailable.title': 'Codex-Platform unavailable',
  'login.title': 'Unlock Codex-Platform',
  'login.hint': 'This deployment requires an access token before it can control the Codex runtime.',
  'login.placeholder': 'CODEX_PLATFORM_AUTH_TOKEN',
  'login.submit': 'Unlock',
  'login.checking': 'Checking…',
  'login.rejected': 'Saved token was rejected. Enter it again.',
  'logout': 'Sign out',

  // theme / settings
  'settings.theme': 'Theme',
  'settings.theme.auto': 'System',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.language': 'Language',

  // sidebar / nav
  'sidebar.newThread': 'New thread',
  'sidebar.search': 'Search',
  'sidebar.skills': 'Skills',
  'sidebar.agents': 'Agents',
  'sidebar.automations': 'Automations',
  'sidebar.projects': 'Projects',
  'sidebar.settings': 'Settings',
  'sidebar.addProject': 'Add project',
  'topbar.demo': 'Demo mode',
  'topbar.connected': 'Connected',
  'topbar.disconnected': 'Disconnected, reconnecting…',
  'topbar.pendingApprovals': '{n} pending',

  // composer
  'composer.placeholder': 'Describe the work, or request a follow-up change',
  'composer.send': 'Send',
  'composer.interrupt': 'Interrupt',
  'composer.addContext': 'Add context',
  'composer.change.summary': '{n} files changed',
  'composer.change.review': 'Review here',

  // timeline / status
  'step.thinking': 'Thinking…',
  'step.completed': 'Done',
  'step.failed': 'Failed',
  'step.awaitingApproval': 'Awaiting approval',
  'timeline.empty.title': 'Start with one instruction',
  'timeline.empty.hint': 'Describe a task below; Codex will plan and execute.',

  // approvals
  'approval.title': 'Approval required',
  'approval.accept.label': 'Approve and run',
  'approval.acceptForSession.label': 'Always allow this session',
  'approval.decline.label': 'Decline',
  'approval.cancel.label': 'Cancel turn',
  'approval.resolved': 'Resolved',

  // inspector
  'inspector.tab.review': 'Review',
  'inspector.tab.plan': 'Plan',
  'inspector.tab.diff': 'Diff',
  'inspector.tab.files': 'Files',
  'inspector.tab.git': 'Git',
  'inspector.tab.terminal': 'Terminal',
  'inspector.tab.browser': 'Browser',
  'inspector.tab.artifacts': 'Artifacts',
  'inspector.tab.raw': 'Raw',

  // common / errors
  'common.copy': 'Copy',
  'common.copied': 'Copied',
  'common.retry': 'Retry',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.delete': 'Delete',
  'common.refresh': 'Refresh',
  'error.network': 'Network error. Try again.',
  'error.unauthorized': 'Session expired. Sign in again.',
  'error.rateLimited': 'Too many requests. Slow down.',
  'error.generic': 'Something went wrong: {message}'
};

export default messages;
