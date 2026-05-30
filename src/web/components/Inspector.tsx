import { useState } from 'react';
import { DiffBlock } from './DiffBlock.js';
import type { AccountSummary, AgentSummary, ApprovalDecision, ApprovalRequest, FileReadResult, FileTreeNode, GitStatusSummary, InspectorTab, Project, ServerHealth, SkillSummary, ThreadSummary, TimelineCard, CodexWebConfig } from '../../shared/types.js';

const tabs: InspectorTab[] = ['review', 'plan', 'diff', 'files', 'git', 'terminal', 'artifacts', 'skills', 'agents', 'settings', 'raw'];

export function Inspector(props: {
  card?: TimelineCard;
  cards: TimelineCard[];
  approvals: ApprovalRequest[];
  project?: Project;
  thread?: ThreadSummary;
  errors: string[];
  skills: SkillSummary[];
  agents?: AgentSummary[];
  skillsLoading?: boolean;
  agentsLoading?: boolean;
  fileTree?: FileTreeNode;
  fileContent?: FileReadResult;
  gitStatus?: GitStatusSummary;
  projectPanelLoading?: boolean;
  projectPanelError?: string;
  account?: AccountSummary;
  health?: ServerHealth;
  codexWebConfig?: CodexWebConfig;
  notificationsEnabled?: boolean;
  notificationsSupported?: boolean;
  onToggleNotifications?: (enabled: boolean) => void;
  tab?: InspectorTab;
  onTabChange?: (tab: InspectorTab) => void;
  onDecision: (requestId: string | number, decision: ApprovalDecision) => void;
  onRefreshSkills?: () => void;
  onRefreshProjectPanels?: () => void;
  onSelectFile?: (path: string) => void;
  onStartReview?: () => void;
  open?: boolean;
}) {
  const [internalTab, setInternalTab] = useState<InspectorTab>('review');
  const activeTab = props.tab ?? internalTab;
  const setActiveTab = props.onTabChange ?? setInternalTab;
  const relatedApproval = props.card?.id ? props.approvals.find((a) => a.itemId === props.card?.id) : undefined;
  const plans = props.cards.filter((card) => card.kind === 'plan' || card.kind === 'reasoning');
  const diffs = props.cards.filter((card) => card.kind === 'fileChange');
  const commands = props.cards.filter((card) => card.kind === 'command');

  return (
    <aside className={`inspector codex-inspector ${props.open === false ? 'closed' : ''}`}>
      <div className="inspector-head">
        <div>
          <div className="section-title">Side panel</div>
          <strong>{tabTitle(activeTab)}</strong>
        </div>
        <span className="side-panel-count">{diffs.length} files</span>
      </div>

      <div className="inspector-tabs codex-inspector-tabs">
        {tabs.map((item) => (
          <button key={item} className={`tab ${activeTab === item ? 'active' : ''}`} onClick={() => setActiveTab(item)}>{tabLabel(item)}</button>
        ))}
      </div>

      {activeTab === 'review' ? (
        <ReviewTab
          card={props.card}
          cards={props.cards}
          project={props.project}
          thread={props.thread}
          account={props.account}
          gitStatus={props.gitStatus}
          onStartReview={props.onStartReview}
          relatedApproval={relatedApproval}
          approvals={props.approvals}
          errors={props.errors}
          onDecision={props.onDecision}
        />
      ) : null}
      {activeTab === 'plan' ? <PlanTab plans={plans} /> : null}
      {activeTab === 'diff' ? <DiffTab diffs={diffs} focusedCard={props.card} /> : null}
      {activeTab === 'files' ? <FilesTab tree={props.fileTree} file={props.fileContent} loading={Boolean(props.projectPanelLoading)} error={props.projectPanelError} onSelectFile={props.onSelectFile} onRefresh={props.onRefreshProjectPanels} /> : null}
      {activeTab === 'git' ? <GitTab status={props.gitStatus} loading={Boolean(props.projectPanelLoading)} error={props.projectPanelError} onRefresh={props.onRefreshProjectPanels} /> : null}
      {activeTab === 'terminal' ? <TerminalTab commands={commands} focusedCard={props.card} /> : null}
      {activeTab === 'artifacts' ? <ArtifactsTab cards={props.cards} project={props.project} /> : null}
      {activeTab === 'skills' ? <SkillsTab skills={props.skills} loading={Boolean(props.skillsLoading)} onRefresh={props.onRefreshSkills ?? (() => undefined)} /> : null}
      {activeTab === 'agents' ? <AgentsTab agents={props.agents ?? []} loading={Boolean(props.agentsLoading)} onRefresh={props.onRefreshSkills ?? (() => undefined)} /> : null}
      {activeTab === 'settings' ? <SettingsTab health={props.health} codexWebConfig={props.codexWebConfig} account={props.account} notificationsEnabled={Boolean(props.notificationsEnabled)} notificationsSupported={props.notificationsSupported !== false} onToggleNotifications={props.onToggleNotifications} /> : null}
      {activeTab === 'raw' ? <RawTab card={props.card} thread={props.thread} project={props.project} /> : null}
    </aside>
  );
}

