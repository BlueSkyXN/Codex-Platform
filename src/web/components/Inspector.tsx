import { useState } from 'react';
import { DiffBlock } from './DiffBlock.js';
import { Icon } from './Icon.js';
import type { AccountSummary, ApprovalDecision, ApprovalRecord, ApprovalRequest, FileReadResult, FileTreeNode, GitDiffResult, GitStatusSummary, InspectorTab, Project, ServerHealth, ThreadSummary, TimelineCard } from '../../shared/types.js';
import { deriveSupervisionSummary, supervisionStateClass } from '../lib/supervision.js';

const primaryTabs: InspectorTab[] = ['review', 'plan', 'diff', 'files', 'git', 'terminal', 'browser', 'artifacts', 'raw'];

export function Inspector(props: {
  card?: TimelineCard;
  cards: TimelineCard[];
  approvals: ApprovalRequest[];
  approvalHistory: ApprovalRecord[];
  project?: Project;
  thread?: ThreadSummary;
  errors: string[];
  fileTree?: FileTreeNode;
  fileContent?: FileReadResult;
  gitStatus?: GitStatusSummary;
  gitDiff?: GitDiffResult;
  selectedGitPath?: string;
  gitActionBusy?: boolean;
  gitActionMessage?: string;
  projectPanelLoading?: boolean;
  projectPanelError?: string;
  account?: AccountSummary;
  health?: ServerHealth;
  tab?: InspectorTab;
  onTabChange?: (tab: InspectorTab) => void;
  onDecision: (requestId: string | number, decision: ApprovalDecision) => void;
  onRefreshProjectPanels?: () => void;
  onSelectFile?: (path: string) => void;
  onSelectGitFile?: (path: string, cached?: boolean) => void;
  onGitStage?: (paths: string[]) => void;
  onGitUnstage?: (paths: string[]) => void;
  onGitCommit?: (message: string) => void;
  onStartReview?: () => void;
  onFocusCard?: (cardId: string) => void;
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
          <div className="section-title">Progress</div>
          <strong>{tabTitle(activeTab)}</strong>
        </div>
        <span className="side-panel-count">{diffs.length} files</span>
      </div>

      <div className="inspector-tabs codex-inspector-tabs">
        {primaryTabs.map((item) => (
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
          approvalHistory={props.approvalHistory}
          errors={props.errors}
          onDecision={props.onDecision}
          onFocusCard={props.onFocusCard}
        />
      ) : null}
      {activeTab === 'plan' ? <PlanTab plans={plans} /> : null}
      {activeTab === 'diff' ? <DiffTab diffs={diffs} focusedCard={props.card} onFocusCard={props.onFocusCard} /> : null}
      {activeTab === 'files' ? <FilesTab tree={props.fileTree} file={props.fileContent} loading={Boolean(props.projectPanelLoading)} error={props.projectPanelError} onSelectFile={props.onSelectFile} onRefresh={props.onRefreshProjectPanels} /> : null}
      {activeTab === 'git' ? (
        <GitTab
          status={props.gitStatus}
          diff={props.gitDiff}
          selectedPath={props.selectedGitPath}
          loading={Boolean(props.projectPanelLoading)}
          actionBusy={Boolean(props.gitActionBusy)}
          actionMessage={props.gitActionMessage}
          error={props.projectPanelError}
          onRefresh={props.onRefreshProjectPanels}
          onSelectFile={props.onSelectGitFile}
          onStage={props.onGitStage}
          onUnstage={props.onGitUnstage}
          onCommit={props.onGitCommit}
        />
      ) : null}
      {activeTab === 'terminal' ? <TerminalTab commands={commands} focusedCard={props.card} onFocusCard={props.onFocusCard} /> : null}
      {activeTab === 'browser' ? <BrowserTab cards={props.cards} project={props.project} health={props.health} /> : null}
      {activeTab === 'artifacts' ? <ArtifactsTab cards={props.cards} project={props.project} onFocusCard={props.onFocusCard} /> : null}
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
  approvalHistory: ApprovalRecord[];
  relatedApproval?: ApprovalRequest;
  errors: string[];
  onDecision: (requestId: string | number, decision: ApprovalDecision) => void;
  onStartReview?: () => void;
  onFocusCard?: (cardId: string) => void;
}) {
  const commands = props.cards.filter((card) => card.kind === 'command');
  const diffs = props.cards.filter((card) => card.kind === 'fileChange');
  const failedCommands = commands.filter((card) => String(card.status ?? '').includes('failed')).length;
  const changedFiles = props.gitStatus?.files.length ?? diffs.length;
  const status = props.thread?.status ?? 'ready';
  const branch = props.gitStatus?.isRepo ? props.gitStatus.branch ?? 'HEAD' : 'not a git repo';
  const account = props.account?.email ?? props.account?.mode ?? (props.account?.authenticated ? 'authenticated' : undefined);
  const shipInfo = props.gitStatus?.isRepo ? gitShipInfo(props.gitStatus) : undefined;
  const supervision = deriveSupervisionSummary({ thread: props.thread, cards: props.cards, approvals: props.approvals });
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
        <div className="review-control-strip" aria-label="Command center state">
          <ReviewSignal label="Thread" value={status} />
          <ReviewSignal label="Risk" value={props.approvals.length ? `${props.approvals.length} pending` : 'clear'} tone={props.approvals.length ? 'warn' : 'ok'} />
          <ReviewSignal label="Review" value={changedFiles === 0 ? 'clean' : `${changedFiles} changed`} tone={changedFiles ? 'warn' : 'ok'} />
          <ReviewSignal label="Ship" value={shipInfo?.label ?? 'not ready'} tone={shipInfo?.state === 'blocked' ? 'warn' : shipInfo?.state === 'ready' ? 'ok' : undefined} />
        </div>
        <div className="review-actions-row">
          <button className="small primary" disabled={!props.onStartReview} onClick={props.onStartReview}>Start review</button>
        </div>
      </section>

      {props.relatedApproval ? <ApprovalPanel approval={props.relatedApproval} onDecision={props.onDecision} /> : null}
      {!props.relatedApproval && props.approvals.length > 0 ? <ApprovalPanel approval={props.approvals[0]} onDecision={props.onDecision} /> : null}
      <ApprovalHistoryPanel approvals={props.approvalHistory} onFocusCard={props.onFocusCard} />

      <section className={`panel supervision-panel ${supervisionStateClass(supervision.state)}`}>
        <div className="section-title">Agent supervision</div>
        <div className="supervision-focus">
          <span className="supervision-focus-icon"><Icon name={supervision.state === 'waiting_approval' ? 'clock' : supervision.state === 'failed' ? 'close' : 'agent'} size={15} /></span>
          <div>
            <div className="panel-title">{supervision.current}</div>
            <p title={supervision.detail}>{supervision.detail}</p>
          </div>
          <span className={`status ${supervisionStateClass(supervision.state)}`}>{supervision.label}</span>
        </div>
        <div className="supervision-grid">
          <div><span>Turn</span><strong title={supervision.turnId}>{supervision.turnId ? compactId(supervision.turnId) : '-'}</strong></div>
          <div><span>Commands</span><strong>{supervision.counts.commands}</strong></div>
          <div><span>Files</span><strong>{supervision.counts.files}</strong></div>
          <div><span>Approvals</span><strong>{supervision.counts.approvals}</strong></div>
        </div>
        <div className="supervision-next">{supervision.nextAction}</div>
      </section>

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

function ReviewSignal(props: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`review-signal ${props.tone ?? ''}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function compactId(id: string): string {
  return id.replace(/^(turn|item|call)_/, '').slice(-10);
}

function ApprovalHistoryPanel(props: { approvals: ApprovalRecord[]; onFocusCard?: (cardId: string) => void }) {
  const approvals = props.approvals.slice(0, 5);
  return (
    <section className="panel approval-history-panel">
      <div className="section-title">Approval history</div>
      {approvals.length === 0 ? <div className="empty-inline">No approval decisions recorded for this thread.</div> : null}
      {approvals.length > 0 ? (
        <div className="approval-history-list">
          {approvals.map((approval) => (
            <article key={String(approval.requestId)} className={`approval-history-row ${decisionTone(approval.decision)}`}>
              <div>
                <strong>{approval.title}</strong>
                <span>{approval.command ?? approval.reason ?? approval.kind}</span>
              </div>
              <div className="approval-history-meta">
                <span className="status">{approval.decision ?? 'resolved'}</span>
                <code title={approval.turnId}>{approval.turnId ? compactId(approval.turnId) : formatTime(approval.resolvedAt)}</code>
                {approval.itemId && props.onFocusCard ? <button className="mini-action" onClick={() => props.onFocusCard?.(approval.itemId!)}>Open item</button> : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function decisionTone(decision?: string): string {
  const value = String(decision ?? '').toLowerCase();
  if (value.includes('accept') || value.includes('allow')) return 'accepted';
  if (value.includes('decline') || value.includes('deny') || value.includes('cancel')) return 'declined';
  return 'resolved';
}

function formatTime(value?: number): string {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

function DiffTab({ diffs, focusedCard, onFocusCard }: { diffs: TimelineCard[]; focusedCard?: TimelineCard; onFocusCard?: (cardId: string) => void }) {
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
          {diffs.map((diff) => (
            <button key={diff.id} className={`review-file-row ${diff.id === focusedDiff?.id ? 'active' : ''}`} onClick={() => onFocusCard?.(diff.id)}>
              <span>{diff.filePath ?? diff.title}</span>
              <span>{diffStats(diff.diff).label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {focusedDiff ? <FocusedCard card={focusedDiff} /> : null}
    </section>
  );
}

function TerminalTab({ commands, focusedCard, onFocusCard }: { commands: TimelineCard[]; focusedCard?: TimelineCard; onFocusCard?: (cardId: string) => void }) {
  const focusedCommand = focusedCard?.kind === 'command' ? focusedCard : commands.at(-1);
  const failedCount = commands.filter((command) => String(command.status ?? '').toLowerCase().includes('fail') || (command.exitCode ?? 0) !== 0).length;
  return (
    <section className="panel grow terminal-panel">
      <div className="review-pane-header">
        <div>
          <div className="section-title">Terminal</div>
          <div className="panel-title">Thread commands</div>
        </div>
        <button className="small ghost" disabled title="Requires process control">Clear</button>
      </div>
      <div className="terminal-metrics">
        <div><span>Runs</span><strong>{commands.length}</strong></div>
        <div><span>Failed</span><strong>{failedCount}</strong></div>
        <div><span>Focused</span><strong>{focusedCommand?.status ?? 'none'}</strong></div>
      </div>
      {commands.length === 0 ? <div className="empty">No command executions yet.</div> : null}
      {commands.length > 0 ? (
        <div className="command-run-list">
          {commands.map((command) => (
            <button key={command.id} className={`command-run-row ${command.status ?? ''} ${command.id === focusedCommand?.id ? 'active' : ''}`} onClick={() => onFocusCard?.(command.id)}>
              <span>{command.command ?? command.title}</span>
              <span>{command.status ?? 'ready'}</span>
            </button>
          ))}
        </div>
      ) : null}
      {focusedCommand ? <FocusedCard card={focusedCommand} /> : null}
    </section>
  );
}

function BrowserTab({ cards, project, health }: { cards: TimelineCard[]; project?: Project; health?: ServerHealth }) {
  const [selectedUrl, setSelectedUrl] = useState('');
  const targets = browserTargets(cards, health);
  const activeTarget = targets.find((target) => target.url === selectedUrl) ?? targets[0];

  return (
    <section className="panel grow browser-panel">
      <div className="review-pane-header">
        <div>
          <div className="section-title">Browser</div>
          <div className="panel-title">Preview surface</div>
        </div>
        {activeTarget ? <a className="small browser-open-link" href={activeTarget.url} target="_blank" rel="noreferrer">Open</a> : null}
      </div>

      <div className="browser-context-card">
        <div>
          <span>Project</span>
          <strong>{project?.name ?? 'No project'}</strong>
        </div>
        <div>
          <span>Runtime</span>
          <strong>{health?.appServer ?? 'unknown'}</strong>
        </div>
        <div>
          <span>Deploy</span>
          <strong>{health?.huggingFace?.enabled ? 'Hugging Face' : 'local/self-hosted'}</strong>
        </div>
      </div>

      {targets.length > 0 ? (
        <div className="browser-target-list">
          {targets.map((target) => (
            <button key={target.id} className={`browser-target-row ${target.url === activeTarget?.url ? 'active' : ''}`} onClick={() => setSelectedUrl(target.url)}>
              <span>
                <strong>{target.title}</strong>
                <small>{target.subtitle}</small>
              </span>
              <code>{target.kind}</code>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          No browser preview URL has been captured yet. Start a dev server from a thread; localhost or HTTPS URLs printed by commands will appear here.
        </div>
      )}

      {activeTarget ? (
        <div className="browser-preview-card">
          <div className="browser-url-row">
            <code title={activeTarget.url}>{activeTarget.url}</code>
            <span>{activeTarget.source}</span>
          </div>
          <iframe
            className="browser-preview-frame"
            title={`Preview: ${activeTarget.title}`}
            src={activeTarget.url}
            sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
          />
        </div>
      ) : null}
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

function GitTab(props: {
  status?: GitStatusSummary;
  diff?: GitDiffResult;
  selectedPath?: string;
  loading: boolean;
  actionBusy: boolean;
  actionMessage?: string;
  error?: string;
  onRefresh?: () => void;
  onSelectFile?: (path: string, cached?: boolean) => void;
  onStage?: (paths: string[]) => void;
  onUnstage?: (paths: string[]) => void;
  onCommit?: (message: string) => void;
}) {
  const [commitMessage, setCommitMessage] = useState('');
  const [copiedPush, setCopiedPush] = useState(false);
  const status = props.status;
  const grouped = groupGitFiles(status?.files ?? []);
  const files = status?.files ?? [];
  const stageablePaths = files.filter(canStageFile).map((file) => file.path);
  const stagedPaths = files.filter(canUnstageFile).map((file) => file.path);
  const hasStagedChanges = stagedPaths.length > 0;
  const shipInfo = status?.isRepo ? gitShipInfo(status) : undefined;

  async function copyPushCommand(command?: string) {
    if (!command) return;
    await navigator.clipboard?.writeText(command);
    setCopiedPush(true);
    window.setTimeout(() => setCopiedPush(false), 1800);
  }

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
      {props.actionMessage ? <div className="success-line">{props.actionMessage}</div> : null}
      {!status ? <div className="empty">Git status has not loaded.</div> : null}
      {status && !status.isRepo ? <div className="empty">This project is not a Git repository, or Git status failed: {status.error ?? 'unknown error'}</div> : null}
      {status?.isRepo ? (
        <>
          <div className="git-branch-card">
            <div><span>Branch</span><strong>{status.branch ?? 'HEAD'}</strong></div>
            <div><span>Upstream</span><strong>{status.upstream ?? '—'}</strong></div>
            <div><span>Ahead</span><strong>{status.ahead ?? 0}</strong></div>
            <div><span>Behind</span><strong>{status.behind ?? 0}</strong></div>
            <div><span>HEAD</span><strong title={status.head}>{status.head ? shortSha(status.head) : '—'}</strong></div>
            <div><span>Upstream SHA</span><strong title={status.upstreamHead}>{status.upstreamHead ? shortSha(status.upstreamHead) : '—'}</strong></div>
          </div>
          {status.remoteUrl ? (
            <div className="git-remote-row">
              <span>Origin</span>
              <code title={status.remoteUrl}>{status.remoteUrl}</code>
            </div>
          ) : null}
          {shipInfo ? (
            <div className="git-ship-card">
              <div className="git-ship-head">
                <div>
                  <strong>Push / PR readiness</strong>
                  <span>{shipInfo.detail}</span>
                </div>
                <span className={`ship-state ${shipInfo.state}`}>{shipInfo.label}</span>
              </div>
              <div className="git-ship-checks">
                <ShipCheck label="Working tree" value={status.files.length === 0 ? 'clean' : `${status.files.length} changed`} state={status.files.length === 0 ? 'ok' : 'warn'} />
                <ShipCheck label="Ahead" value={String(status.ahead ?? 0)} state={(status.ahead ?? 0) > 0 ? 'ok' : 'idle'} />
                <ShipCheck label="Behind" value={String(status.behind ?? 0)} state={(status.behind ?? 0) > 0 ? 'warn' : 'ok'} />
                <ShipCheck label="Remote" value={shipInfo.remoteLabel} state={status.remoteUrl ? 'ok' : 'warn'} />
              </div>
              {shipInfo.pushCommand ? (
                <div className="git-push-command">
                  <code>{shipInfo.pushCommand}</code>
                  <button className="mini-action" onClick={() => void copyPushCommand(shipInfo.pushCommand)}>{copiedPush ? 'Copied' : 'Copy'}</button>
                </div>
              ) : null}
              <div className="git-ship-links">
                {shipInfo.compareUrl ? <a href={shipInfo.compareUrl} target="_blank" rel="noreferrer">Open compare</a> : null}
                {shipInfo.repoUrl ? <a href={shipInfo.repoUrl} target="_blank" rel="noreferrer">Open repo</a> : null}
              </div>
            </div>
          ) : null}
          <div className="git-action-bar">
            <button className="small ghost" disabled={props.actionBusy || stageablePaths.length === 0 || !props.onStage} onClick={() => props.onStage?.(stageablePaths)}>Stage all</button>
            <button className="small ghost" disabled={props.actionBusy || stagedPaths.length === 0 || !props.onUnstage} onClick={() => props.onUnstage?.(stagedPaths)}>Unstage all</button>
          </div>
          {status.files.length === 0 ? <div className="empty">Working tree clean.</div> : null}
          {Object.entries(grouped).map(([label, files]) => files.length ? (
            <div key={label} className="git-group">
              <div className="section-title">{label}</div>
              {files.map((file) => (
                <div
                  key={`${file.index}:${file.workingTree}:${file.path}`}
                  className={`git-file-row ${props.selectedPath === file.path ? 'active' : ''}`}
                >
                  <span className={`git-status status-${file.status}`}>{file.index}{file.workingTree}</span>
                  <button className="git-file-main" onClick={() => props.onSelectFile?.(file.path, canUnstageFile(file) && !canStageFile(file))}>{file.path}</button>
                  <span className="git-row-actions">
                    {canStageFile(file) ? <button className="mini-action" disabled={props.actionBusy || !props.onStage} onClick={() => props.onStage?.([file.path])}>Stage</button> : null}
                    {canUnstageFile(file) ? <button className="mini-action" disabled={props.actionBusy || !props.onUnstage} onClick={() => props.onUnstage?.([file.path])}>Unstage</button> : null}
                    <code>{file.status}</code>
                  </span>
                </div>
              ))}
            </div>
          ) : null)}
          <div className="git-diff-preview">
            <div className="review-pane-header compact">
              <div>
                <div className="section-title">Diff preview</div>
                <div className="panel-title">{props.diff?.path ?? props.selectedPath ?? 'Select a file'}</div>
              </div>
              {props.diff?.cached ? <span className="branch-chip">staged</span> : null}
            </div>
            {props.loading ? <div className="empty">Loading diff...</div> : null}
            {!props.loading && props.diff?.diff ? <DiffBlock diff={props.diff.diff} /> : null}
            {!props.loading && props.selectedPath && !props.diff?.diff ? <div className="empty">No diff available for the selected file.</div> : null}
            {!props.selectedPath ? <div className="empty">Select a changed file to preview its diff.</div> : null}
          </div>
          <div className="git-commit-box">
            <div>
              <div className="section-title">Commit</div>
              <div className="subtle">Commits staged changes in the active project. Push and PR are planned for the next phase.</div>
            </div>
            <textarea value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder="Commit message" rows={3} />
            <button className="small primary" disabled={props.actionBusy || !hasStagedChanges || !commitMessage.trim() || !props.onCommit} onClick={() => props.onCommit?.(commitMessage)}>
              {props.actionBusy ? 'Working...' : 'Commit staged changes'}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ShipCheck(props: { label: string; value: string; state: 'ok' | 'warn' | 'idle' }) {
  return (
    <div className="ship-check">
      <span>{props.label}</span>
      <strong className={props.state}>{props.value}</strong>
    </div>
  );
}

function canStageFile(file: GitStatusSummary['files'][number]): boolean {
  return file.status === 'untracked' || file.workingTree.trim() !== '';
}

function canUnstageFile(file: GitStatusSummary['files'][number]): boolean {
  return file.index.trim() !== '' && file.index !== '?';
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

function gitShipInfo(status: GitStatusSummary): {
  state: 'ready' | 'review' | 'blocked';
  label: string;
  detail: string;
  remoteLabel: string;
  pushCommand?: string;
  compareUrl?: string;
  repoUrl?: string;
} {
  const branch = status.branch && status.branch !== 'HEAD' ? status.branch : undefined;
  const remoteName = status.upstream?.split('/')[0] || 'origin';
  const repoUrl = githubRemoteUrl(status.remoteUrl);
  const remoteLabel = status.remoteUrl ? remoteName : 'missing';
  const pushCommand = branch ? `git push ${remoteName} ${branch}` : undefined;
  const compareUrl = repoUrl && branch ? `${repoUrl}/compare/${encodeURIComponent(branch)}?expand=1` : undefined;
  const changed = status.files.length;
  const ahead = status.ahead ?? 0;
  const behind = status.behind ?? 0;

  if (!branch || !status.remoteUrl) {
    return {
      state: 'blocked',
      label: 'setup needed',
      detail: 'Missing branch or remote.',
      remoteLabel,
      repoUrl
    };
  }
  if (behind > 0) {
    return {
      state: 'blocked',
      label: 'sync first',
      detail: `Behind upstream by ${behind}.`,
      remoteLabel,
      pushCommand,
      compareUrl,
      repoUrl
    };
  }
  if (changed > 0) {
    return {
      state: 'review',
      label: 'review first',
      detail: `${changed} working tree change${changed === 1 ? '' : 's'} before push.`,
      remoteLabel,
      pushCommand,
      compareUrl,
      repoUrl
    };
  }
  if (ahead > 0) {
    return {
      state: 'ready',
      label: 'ready to push',
      detail: `${ahead} local commit${ahead === 1 ? '' : 's'} ahead of upstream.`,
      remoteLabel,
      pushCommand,
      compareUrl,
      repoUrl
    };
  }
  return {
    state: 'ready',
    label: 'synced',
    detail: 'Local branch matches upstream.',
    remoteLabel,
    pushCommand,
    compareUrl,
    repoUrl
  };
}

function githubRemoteUrl(remote?: string): string | undefined {
  if (!remote) return undefined;
  const httpsMatch = remote.match(/^https:\/\/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/i);
  if (httpsMatch) return `https://github.com/${httpsMatch[1]}`;
  const sshMatch = remote.match(/^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/i);
  if (sshMatch) return `https://github.com/${sshMatch[1]}`;
  return undefined;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function shortSha(value: string): string {
  return value.slice(0, 12);
}

function ArtifactsTab({ cards, project, onFocusCard }: { cards: TimelineCard[]; project?: Project; onFocusCard?: (cardId: string) => void }) {
  const artifacts = cards
    .filter((card) => card.kind === 'fileChange' || card.kind === 'agent' || card.kind === 'plan' || (card.kind === 'command' && (card.stdout || card.stderr)))
    .slice(-12)
    .reverse();
  const [selectedId, setSelectedId] = useState('');
  const selected = artifacts.find((artifact) => artifact.id === selectedId) ?? artifacts[0];
  return (
    <section className="panel grow artifacts-panel">
      <div className="review-pane-header">
        <div>
          <div className="section-title">Artifacts</div>
          <div className="panel-title">Thread outputs</div>
        </div>
        <span className="side-panel-count">{artifacts.length} items</span>
      </div>

      <div className="artifact-preview-card">
        <div className="artifact-icon"><Icon name="panel" size={17} /></div>
        <div>
          <strong>{project?.name ?? 'Project'} output shelf</strong>
          <p>Files, diffs, command logs, and agent summaries from this thread stay here so the timeline remains review-focused.</p>
        </div>
      </div>

      {artifacts.length === 0 ? <div className="empty">No artifacts have been produced in this thread yet.</div> : null}
      {artifacts.length > 0 ? (
        <div className="artifact-workbench">
          <div className="artifact-list">
            {artifacts.map((artifact) => (
              <button key={artifact.id} className={`artifact-file-row ${artifact.id === selected?.id ? 'active' : ''}`} onClick={() => setSelectedId(artifact.id)}>
                <span>
                  <strong>{artifact.filePath ?? artifact.title}</strong>
                  <small>{artifactSubtitle(artifact)}</small>
                </span>
                <code>{artifactKind(artifact)}</code>
              </button>
            ))}
          </div>
          {selected ? (
            <div className="artifact-detail">
              <div className="artifact-detail-head">
                <div>
                  <div className="section-title">{artifactKind(selected)}</div>
                  <div className="panel-title">{selected.filePath ?? selected.title}</div>
                </div>
                <button className="small ghost" onClick={() => onFocusCard?.(selected.id)}>Focus</button>
              </div>
              <FocusedCard card={selected} />
            </div>
          ) : null}
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
    case 'browser': return 'Browser';
    case 'artifacts': return 'Artifacts';
    case 'raw': return 'Raw';
  }
}

function tabTitle(tab: InspectorTab): string {
  if (tab === 'diff') return 'Review changes';
  if (tab === 'files') return 'Project files';
  if (tab === 'git') return 'Git explorer';
  if (tab === 'terminal') return 'Terminal and actions';
  if (tab === 'browser') return 'Browser preview';
  if (tab === 'artifacts') return 'Artifacts and previews';
  if (tab === 'raw') return 'Raw debug';
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

type BrowserTarget = {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  source: string;
  kind: 'local' | 'remote' | 'space';
};

function browserTargets(cards: TimelineCard[], health?: ServerHealth): BrowserTarget[] {
  const seen = new Set<string>();
  const targets: BrowserTarget[] = [];

  const push = (target: BrowserTarget) => {
    if (seen.has(target.url)) return;
    seen.add(target.url);
    targets.push(target);
  };

  if (health?.huggingFace?.publicUrl) {
    push({
      id: `hf:${health.huggingFace.publicUrl}`,
      title: 'Hugging Face Space',
      subtitle: health.huggingFace.spaceId ?? health.huggingFace.spaceHost ?? 'configured Space target',
      url: health.huggingFace.publicUrl,
      source: 'runtime health',
      kind: 'space'
    });
  } else if (health?.huggingFace?.spaceHost) {
    const url = `https://${health.huggingFace.spaceHost}`;
    push({
      id: `hf:${url}`,
      title: 'Hugging Face Space',
      subtitle: health.huggingFace.spaceId ?? health.huggingFace.spaceHost,
      url,
      source: 'runtime health',
      kind: 'space'
    });
  }

  for (const card of [...cards].reverse()) {
    if (card.kind !== 'command') continue;
    for (const url of extractUrls([card.command, card.stdout, card.stderr, card.text].filter(Boolean).join('\n'))) {
      push({
        id: `${card.id}:${url}`,
        title: localUrlLabel(url),
        subtitle: card.command ?? card.title,
        url,
        source: `command ${card.id}`,
        kind: isLocalUrl(url) ? 'local' : 'remote'
      });
    }
  }

  return targets.slice(0, 8);
}

function extractUrls(value: string): string[] {
  const matches = value.match(/\bhttps?:\/\/[^\s<>"'`]+/g) ?? [];
  return matches.map((url) => url.replace(/[),.;\]]+$/, '')).filter((url, index, all) => all.indexOf(url) === index);
}

function isLocalUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\b/i.test(url);
}

function localUrlLabel(url: string): string {
  if (!isLocalUrl(url)) return new URL(url).hostname;
  const parsed = new URL(url);
  return parsed.port ? `Local preview :${parsed.port}` : 'Local preview';
}

function artifactKind(card: TimelineCard): string {
  if (card.kind === 'fileChange') return 'diff';
  if (card.kind === 'command') return 'terminal log';
  if (card.kind === 'plan') return 'plan';
  if (card.kind === 'agent') return 'summary';
  return card.kind;
}

function artifactSubtitle(card: TimelineCard): string {
  if (card.kind === 'fileChange') return diffStats(card.diff).label;
  if (card.kind === 'command') return card.exitCode === null || card.exitCode === undefined ? card.status ?? 'command output' : `exit ${card.exitCode}`;
  return card.status ?? card.kind;
}
