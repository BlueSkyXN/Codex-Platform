export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = Record<string, JsonValue>;

export type Project = {
  id: string;
  name: string;
  cwd: string;
  createdAt: number;
};

export type ThreadSummary = {
  id: string;
  projectId: string;
  name?: string | null;
  preview?: string | null;
  status?: string;
  createdAt?: number;
  updatedAt?: number;
  raw?: unknown;
};

export type TimelineCardKind =
  | 'user'
  | 'agent'
  | 'reasoning'
  | 'plan'
  | 'command'
  | 'fileChange'
  | 'tool'
  | 'approval'
  | 'error'
  | 'system'
  | 'unknown';

export type TimelineCard = {
  id: string;
  threadId: string;
  turnId?: string;
  kind: TimelineCardKind;
  title: string;
  status?: string;
  text?: string;
  command?: string;
  cwd?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  filePath?: string;
  diff?: string;
  payload?: unknown;
  createdAt: number;
  updatedAt?: number;
};

export type ApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';

export type ApprovalRequest = {
  requestId: string | number;
  method: string;
  threadId?: string;
  turnId?: string;
  itemId?: string;
  kind: 'command' | 'fileChange' | 'tool' | 'unknown';
  title: string;
  reason?: string;
  command?: string;
  cwd?: string;
  grantRoot?: string;
  availableDecisions?: ApprovalDecision[];
  payload: unknown;
  createdAt: number;
};

export type ApprovalRecord = ApprovalRequest & {
  status: 'pending' | 'resolved';
  decision?: ApprovalDecision | string;
  resolvedAt?: number;
  result?: unknown;
};

export type SkillSummary = {
  id: string;
  name: string;
  description?: string;
  path?: string;
  scope?: string;
  enabled?: boolean;
  source?: string;
  state?: 'ready' | 'disabled' | 'warning' | 'error' | string;
  diagnostic?: string;
  cwd?: string;
  raw?: unknown;
};


export type FileTreeNode = {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size?: number;
  children?: FileTreeNode[];
};

export type FileReadResult = {
  path: string;
  content: string;
  truncated: boolean;
  size: number;
  encoding: 'utf8';
};

export type GitFileStatus = {
  path: string;
  oldPath?: string;
  index: string;
  workingTree: string;
  status: string;
};

export type GitStatusSummary = {
  isRepo: boolean;
  branch?: string;
  upstream?: string;
  defaultBranch?: string;
  defaultRemote?: string;
  head?: string;
  upstreamHead?: string;
  remoteUrl?: string;
  ahead?: number;
  behind?: number;
  files: GitFileStatus[];
  raw?: string;
  error?: string;
};

export type GitActionResult = {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  status: GitStatusSummary;
};

export type GitOperationKind = 'stage' | 'unstage' | 'commit';

export type GitOperationRecord = {
  id: string;
  projectId: string;
  kind: GitOperationKind;
  status: 'completed' | 'failed';
  title: string;
  detail?: string;
  paths?: string[];
  message?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
  head?: string;
  branch?: string;
  createdAt: number;
};

export type GitDiffResult = {
  path?: string;
  cached?: boolean;
  diff: string;
};

export type RawEventRecord = {
  id: string;
  method: string;
  params?: unknown;
  createdAt: number;
};