function ReviewTab(props: {
  card?: TimelineCard;
  cards: TimelineCard[];
  project?: Project;
  thread?: ThreadSummary;
  account?: AccountSummary;
  gitStatus?: GitStatusSummary;
  approvals: ApprovalRequest[];
  relatedApproval?: ApprovalRequest;
  errors: string[];
  onDecision: (requestId: string | number, decision: ApprovalDecision) => void;
  onStartReview?: () => void;
}) {
  const commands = props.cards.filter((card) => card.kind === 'command');
  const diffs = props.cards.filter((card) => card.kind === 'fileChange');
  const failedCommands = commands.filter((card) => String(card.status ?? '').includes('failed')).length;
  const changedFiles = props.gitStatus?.files.length ?? diffs.length;
  const status = props.thread?.status ?? 'ready';
  const branch = props.gitStatus?.isRepo ? props.gitStatus.branch ?? 'HEAD' : 'not a git repo';
  const account = props.account?.email ?? props.account?.mode ?? (props.account?.authenticated ? 'authenticated' : undefined);
  return (
    <>
      <section className="panel review-summary-panel">
        <div className="review-title-row">
          <div>
            <div className="section-title">Review</div>
            <div className="panel-title">{props.thread?.name || props.thread?.preview || 'Current thread'}</div>
          </div>
          <span className={`status ${props.thread?.status ?? 'idle'}`}>{status}</span>
        </div>
        <div className="review-plain-list">
          <div className="review-plain-row">
            <span>Changes</span>
            <strong>{changedFiles} {changedFiles === 1 ? 'file' : 'files'}</strong>
          </div>
          <div className="review-plain-row">
            <span>Commands</span>
            <strong>{commands.length}</strong>
          </div>
          {props.approvals.length > 0 ? (
            <div className="review-plain-row">
              <span>Approvals</span>
              <strong>{props.approvals.length}</strong>
            </div>
          ) : null}
          {failedCommands > 0 ? (
            <div className="review-plain-row">
              <span>Failed</span>
              <strong>{failedCommands}</strong>
            </div>
          ) : null}
        </div>
        <div className="review-actions-row">
          <button className="small primary" disabled={!props.onStartReview} onClick={props.onStartReview}>Start review</button>
          {changedFiles > 0 ? <button className="small ghost" disabled title="Requires Git stage integration">Stage</button> : null}
          {changedFiles > 0 ? <button className="small ghost" disabled title="Requires PR integration">Commit</button> : null}
        </div>
      </section>

      {props.relatedApproval ? <ApprovalPanel approval={props.relatedApproval} onDecision={props.onDecision} /> : null}
      {!props.relatedApproval && props.approvals.length > 0 ? <ApprovalPanel approval={props.approvals[0]} onDecision={props.onDecision} /> : null}

      <section className="panel context-panel">
        <div className="section-title">Environment</div>
        <div className="context-list">
          <div className="context-row"><span>Project</span><strong>{props.project?.name ?? '-'}</strong></div>
          <div className="context-row"><span>Mode</span><strong>Local</strong></div>
          <div className="context-row"><span>Branch</span><strong>{branch}</strong></div>
          <div className="context-row"><span>CWD</span><code title={props.project?.cwd}>{props.project?.cwd ?? '-'}</code></div>
          {account ? <div className="context-row"><span>Account</span><strong>{account}</strong></div> : null}
        </div>
      </section>

      {props.card ? (
        <section className="panel grow focused-panel">
          <div className="section-title">Focused item</div>
          <FocusedCard card={props.card} />
        </section>
      ) : null}

      {props.errors.length ? (
        <section className="panel error-panel">
          <div className="section-title">Errors</div>
          {props.errors.map((error, index) => <div key={index} className="error-line">{error}</div>)}
        </section>
      ) : null}
    </>
  );
}

function ApprovalPanel(props: { approval: ApprovalRequest; onDecision: (requestId: string | number, decision: ApprovalDecision) => void }) {
  const approval = props.approval;
  return (
    <section className="panel attention codex-approval-panel">
      <div className="section-title">Approval required</div>
      <div className="panel-title">{approval.title}</div>
      {approval.reason ? <p>{approval.reason}</p> : null}
      {approval.command ? <pre className="approval-command">{approval.command}</pre> : null}
      {approval.grantRoot ? <div className="mono subtle">grant root: {approval.grantRoot}</div> : null}
      <div className="approval-actions vertical">
        <button className="primary" onClick={() => props.onDecision(approval.requestId, 'accept')}>Allow once</button>
        <button onClick={() => props.onDecision(approval.requestId, 'acceptForSession')}>Allow for session</button>
        <button onClick={() => props.onDecision(approval.requestId, 'decline')}>Decline</button>
        <button onClick={() => props.onDecision(approval.requestId, 'cancel')}>Cancel turn</button>
      </div>
    </section>
  );
}

function PlanTab({ plans }: { plans: TimelineCard[] }) {
  return (
    <section className="panel grow plan-panel">
      <div className="section-title">Plan and reasoning</div>
      {plans.length === 0 ? <div className="empty">No plan events yet.</div> : null}
      {[...plans].reverse().map((plan, index) => (
        <article key={plan.id} className="plan-step-card">
          <div className="plan-step-number">{index + 1}</div>
          <div>
            <div className="panel-title">{plan.title}</div>
            <div className="message-text">{plan.text}</div>
          </div>
        </article>
      ))}
    </section>
  );
}

function DiffTab({ diffs, focusedCard }: { diffs: TimelineCard[]; focusedCard?: TimelineCard }) {
  const [scope, setScope] = useState<'uncommitted' | 'branch' | 'turn'>('uncommitted');
  const focusedDiff = focusedCard?.kind === 'fileChange' ? focusedCard : diffs.at(-1);
  return (
    <section className="panel grow diff-panel">
      <div className="review-pane-header">
        <div>
          <div className="section-title">Changes</div>
          <div className="panel-title">Review pane</div>
        </div>
        <div className="scope-switcher">
          {(['uncommitted', 'branch', 'turn'] as const).map((item) => (
            <button key={item} className={scope === item ? 'active' : ''} onClick={() => setScope(item)}>{scopeLabel(item)}</button>
          ))}
        </div>
      </div>
      {diffs.length === 0 ? <div className="empty">No file changes reported.</div> : null}
      {diffs.length > 0 ? (
        <div className="review-file-list">
          {diffs.map((diff) => <button key={diff.id} className={`review-file-row ${diff.id === focusedDiff?.id ? 'active' : ''}`}><span>{diff.filePath ?? diff.title}</span><span>{diffStats(diff.diff).label}</span></button>)}
        </div>
      ) : null}
      {focusedDiff ? <FocusedCard card={focusedDiff} /> : null}
    </section>
  );
}