export type GitHubActionsRun = {
  id: number;
  name: string;
  status?: string;
  conclusion?: string | null;
  headSha?: string;
  branch?: string;
  event?: string;
  htmlUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type GitHubActionsSummary = {
  state: 'success' | 'pending' | 'failure' | 'unknown' | 'unavailable';
  repo?: string;
  branch?: string;
  headSha?: string;
  checkedSha?: string;
  htmlUrl?: string;
  totalRuns?: number;
  matchedRuns?: number;
  runs: GitHubActionsRun[];
  error?: string;
  fetchedAt: number;
};

export type GitHubPullRequest = {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed' | string;
  draft?: boolean;
  htmlUrl?: string;
  base?: string;
  head?: string;
  headSha?: string;
  user?: string;
  updatedAt?: string;
};

export type GitHubPullRequestSummary = {
  state: 'open' | 'draft' | 'none' | 'direct' | 'unknown' | 'unavailable';
  repo?: string;
  branch?: string;
  base?: string;
  headSha?: string;
  htmlUrl?: string;
  totalOpen?: number;
  pulls: GitHubPullRequest[];
  error?: string;
  fetchedAt: number;
};


export type AgentSummary = {
  id: string;
  name: string;
  description?: string;
  path?: string;
  scope?: 'user' | 'repo' | 'built-in' | string;
  source?: string;
  model?: string;
  sandbox?: string;
  effort?: string;
  aliases?: string[];
  hasDeveloperInstructions?: boolean;
  state?: 'ready' | 'warning' | 'error' | string;
  diagnostic?: string;
  raw?: unknown;
};

export type TurnContextAttachmentKind = 'file' | 'folder' | 'gitStatus' | 'gitDiff' | 'releaseEvidence' | 'browserEvidence' | 'artifactEvidence' | 'terminal' | 'skill' | 'agent';

export type TurnContextAttachment = {
  id: string;
  kind: TurnContextAttachmentKind;
  title: string;
  subtitle?: string;
  path?: string;
  content?: string;
  truncated?: boolean;
  metadata?: JsonRecord;
  createdAt?: number;
};

export type AccountSummary = {
  authenticated?: boolean;
  mode?: string;
  email?: string;
  plan?: string;
  raw?: unknown;
};

export type InspectorTab = 'review' | 'plan' | 'diff' | 'files' | 'git' | 'terminal' | 'browser' | 'artifacts' | 'raw';

export type ManagementTab = 'skills' | 'agents' | 'admin' | 'automations' | 'triage' | 'settings';

export type UiEvent =
  | { type: 'connected'; serverTime: number; demoMode: boolean }
  | { type: 'connection.status'; connected: boolean; message?: string }
  | { type: 'project.upserted'; project: Project }
  | { type: 'thread.upserted'; thread: ThreadSummary }
  | { type: 'thread.selected'; threadId: string }
  | { type: 'thread.status'; threadId: string; status: string; payload?: unknown }
  | { type: 'turn.started'; threadId: string; turnId: string; payload?: unknown }
  | { type: 'turn.completed'; threadId: string; turnId?: string; status?: string; payload?: unknown }
  | { type: 'card.upserted'; card: TimelineCard }
  | { type: 'card.delta'; threadId: string; cardId: string; field: 'text' | 'stdout' | 'stderr' | 'diff'; delta: string }
  | { type: 'approval.requested'; approval: ApprovalRequest }
  | { type: 'approval.resolved'; requestId: string | number; payload?: unknown }
  | { type: 'git.operation.recorded'; operation: GitOperationRecord }
  | { type: 'raw'; method: string; params?: unknown }
  | { type: 'error'; message: string; payload?: unknown };

export type AppStateSnapshot = {
  projects: Project[];
  threads: ThreadSummary[];
  cards: TimelineCard[];
  approvals: ApprovalRequest[];
  approvalHistory?: ApprovalRecord[];
  gitOperations?: GitOperationRecord[];
  selectedThreadId?: string;
  demoMode: boolean;
  errors?: string[];
};

export type CreateThreadRequest = {
  projectId: string;
  model?: string;
  approvalPolicy?: string;
  sandbox?: string;
  personality?: string;
};

export type StartTurnRequest = {
  text: string;
  cwd?: string;
  model?: string;
  approvalPolicy?: string;
  sandbox?: string;
  effort?: string;
  summary?: string;
  skill?: {
    name: string;
    path: string;
  };
  agent?: {
    name: string;
    path?: string;
  };
  context?: TurnContextAttachment[];
  /** Public API only: stream turn events as SSE instead of returning a single response. */
  stream?: boolean;
};

export type ServerHealth = {
  ok: boolean;
  ready: boolean;
  demoMode: boolean;
  authRequired: boolean;
  workspaceRoot: string;
  allowedWorkspaceRoots: string[];
  dataDir: string;
  appServer: 'demo' | 'starting' | 'ready' | 'error' | 'stopped';
  uptimeSeconds: number;
  build?: {
    sha?: string;
  };
  codexHome?: string;
  huggingFace?: {
    enabled: boolean;
    spaceId?: string;
    spaceHost?: string;
    publicUrl?: string;
    storageRoot: string;
    autoCreateWorkspace: boolean;
  };
};

export type AdminCheckState = 'ok' | 'warn' | 'error' | 'unknown';

export type AdminCheck = {
  id: string;
  label: string;
  state: AdminCheckState;
  detail?: string;
};

export type AdminStatus = {
  generatedAt: number;
  readOnly: true;
  server: {
    appName: string;
    mode: 'demo' | 'real';
    ready: boolean;
    appServer: ServerHealth['appServer'];
    uptimeSeconds: number;
    buildSha?: string;
  };
  auth: {
    required: boolean;
    allowUnauthenticated: boolean;
    cookieName: string;
    headerName: string;
  };
  runtime: {
    host: string;
    port: number;
    codexBin: string;
    codexArgs: string[];
    codexHome: string;
    clientName: string;
    approvalPolicy: string;
    sandbox: string;
    effort: string;
    summary: string;
    defaultModel?: string;
  };
  workspace: {
    root: string;
    allowedRoots: string[];
    dataDir: string;
    workspaceRootExists: boolean;
    dataDirExists: boolean;
    codexHomeExists: boolean;
  };
  storage: {
    projectsFile: string;
    snapshotFile: string;
    eventLogFile: string;
    eventLogBytes?: number;
  };
  limits: {
    activeWsClients: number;
    maxWsClients: number;
    rateLimitWindowMs: number;
    rateLimitMax: number;
    maxFileTreeEntries: number;
    maxFileReadBytes: number;
    gitCommandTimeoutMs: number;
  };
  huggingFace: ServerHealth['huggingFace'];
  counts: {
    projects: number;
    threads: number;
    cards: number;
    approvals: number;
    approvalHistory: number;
    gitOperations: number;
    errors: number;
  };
  checks: AdminCheck[];
};

export type CodexWebConfig = {
  authRequired: boolean;
  demoMode: boolean;
  defaultApprovalPolicy: string;
  defaultSandbox: string;
  defaultModel?: string;
  defaultEffort?: string;
  defaultSummary?: string;
};