function TerminalTab({ commands, focusedCard }: { commands: TimelineCard[]; focusedCard?: TimelineCard }) {
  const focusedCommand = focusedCard?.kind === 'command' ? focusedCard : commands.at(-1);
  return (
    <section className="panel grow terminal-panel">
      <div className="review-pane-header">
        <div>
          <div className="section-title">Terminal</div>
          <div className="panel-title">Thread commands</div>
        </div>
        <button className="small ghost" disabled title="Requires process control">Clear</button>
      </div>
      {commands.length === 0 ? <div className="empty">No command executions yet.</div> : null}
      {commands.length > 0 ? (
        <div className="command-run-list">
          {commands.map((command) => <button key={command.id} className={`command-run-row ${command.status ?? ''} ${command.id === focusedCommand?.id ? 'active' : ''}`}><span>{command.command ?? command.title}</span><span>{command.status ?? 'ready'}</span></button>)}
        </div>
      ) : null}
      {focusedCommand ? <FocusedCard card={focusedCommand} /> : null}
    </section>
  );
}


function FilesTab(props: {
  tree?: FileTreeNode;
  file?: FileReadResult;
  loading: boolean;
  error?: string;
  onSelectFile?: (path: string) => void;
  onRefresh?: () => void;
}) {
  return (
    <section className="panel grow files-panel">
      <div className="review-pane-header">
        <div>
          <div className="section-title">Files</div>
          <div className="panel-title">Project explorer</div>
        </div>
        <button className="small ghost" disabled={props.loading || !props.onRefresh} onClick={props.onRefresh}>{props.loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      {props.error ? <div className="error-line">{props.error}</div> : null}
      <div className="file-explorer-grid">
        <div className="file-tree-panel">
          {!props.tree ? <div className="empty">No file tree loaded.</div> : <FileTree node={props.tree} level={0} onSelectFile={props.onSelectFile} selectedPath={props.file?.path} />}
        </div>
        <div className="file-preview-panel">
          {!props.file ? <div className="empty">Select a file to preview it. Large files are truncated server-side.</div> : (
            <>
              <div className="file-preview-head">
                <strong>{props.file.path}</strong>
                <code>{formatBytes(props.file.size)}{props.file.truncated ? ' · truncated' : ''}</code>
              </div>
              <pre className="file-preview">{props.file.content}</pre>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function FileTree(props: { node: FileTreeNode; level: number; selectedPath?: string; onSelectFile?: (path: string) => void }) {
  const node = props.node;
  const isDir = node.type === 'directory';
  const icon = isDir ? '▸' : node.type === 'symlink' ? '↪' : '·';
  return (
    <div className="file-node-wrap">
      <button
        className={`file-node ${props.selectedPath === node.path ? 'active' : ''} ${isDir ? 'directory' : 'file'}`}
        style={{ paddingLeft: 8 + props.level * 14 }}
        disabled={isDir || node.path === '.' || !props.onSelectFile}
        onClick={() => props.onSelectFile?.(node.path)}
        title={node.path}
      >
        <span>{icon}</span>
        <span>{node.name}</span>
        {node.size !== undefined && !isDir ? <code>{formatBytes(node.size)}</code> : null}
      </button>
      {node.children?.map((child) => <FileTree key={`${child.path}:${child.name}`} node={child} level={props.level + 1} selectedPath={props.selectedPath} onSelectFile={props.onSelectFile} />)}
    </div>
  );
}

function GitTab(props: { status?: GitStatusSummary; loading: boolean; error?: string; onRefresh?: () => void }) {
  const status = props.status;
  const grouped = groupGitFiles(status?.files ?? []);
  return (
    <section className="panel grow git-panel">
      <div className="review-pane-header">
        <div>
          <div className="section-title">Git</div>
          <div className="panel-title">Working tree</div>
        </div>
        <button className="small ghost" disabled={props.loading || !props.onRefresh} onClick={props.onRefresh}>{props.loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      {props.error ? <div className="error-line">{props.error}</div> : null}
      {!status ? <div className="empty">Git status has not loaded.</div> : null}
      {status && !status.isRepo ? <div className="empty">This project is not a Git repository, or Git status failed: {status.error ?? 'unknown error'}</div> : null}
      {status?.isRepo ? (
        <>
          <div className="git-branch-card">
            <div><span>Branch</span><strong>{status.branch ?? 'HEAD'}</strong></div>
            <div><span>Upstream</span><strong>{status.upstream ?? '—'}</strong></div>
            <div><span>Ahead</span><strong>{status.ahead ?? 0}</strong></div>
            <div><span>Behind</span><strong>{status.behind ?? 0}</strong></div>
          </div>
          <div className="review-actions-row">
            <button className="small ghost" disabled title="Stage integration is intentionally not enabled yet">Stage selected</button>
            <button className="small ghost" disabled title="Revert integration is intentionally not enabled yet">Revert selected</button>
            <button className="small ghost" disabled title="Commit integration is intentionally not enabled yet">Commit</button>
          </div>
          {status.files.length === 0 ? <div className="empty">Working tree clean.</div> : null}
          {Object.entries(grouped).map(([label, files]) => files.length ? (
            <div key={label} className="git-group">
              <div className="section-title">{label}</div>
              {files.map((file) => (
                <div key={`${file.index}:${file.workingTree}:${file.path}`} className="git-file-row">
                  <span className={`git-status status-${file.status}`}>{file.index}{file.workingTree}</span>
                  <span>{file.path}</span>
                  <code>{file.status}</code>
                </div>
              ))}
            </div>
          ) : null)}
        </>
      ) : null}
    </section>
  );
}

function groupGitFiles(files: GitStatusSummary['files']): Record<string, GitStatusSummary['files']> {
  const groups: Record<string, GitStatusSummary['files']> = {
    Modified: [],
    Added: [],
    Deleted: [],
    Untracked: [],
    Other: []
  };
  for (const file of files) {
    if (file.status === 'modified') groups.Modified.push(file);
    else if (file.status === 'added') groups.Added.push(file);
    else if (file.status === 'deleted') groups.Deleted.push(file);
    else if (file.status === 'untracked') groups.Untracked.push(file);
    else groups.Other.push(file);
  }
  return groups;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function ArtifactsTab({ cards, project }: { cards: TimelineCard[]; project?: Project }) {
  const files = cards.filter((card) => card.kind === 'fileChange');
  const summaries = cards.filter((card) => card.kind === 'agent' || card.kind === 'plan').slice(-4).reverse();
  return (
    <section className="panel grow artifacts-panel">
      <div className="section-title">Artifacts</div>
      <div className="artifact-preview-card">
        <div className="artifact-icon">▤</div>
        <div>
          <strong>{project?.name ?? 'Project'}</strong>
          <p>Generated previews can be mounted here once file preview routes are added.</p>
        </div>
      </div>
      <div className="section-title">Recent files</div>
      {files.length === 0 ? <div className="empty">No generated file previews yet.</div> : null}
      {files.map((file) => <div key={file.id} className="artifact-file-row"><span>{file.filePath ?? file.title}</span><code>{diffStats(file.diff).label}</code></div>)}
      <div className="section-title">Summaries</div>
      {summaries.map((summary) => <article key={summary.id} className="summary-card"><strong>{summary.title}</strong>{summary.text ? <p>{summary.text}</p> : null}</article>)}
    </section>
  );
}

function SkillsTab(props: { skills: SkillSummary[]; loading: boolean; onRefresh?: () => void }) {
  return (
    <section className="panel grow skills-panel">
      <div className="pane-header">
        <div>
          <div className="section-title">Skills</div>
          <div className="subtle">Available to the active project through app-server.</div>
        </div>
        <button className="small ghost" onClick={props.onRefresh} disabled={props.loading || !props.onRefresh}>{props.loading ? 'Loading…' : 'Reload'}</button>
      </div>
      {props.skills.length === 0 ? <div className="empty">No skills returned for this project.</div> : null}
      <div className="skill-table">
        {props.skills.map((skill) => (
          <article key={skill.id} className={`skill-row ${skill.enabled === false ? 'disabled' : ''}`}>
            <span className="skill-row-icon">◇</span>
            <div>
              <strong>{skill.name}</strong>
              {skill.description ? <p>{skill.description}</p> : null}
            </div>
            <span className="skill-scope">{skill.scope ?? skill.source ?? 'Personal'}</span>
          </article>
        ))}
      </div>
    </section>
  );
}


function AgentsTab(props: { agents: AgentSummary[]; loading: boolean; onRefresh?: () => void }) {
  const repoAgents = props.agents.filter((agent) => agent.scope === 'repo');
  const userAgents = props.agents.filter((agent) => agent.scope !== 'repo');
  return (
    <section className="panel grow agents-panel">
      <div className="pane-header">
        <div>
          <div className="section-title">Custom agents</div>
          <div className="subtle">Discovered from ~/.codex/agents and project .codex/agents.</div>
        </div>
        <button className="small ghost" onClick={props.onRefresh} disabled={props.loading || !props.onRefresh}>{props.loading ? 'Loading…' : 'Reload'}</button>
      </div>
      {props.agents.length === 0 ? <div className="empty">No custom agents found. Built-in agents such as explorer and worker can still be requested in natural language.</div> : null}
      <AgentGroup title="Project agents" agents={repoAgents} />
      <AgentGroup title="User agents" agents={userAgents} />
      <div className="agent-help-card">
        <strong>Composer shortcut</strong>
        <p>Type <code>#</code> in the composer to pick one of these agents. Codex-Platform prefixes the next turn with a direct delegation request.</p>
      </div>
    </section>
  );
}

function AgentGroup({ title, agents }: { title: string; agents: AgentSummary[] }) {
  if (!agents.length) return null;
  return (
    <div className="agent-group">
      <div className="section-title">{title}</div>
      {agents.map((agent) => (
        <article key={agent.id} className="agent-card">
          <div className="agent-card-head">
            <span className="agent-avatar">◎</span>
            <div>
              <strong>{agent.name}</strong>
              {agent.aliases?.length ? <span className="agent-aliases">{agent.aliases.join(', ')}</span> : null}
            </div>
            <span className="skill-scope">{agent.scope ?? 'agent'}</span>
          </div>
          {agent.description ? <p>{agent.description}</p> : null}
          <div className="agent-meta-row">
            {agent.model ? <code>{agent.model}</code> : null}
            {agent.effort ? <code>{agent.effort}</code> : null}
            {agent.sandbox ? <code>{agent.sandbox}</code> : null}
            {agent.hasDeveloperInstructions ? <code>instructions</code> : null}
          </div>
          {agent.path ? <code className="agent-path" title={agent.path}>{agent.path}</code> : null}
        </article>
      ))}
    </div>
  );
}

function SettingsTab(props: { health?: ServerHealth; codexWebConfig?: CodexWebConfig; account?: AccountSummary; notificationsEnabled: boolean; notificationsSupported: boolean; onToggleNotifications?: (enabled: boolean) => void }) {
  return (
    <section className="panel grow">
      <div className="section-title">Runtime settings</div>
      <div className="kv"><span>Auth</span><strong>{props.codexWebConfig?.authRequired ? 'required' : 'not required'}</strong></div>
      <div className="kv"><span>Mode</span><strong>{props.codexWebConfig?.demoMode ? 'demo' : 'real app-server'}</strong></div>
      <div className="kv"><span>Runtime</span><strong>{props.health?.appServer ?? 'unknown'}</strong></div>
      <div className="kv"><span>Deploy target</span><strong>{props.health?.huggingFace?.enabled ? 'Hugging Face Space' : 'self-hosted'}</strong></div>
      {props.health?.huggingFace?.spaceHost ? <div className="kv"><span>Space host</span><code>{props.health.huggingFace.spaceHost}</code></div> : null}
      {props.health?.codexHome ? <div className="kv"><span>Codex home</span><code>{props.health.codexHome}</code></div> : null}
      <div className="kv"><span>Account</span><strong>{props.account?.email ?? props.account?.mode ?? '—'}</strong></div>
      <div className="kv"><span>Approval</span><code>{props.codexWebConfig?.defaultApprovalPolicy ?? '—'}</code></div>
      <div className="kv"><span>Sandbox</span><code>{props.codexWebConfig?.defaultSandbox ?? '—'}</code></div>
      <div className="kv"><span>Default model</span><code>{props.codexWebConfig?.defaultModel ?? 'Codex default'}</code></div>
      <div className="settings-toggle-row">
        <div>
          <strong>Browser approval notifications</strong>
          <span>Useful when supervising long running agents from another tab or device.</span>
        </div>
        <button disabled={!props.notificationsSupported || !props.onToggleNotifications} onClick={() => props.onToggleNotifications?.(!props.notificationsEnabled)}>
          {props.notificationsEnabled ? 'Enabled' : 'Enable'}
        </button>
      </div>
      <div className="kv"><span>Workspace</span><code>{props.health?.workspaceRoot ?? '—'}</code></div>
      <div className="kv"><span>Data dir</span><code>{props.health?.dataDir ?? '—'}</code></div>
      {props.health?.allowedWorkspaceRoots?.length ? (
        <div className="settings-list">
          <div className="section-title">Allowed project roots</div>
          {props.health.allowedWorkspaceRoots.map((root) => <code key={root}>{root}</code>)}
        </div>
      ) : null}
    </section>
  );
}

function RawTab(props: { card?: TimelineCard; thread?: ThreadSummary; project?: Project }) {
  return (
    <section className="panel grow">
      <div className="section-title">Raw payload</div>
      <pre className="json-snippet large-json">{JSON.stringify({ card: props.card, thread: props.thread, project: props.project }, null, 2)}</pre>
    </section>
  );
}

function FocusedCard({ card }: { card: TimelineCard }) {
  if (card.kind === 'fileChange') {
    return (
      <div>
        <div className="panel-title">{card.filePath ?? card.title}</div>
        {card.filePath ? <code>{card.filePath}</code> : null}
        <DiffBlock diff={card.diff || JSON.stringify(card.payload, null, 2)} />
      </div>
    );
  }

  if (card.kind === 'command') {
    return (
      <div>
        <div className="panel-title mono">{card.command || card.title}</div>
        {card.cwd ? <code>{card.cwd}</code> : null}
        <pre className="terminal-output large codex-terminal-output">{card.stdout}{card.stderr ? `\n${card.stderr}` : ''}</pre>
        {card.exitCode !== null && card.exitCode !== undefined ? <div className="exit-code">exit {card.exitCode}</div> : null}
      </div>
    );
  }

  return (
    <div>
      <div className="panel-title">{card.title}</div>
      {card.text ? <div className="message-text inspector-text">{card.text}</div> : null}
      {!card.text ? <pre className="json-snippet">{JSON.stringify(card.payload ?? card, null, 2)}</pre> : null}
    </div>
  );
}

function tabLabel(tab: InspectorTab): string {
  switch (tab) {
    case 'review': return 'Review';
    case 'plan': return 'Plan';
    case 'diff': return 'Diff';
    case 'files': return 'Files';
    case 'git': return 'Git';
    case 'terminal': return 'Terminal';
    case 'artifacts': return 'Artifacts';
    case 'skills': return 'Skills';
    case 'agents': return 'Agents';
    case 'settings': return 'Settings';
    case 'raw': return 'Raw';
  }
}

function tabTitle(tab: InspectorTab): string {
  if (tab === 'diff') return 'Review changes';
  if (tab === 'files') return 'Project files';
  if (tab === 'git') return 'Git explorer';
  if (tab === 'terminal') return 'Terminal and actions';
  if (tab === 'artifacts') return 'Sidebar and artifacts';
  return tabLabel(tab);
}

function scopeLabel(scope: 'uncommitted' | 'branch' | 'turn'): string {
  if (scope === 'uncommitted') return 'Uncommitted';
  if (scope === 'branch') return 'Branch';
  return 'Last turn';
}

function diffStats(diff?: string): { added: number; removed: number; label: string } {
  let added = 0;
  let removed = 0;
  for (const line of (diff ?? '').split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added += 1;
    if (line.startsWith('-')) removed += 1;
  }
  return { added, removed, label: `+${added} −${removed}` };
}
