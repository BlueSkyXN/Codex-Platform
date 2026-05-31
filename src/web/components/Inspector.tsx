import { useEffect, useState } from 'react';
import { DiffBlock, type DiffLineSelection } from './DiffBlock.js';
import { Icon, type IconName } from './Icon.js';
import type { AccountSummary, ApprovalDecision, ApprovalRecord, ApprovalRequest, FileReadResult, FileTreeNode, GitDiffResult, GitHubActionsSummary, GitOperationRecord, GitStatusSummary, InspectorTab, Project, RawEventRecord, ServerHealth, ThreadSummary, TimelineCard } from '../../shared/types.js';
import { deriveSupervisionSummary, supervisionStateClass } from '../lib/supervision.js';

const primaryTabs: InspectorTab[] = ['review', 'plan', 'diff', 'files', 'git', 'terminal', 'browser', 'artifacts', 'raw'];

type PendingGitApproval =
  | { kind: 'stage' | 'unstage'; paths: string[] }
  | { kind: 'commit'; message: string; paths: string[] };

type GitReviewFinding = {
  id: string;
  path: string;
  lineNumber: number;
  lineText: string;
  note: string;
  kind: string;
};

type BrowserTarget = {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  source: string;
  cardId?: string;
  capturedAt?: number;
  kind: 'local' | 'remote' | 'space';
};

type ReviewEvidencePacket = {
  browserTargets: BrowserTarget[];
  browserFeedback: string;
  artifacts: TimelineCard[];
  artifactFeedback: string;
};

type PromptHandoff = {
  prompt: string;
  threadId?: string;
  agentName?: string;
};

type EvidenceLoopStep = {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'idle';
};

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
  gitOperations?: GitOperationRecord[];
  githubActions?: GitHubActionsSummary;
  rawEvents?: RawEventRecord[];
  selectedGitPath?: string;
  gitActionBusy?: boolean;
  gitActionMessage?: string;
  projectPanelLoading?: boolean;
  projectPanelError?: string;
  account?: AccountSummary;
  health?: ServerHealth;
  browserFeedback: string;
  artifactFeedback: string;
  tab?: InspectorTab;
  onTabChange?: (tab: InspectorTab) => void;
  onBrowserFeedbackChange: (value: string) => void;
  onArtifactFeedbackChange: (value: string) => void;
  onDecision: (requestId: string | number, decision: ApprovalDecision) => void;
  onRefreshProjectPanels?: () => void;
  onSelectFile?: (path: string) => void;
  onSelectGitFile?: (path: string, cached?: boolean) => void;
  onGitStage?: (paths: string[]) => void;
  onGitUnstage?: (paths: string[]) => void;
  onGitCommit?: (message: string, paths?: string[]) => void;
  onStartReview?: () => void;
  onFocusCard?: (cardId: string) => void;
  onUsePrompt?: (handoff: PromptHandoff) => void;
  open?: boolean;
}) {
  const [internalTab, setInternalTab] = useState<InspectorTab>('review');
  const [reviewFindings, setReviewFindings] = useState<GitReviewFinding[]>([]);
  const activeTab = props.tab ?? internalTab;
  const setActiveTab = props.onTabChange ?? setInternalTab;
  const relatedApproval = props.card?.id ? props.approvals.find((a) => a.itemId === props.card?.id) : undefined;
  const plans = props.cards.filter((card) => card.kind === 'plan' || card.kind === 'reasoning');
  const diffs = props.cards.filter((card) => card.kind === 'fileChange');
  const commands = props.cards.filter((card) => card.kind === 'command');
  const reviewEvidence: ReviewEvidencePacket = {
    browserTargets: browserTargets(props.cards, props.health),
    browserFeedback: props.browserFeedback,
    artifacts: artifactCards(props.cards),
    artifactFeedback: props.artifactFeedback
  };

  useEffect(() => {
    setReviewFindings([]);
  }, [props.project?.id, props.thread?.id]);

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
          <button
            key={item}
            className={`tab ${activeTab === item ? 'active' : ''}`}
            onClick={() => setActiveTab(item)}
            title={tabTitle(item)}
            aria-label={tabTitle(item)}
          >
            <Icon name={tabIcon(item)} size={13} />
            <span>{tabShortLabel(item)}</span>
          </button>
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
          operations={props.gitOperations ?? []}
          githubActions={props.githubActions}
          health={props.health}
          reviewEvidence={reviewEvidence}
          reviewFindings={reviewFindings}
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
          onAddReviewFinding={(finding) => setReviewFindings((items) => [finding, ...items].slice(0, 12))}
          onRemoveReviewFinding={(id) => setReviewFindings((items) => items.filter((item) => item.id !== id))}
          onUsePrompt={props.onUsePrompt}
        />
      ) : null}
      {activeTab === 'terminal' ? <TerminalTab commands={commands} focusedCard={props.card} onFocusCard={props.onFocusCard} /> : null}
      {activeTab === 'browser' ? <BrowserTab cards={props.cards} project={props.project} health={props.health} feedback={props.browserFeedback} onFeedbackChange={props.onBrowserFeedbackChange} onFocusCard={props.onFocusCard} onUsePrompt={props.onUsePrompt} /> : null}
      {activeTab === 'artifacts' ? <ArtifactsTab cards={props.cards} project={props.project} feedback={props.artifactFeedback} onFeedbackChange={props.onArtifactFeedbackChange} onFocusCard={props.onFocusCard} onUsePrompt={props.onUsePrompt} /> : null}
      {activeTab === 'raw' ? <RawTab card={props.card} thread={props.thread} project={props.project} rawEvents={props.rawEvents ?? []} /> : null}
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

function BrowserTab({
  cards,
  project,
  health,
  feedback,
  onFeedbackChange,
  onFocusCard,
  onUsePrompt
}: {
  cards: TimelineCard[];
  project?: Project;
  health?: ServerHealth;
  feedback: string;
  onFeedbackChange: (value: string) => void;
  onFocusCard?: (cardId: string) => void;
  onUsePrompt?: (handoff: PromptHandoff) => void;
}) {
  const [selectedUrl, setSelectedUrl] = useState('');
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const targets = browserTargets(cards, health);
  const activeTarget = targets.find((target) => target.url === selectedUrl) ?? targets[0];
  const evidence = browserEvidence(activeTarget, health);
  const feedbackPrompt = browserFeedbackPrompt({ target: activeTarget, project, health, feedback });
  const loopSteps = browserLoopSteps(activeTarget, feedback, health);

  async function copyFeedbackPrompt() {
    if (!feedbackPrompt) return;
    await copyText(feedbackPrompt);
    setCopiedFeedback(true);
    window.setTimeout(() => setCopiedFeedback(false), 1800);
  }

  function handOffFeedbackPrompt() {
    if (!feedbackPrompt) return;
    onUsePrompt?.({
      prompt: feedbackPrompt,
      threadId: activeTarget?.cardId ? cards.find((card) => card.id === activeTarget.cardId)?.threadId : undefined,
      agentName: 'worker'
    });
  }

  return (
    <section className="panel grow browser-panel">
      <div className="review-pane-header">
        <div>
          <div className="section-title">Browser</div>
          <div className="panel-title">Preview surface</div>
        </div>
        <div className="browser-head-actions">
          {activeTarget?.cardId && onFocusCard ? <button className="small ghost" onClick={() => onFocusCard(activeTarget.cardId!)}>Source</button> : null}
          {activeTarget ? <a className="small browser-open-link" href={activeTarget.url} target="_blank" rel="noreferrer">Open</a> : null}
        </div>
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

      <div className="browser-evidence-card">
        <div className="browser-evidence-head">
          <div>
            <strong>Runtime evidence</strong>
            <span>{activeTarget ? activeTarget.source : 'No preview target selected'}</span>
          </div>
          {activeTarget?.kind === 'space' ? <a href={`${activeTarget.url.replace(/\/$/, '')}/healthz`} target="_blank" rel="noreferrer">healthz</a> : null}
        </div>
        <div className="browser-evidence-grid">
          {evidence.map((item) => (
            <div key={item.label} className={`browser-evidence-item ${item.state ?? ''}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
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
              <code>{target.cardId ? `${target.kind} · card` : target.kind}</code>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          No browser preview URL has been captured yet. Start a dev server from a thread; localhost or HTTPS URLs printed by commands will appear here.
        </div>
      )}

      <div className="browser-feedback-card">
        <div>
          <strong>Feedback loop</strong>
          <span>Observation notes become the next verification task.</span>
        </div>
        <textarea
          value={feedback}
          onChange={(event) => onFeedbackChange(event.target.value)}
          placeholder="Example: the mobile toolbar overlaps the preview; tighten spacing and verify at 390px."
          rows={3}
        />
        <EvidenceLoopStrip
          title="Browser evidence loop"
          steps={loopSteps}
          summary={activeTarget ? 'Target URL, runtime evidence, and notes are included.' : 'Capture or select a preview target first.'}
          onHandOff={handOffFeedbackPrompt}
          handoffDisabled={!activeTarget || !feedbackPrompt || !onUsePrompt}
          onCopy={() => void copyFeedbackPrompt()}
          copyDisabled={!activeTarget || !feedbackPrompt}
          copied={copiedFeedback}
        />
      </div>

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

function EvidenceLoopStrip(props: {
  title: string;
  steps: EvidenceLoopStep[];
  summary: string;
  onHandOff: () => void;
  handoffDisabled?: boolean;
  onCopy: () => void;
  copyDisabled?: boolean;
  copied?: boolean;
}) {
  return (
    <div className="evidence-loop-strip">
      <div className="evidence-loop-head">
        <span className="evidence-loop-icon"><Icon name="spark" size={14} /></span>
        <div>
          <strong>{props.title}</strong>
          <span>{props.summary}</span>
        </div>
      </div>
      <div className="evidence-loop-steps">
        {props.steps.map((step) => (
          <div key={step.label} className={`evidence-loop-step ${step.tone ?? ''}`}>
            <span>{step.label}</span>
            <strong>{step.value}</strong>
          </div>
        ))}
      </div>
      <div className="evidence-loop-actions">
        <button
          className="mini-action primary-mini"
          disabled={props.handoffDisabled}
          onClick={props.onHandOff}
          aria-label={`Hand off ${props.title} to composer`}
        >
          Hand off
        </button>
        <button className="mini-action" disabled={props.copyDisabled} onClick={props.onCopy}>
          {props.copied ? 'Copied' : 'Copy prompt'}
        </button>
      </div>
    </div>
  );
}

function browserLoopSteps(activeTarget: BrowserTarget | undefined, feedback: string, health?: ServerHealth): EvidenceLoopStep[] {
  const notesReady = feedback.trim().length > 0;
  const runtimeState = health ? (health.ready ? 'ready' : health.ok ? 'starting' : 'unhealthy') : 'unknown';
  const verify = activeTarget
    ? activeTarget.kind === 'space'
      ? 'HF smoke + responsive preview'
      : 'desktop/mobile preview'
    : 'select target';
  return [
    {
      label: 'Target',
      value: activeTarget ? `${activeTarget.title} · ${targetKindLabel(activeTarget.kind)}` : 'none',
      tone: activeTarget ? 'ok' : 'idle'
    },
    {
      label: 'Notes',
      value: notesReady ? 'recorded' : 'empty',
      tone: notesReady ? 'ok' : 'warn'
    },
    {
      label: 'Owner',
      value: '#worker',
      tone: activeTarget ? 'ok' : 'idle'
    },
    {
      label: 'Verify',
      value: `${runtimeState} · ${verify}`,
      tone: activeTarget ? 'ok' : 'idle'
    }
  ];
}

function browserEvidence(activeTarget: BrowserTarget | undefined, health?: ServerHealth): Array<{ label: string; value: string; state?: 'ok' | 'warn' | 'idle' }> {
  return [
    {
      label: 'Target',
      value: activeTarget ? targetKindLabel(activeTarget.kind) : 'none',
      state: activeTarget ? 'ok' : 'idle'
    },
    {
      label: 'Ready',
      value: health ? (health.ready ? 'ready' : health.ok ? 'starting' : 'unhealthy') : 'unknown',
      state: health?.ready ? 'ok' : health ? 'warn' : 'idle'
    },
    {
      label: 'Build',
      value: health?.build?.sha ? shortSha(health.build.sha) : 'unversioned',
      state: health?.build?.sha ? 'ok' : 'idle'
    },
    {
      label: 'Space',
      value: health?.huggingFace?.enabled ? health.huggingFace.spaceId ?? health.huggingFace.spaceHost ?? 'configured' : 'local',
      state: health?.huggingFace?.enabled ? 'ok' : 'idle'
    }
  ];
}

function browserFeedbackPrompt(input: { target?: BrowserTarget; project?: Project; health?: ServerHealth; feedback: string }): string | undefined {
  if (!input.target) return undefined;
  const lines = [
    'Review this browser preview and improve the implementation.',
    '',
    'Recommended owner: #worker for implementation follow-up after inspecting the preview evidence.',
    '',
    `Project: ${input.project?.name ?? 'current project'}`,
    `Target: ${input.target.url}`,
    `Target kind: ${targetKindLabel(input.target.kind)}`,
    `Source: ${input.target.source}`,
    input.target.capturedAt ? `Captured: ${formatTime(input.target.capturedAt)}` : undefined,
    input.health?.build?.sha ? `Runtime build: ${input.health.build.sha}` : undefined,
    '',
    'Observed feedback:',
    input.feedback.trim() || '- Describe the visible issue, missing state, or expected behavior here.',
    '',
    'Please inspect the relevant code, implement the smallest complete fix, and verify the result in the browser preview across desktop and mobile widths.'
  ];
  return lines.filter(Boolean).join('\n');
}

function targetKindLabel(kind: BrowserTarget['kind']): string {
  if (kind === 'space') return 'HF Space';
  if (kind === 'local') return 'local';
  return 'remote';
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

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back to the legacy selection path below.
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}

function GitTab(props: {
  status?: GitStatusSummary;
  diff?: GitDiffResult;
  operations: GitOperationRecord[];
  githubActions?: GitHubActionsSummary;
  health?: ServerHealth;
  reviewEvidence: ReviewEvidencePacket;
  reviewFindings: GitReviewFinding[];
  selectedPath?: string;
  loading: boolean;
  actionBusy: boolean;
  actionMessage?: string;
  error?: string;
  onRefresh?: () => void;
  onSelectFile?: (path: string, cached?: boolean) => void;
  onStage?: (paths: string[]) => void;
  onUnstage?: (paths: string[]) => void;
  onCommit?: (message: string, paths?: string[]) => void;
  onAddReviewFinding: (finding: GitReviewFinding) => void;
  onRemoveReviewFinding: (id: string) => void;
  onUsePrompt?: (handoff: PromptHandoff) => void;
}) {
  const [commitMessage, setCommitMessage] = useState('');
  const [copiedPush, setCopiedPush] = useState(false);
  const [copiedPr, setCopiedPr] = useState(false);
  const [copiedReviewBrief, setCopiedReviewBrief] = useState(false);
  const [copiedReviewPrompt, setCopiedReviewPrompt] = useState(false);
  const [copiedPrBody, setCopiedPrBody] = useState(false);
  const [copiedNextReview, setCopiedNextReview] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingGitApproval | undefined>();
  const [selectedReviewLine, setSelectedReviewLine] = useState<DiffLineSelection | undefined>();
  const [reviewNote, setReviewNote] = useState('');
  const reviewFindings = props.reviewFindings;
  const status = props.status;
  const grouped = groupGitFiles(status?.files ?? []);
  const files = status?.files ?? [];
  const stageablePaths = files.filter(canStageFile).map((file) => file.path);
  const stagedPaths = files.filter(canUnstageFile).map((file) => file.path);
  const hasStagedChanges = stagedPaths.length > 0;
  const shipInfo = status?.isRepo ? gitShipInfo(status) : undefined;
  const releaseInfo = status?.isRepo ? gitReleaseInfo(status, props.health, props.githubActions) : undefined;
  const draftMessage = draftCommitMessage(files);
  const reviewBrief = status?.isRepo ? gitReviewBrief(status, props.githubActions, props.health, draftMessage, reviewFindings, props.reviewEvidence) : undefined;
  const reviewPrompt = status?.isRepo ? gitReviewPrompt(status, reviewFindings, draftMessage) : undefined;
  const prBody = status?.isRepo ? gitPrBody(status, props.githubActions, props.health, draftMessage, reviewFindings, props.reviewEvidence, shipInfo?.prNote, releaseInfo?.detail) : undefined;
  const closureSteps = status?.isRepo && shipInfo && releaseInfo ? gitClosureSteps({
    status,
    stageablePaths,
    stagedPaths,
    draftMessage,
    reviewFindings,
    shipInfo,
    releaseInfo
  }) : [];
  const nextReviewItem = status?.isRepo && shipInfo && releaseInfo && reviewBrief ? gitReviewQueueItem({
    status,
    stageablePaths,
    stagedPaths,
    draftMessage,
    reviewFindings,
    shipInfo,
    releaseInfo,
    reviewBrief,
    prBody,
    evidence: props.reviewEvidence
  }) : undefined;

  async function copyPushCommand(command?: string) {
    if (!command) return;
    await copyText(command);
    setCopiedPush(true);
    window.setTimeout(() => setCopiedPush(false), 1800);
  }

  async function copyPrCommand(command?: string) {
    if (!command) return;
    await copyText(command);
    setCopiedPr(true);
    window.setTimeout(() => setCopiedPr(false), 1800);
  }

  async function copyReviewBrief() {
    if (!reviewBrief) return;
    await copyText(reviewBrief);
    setCopiedReviewBrief(true);
    window.setTimeout(() => setCopiedReviewBrief(false), 1800);
  }

  async function copyReviewPrompt() {
    if (!reviewPrompt || reviewFindings.length === 0) return;
    await copyText(reviewPrompt);
    setCopiedReviewPrompt(true);
    window.setTimeout(() => setCopiedReviewPrompt(false), 1800);
  }

  async function copyPrBody() {
    if (!prBody) return;
    await copyText(prBody);
    setCopiedPrBody(true);
    window.setTimeout(() => setCopiedPrBody(false), 1800);
  }

  async function copyNextReviewPrompt() {
    if (!nextReviewItem) return;
    await copyText(nextReviewItem.prompt);
    setCopiedNextReview(true);
    window.setTimeout(() => setCopiedNextReview(false), 1800);
  }

  function handOffReviewPackage() {
    if (!reviewBrief) return;
    props.onUsePrompt?.({
      prompt: gitReviewHandoffPrompt(reviewBrief, prBody, reviewFindings.length),
      agentName: reviewFindings.length > 0 ? 'worker' : 'explorer'
    });
  }

  function handOffNextReview() {
    if (!nextReviewItem) return;
    props.onUsePrompt?.({
      prompt: nextReviewItem.prompt,
      agentName: nextReviewItem.agentName
    });
  }

  function requestGitApproval(next: PendingGitApproval) {
    setPendingApproval(next);
  }

  function cancelGitApproval() {
    setPendingApproval(undefined);
  }

  function approveGitAction() {
    if (!pendingApproval) return;
    if (pendingApproval.kind === 'commit') {
      props.onCommit?.(pendingApproval.message, pendingApproval.paths);
      setCommitMessage('');
    } else if (pendingApproval.kind === 'stage') {
      props.onStage?.(pendingApproval.paths);
    } else {
      props.onUnstage?.(pendingApproval.paths);
    }
    setPendingApproval(undefined);
  }

  function selectReviewLine(line: DiffLineSelection) {
    setSelectedReviewLine(line);
    setReviewNote('');
  }

  function selectGitFileFromPanel(path: string, cached = false) {
    setSelectedReviewLine(undefined);
    setReviewNote('');
    props.onSelectFile?.(path, cached);
  }

  function addReviewFinding() {
    if (!selectedReviewLine) return;
    const path = props.diff?.path ?? props.selectedPath ?? 'selected diff';
    const note = reviewNote.trim() || 'Review this line before committing.';
    props.onAddReviewFinding({
      id: `finding_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      path,
      lineNumber: selectedReviewLine.lineNumber,
      lineText: selectedReviewLine.text,
      note,
      kind: selectedReviewLine.kind
    });
    setSelectedReviewLine(undefined);
    setReviewNote('');
  }

  function removeReviewFinding(id: string) {
    props.onRemoveReviewFinding(id);
  }

  function openNextReviewItem() {
    const target = nextReviewItem?.openTarget;
    if (!target) return;
    if (target.kind === 'file') {
      selectGitFileFromPanel(target.path, Boolean(target.cached));
    } else if (target.kind === 'draft') {
      setCommitMessage(draftMessage);
    } else {
      window.open(target.url, '_blank', 'noopener,noreferrer');
    }
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
            <div><span>Default</span><strong>{status.defaultBranch ?? '—'}</strong></div>
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
                <ShipCheck label="PR base" value={shipInfo.prMode === 'unavailable' ? 'unavailable' : `${shipInfo.prBaseBranch ?? 'main'} · ${baseBranchCheckLabel(shipInfo.prBaseSource)}`} detail={shipInfo.prMode === 'unavailable' ? undefined : baseBranchSourceLabel(shipInfo.prBaseSource)} state={shipInfo.prMode === 'unavailable' ? 'idle' : 'ok'} />
              </div>
              {shipInfo.pushCommand ? (
                <div className="git-push-command">
                  <code>{shipInfo.pushCommand}</code>
                  <button className="mini-action" onClick={() => void copyPushCommand(shipInfo.pushCommand)}>{copiedPush ? 'Copied' : 'Copy'}</button>
                </div>
              ) : null}
              {shipInfo.prCommand ? (
                <div className="git-push-command">
                  <code>{shipInfo.prCommand}</code>
                  <button className="mini-action" onClick={() => void copyPrCommand(shipInfo.prCommand)}>{copiedPr ? 'Copied' : 'Copy PR'}</button>
                </div>
              ) : null}
              <div className="git-pr-note">{shipInfo.prNote}</div>
              <div className="git-ship-links">
                {shipInfo.compareUrl && !shipInfo.prUrl ? <a href={shipInfo.compareUrl} target="_blank" rel="noreferrer">{shipInfo.prMode === 'direct' ? 'Open commits' : 'Open compare'}</a> : null}
                {shipInfo.prUrl ? <a href={shipInfo.prUrl} target="_blank" rel="noreferrer">Open PR draft</a> : null}
                {shipInfo.repoUrl ? <a href={shipInfo.repoUrl} target="_blank" rel="noreferrer">Open repo</a> : null}
              </div>
            </div>
          ) : null}
          {releaseInfo ? (
            <div className="git-ship-card git-release-card">
              <div className="git-ship-head">
                <div>
                  <strong>Deployment evidence</strong>
                  <span>{releaseInfo.detail}</span>
                </div>
                <span className={`ship-state ${releaseInfo.state}`}>{releaseInfo.label}</span>
              </div>
              <div className="git-ship-checks">
                {releaseInfo.checks.map((check) => <ShipCheck key={check.label} label={check.label} value={check.value} state={check.state} />)}
              </div>
              <div className="git-ship-links">
                {releaseInfo.actionsUrl ? <a href={releaseInfo.actionsUrl} target="_blank" rel="noreferrer">Open Actions</a> : null}
                {releaseInfo.healthUrl ? <a href={releaseInfo.healthUrl} target="_blank" rel="noreferrer">Open healthz</a> : null}
              </div>
            </div>
          ) : null}
          <div className="git-review-card">
            <div className="git-review-head">
              <div>
                <strong>Review package</strong>
                <span>Stage intentionally, draft the commit, then copy a PR handoff when ready.</span>
              </div>
              <div className="git-review-actions">
                <button className="mini-action primary-mini" disabled={!reviewBrief || !props.onUsePrompt} onClick={handOffReviewPackage} aria-label="Hand off Git review package to composer">Hand off</button>
                <button className="mini-action" disabled={!reviewBrief} onClick={() => void copyReviewBrief()}>{copiedReviewBrief ? 'Copied' : 'Copy brief'}</button>
                <button className="mini-action" disabled={!prBody} onClick={() => void copyPrBody()}>{copiedPrBody ? 'Copied' : 'Copy PR body'}</button>
                <button className="mini-action" disabled={reviewFindings.length === 0 || !reviewPrompt} onClick={() => void copyReviewPrompt()}>{copiedReviewPrompt ? 'Copied' : 'Copy follow-up'}</button>
              </div>
            </div>
            {closureSteps.length > 0 ? (
              <div className="git-closure-steps" aria-label="Review closure steps">
                {closureSteps.map((step, index) => <GitClosureStep key={step.label} step={step} index={index + 1} />)}
              </div>
            ) : null}
            {nextReviewItem ? (
              <GitReviewQueueCard
                item={nextReviewItem}
                onOpen={openNextReviewItem}
                openDisabled={!nextReviewItem.openTarget}
                onHandoff={handOffNextReview}
                handoffDisabled={!props.onUsePrompt}
                onCopy={() => void copyNextReviewPrompt()}
                copied={copiedNextReview}
              />
            ) : null}
            <div className="git-review-queues">
              <button disabled={stageablePaths.length === 0 || !props.onSelectFile} onClick={() => selectGitFileFromPanel(stageablePaths[0], false)}>
                <span>Unstaged</span>
                <strong>{stageablePaths.length}</strong>
              </button>
              <button disabled={stagedPaths.length === 0 || !props.onSelectFile} onClick={() => selectGitFileFromPanel(stagedPaths[0], true)}>
                <span>Staged</span>
                <strong>{stagedPaths.length}</strong>
              </button>
              <button disabled={!draftMessage} onClick={() => setCommitMessage(draftMessage)}>
                <span>Commit draft</span>
                <strong>{draftMessage ? 'ready' : 'empty'}</strong>
              </button>
              <button disabled={reviewFindings.length === 0}>
                <span>Findings</span>
                <strong>{reviewFindings.length}</strong>
              </button>
            </div>
            <div className="git-review-hint">
              Evidence packet includes {props.reviewEvidence.browserTargets.length} browser target{props.reviewEvidence.browserTargets.length === 1 ? '' : 's'}, {props.reviewEvidence.artifacts.length} artifact{props.reviewEvidence.artifacts.length === 1 ? '' : 's'}
              {props.reviewEvidence.browserFeedback.trim() || props.reviewEvidence.artifactFeedback.trim() ? ', and saved observation notes.' : '.'}
            </div>
            {draftMessage ? <code className="git-draft-message">{draftMessage}</code> : null}
            {reviewFindings.length > 0 ? (
              <div className="git-finding-list">
                {reviewFindings.map((finding) => (
                  <article key={finding.id} className={`git-finding ${finding.kind}`}>
                    <span>
                      <strong>{finding.path}:{finding.lineNumber}</strong>
                      <small>{finding.note}</small>
                      <code>{finding.lineText || ' '}</code>
                    </span>
                    <button className="mini-action" onClick={() => removeReviewFinding(finding.id)}>Remove</button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="git-review-hint">Use the plus icon beside a diff line to capture review findings before commit or PR handoff.</div>
            )}
          </div>
          {pendingApproval ? (
            <GitApprovalCard
              approval={pendingApproval}
              busy={props.actionBusy}
              onApprove={approveGitAction}
              onCancel={cancelGitApproval}
            />
          ) : null}
          <div className="git-action-bar">
            <button className="small ghost" disabled={props.actionBusy || stageablePaths.length === 0 || !props.onStage} onClick={() => requestGitApproval({ kind: 'stage', paths: stageablePaths })}>Stage all</button>
            <button className="small ghost" disabled={props.actionBusy || stagedPaths.length === 0 || !props.onUnstage} onClick={() => requestGitApproval({ kind: 'unstage', paths: stagedPaths })}>Unstage all</button>
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
                  <button className="git-file-main" onClick={() => selectGitFileFromPanel(file.path, canUnstageFile(file) && !canStageFile(file))}>{file.path}</button>
                  <span className="git-row-actions">
                    {canStageFile(file) ? <button className="mini-action" disabled={props.actionBusy || !props.onStage} onClick={() => requestGitApproval({ kind: 'stage', paths: [file.path] })}>Stage</button> : null}
                    {canUnstageFile(file) ? <button className="mini-action" disabled={props.actionBusy || !props.onUnstage} onClick={() => requestGitApproval({ kind: 'unstage', paths: [file.path] })}>Unstage</button> : null}
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
            {!props.loading && props.diff?.diff ? <DiffBlock diff={props.diff.diff} activeLine={selectedReviewLine?.lineNumber} onSelectLine={selectReviewLine} /> : null}
            {!props.loading && props.selectedPath && !props.diff?.diff ? <div className="empty">No diff available for the selected file.</div> : null}
            {!props.selectedPath ? <div className="empty">Select a changed file to preview its diff.</div> : null}
          </div>
          {selectedReviewLine ? (
            <div className="git-inline-review-card">
              <div>
                <div className="section-title">Inline review finding</div>
                <strong>{props.diff?.path ?? props.selectedPath ?? 'Selected diff'}:{selectedReviewLine.lineNumber}</strong>
              </div>
              <code>{selectedReviewLine.text || ' '}</code>
              <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="What should be fixed, verified, or mentioned in review?" rows={3} />
              <div className="approval-actions">
                <button className="primary" onClick={addReviewFinding}>Add finding</button>
                <button onClick={() => { setSelectedReviewLine(undefined); setReviewNote(''); }}>Cancel</button>
              </div>
            </div>
          ) : null}
          <div className="git-commit-box">
            <div>
              <div className="section-title">Commit</div>
              <div className="subtle">Commits staged changes in the active project. Use readiness checks above before push or PR.</div>
            </div>
            <textarea value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder="Commit message" rows={3} />
            <button className="small primary" disabled={props.actionBusy || !hasStagedChanges || !commitMessage.trim() || !props.onCommit} onClick={() => requestGitApproval({ kind: 'commit', message: commitMessage.trim(), paths: stagedPaths })}>
              {props.actionBusy ? 'Working...' : 'Request commit approval'}
            </button>
          </div>
          <GitOperationHistory operations={props.operations} />
        </>
      ) : null}
    </section>
  );
}

function GitApprovalCard(props: {
  approval: PendingGitApproval;
  busy: boolean;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const title = props.approval.kind === 'commit'
    ? 'Commit staged changes'
    : props.approval.kind === 'stage'
      ? 'Stage files'
      : 'Unstage files';
  const command = props.approval.kind === 'commit'
    ? `git commit -m ${shellQuote(props.approval.message)}`
    : props.approval.kind === 'stage'
      ? `git add -- ${props.approval.paths.map(shellQuote).join(' ')}`
      : `git restore --staged -- ${props.approval.paths.map(shellQuote).join(' ')}`;
  const detail = props.approval.kind === 'commit'
    ? `${props.approval.paths.length} staged file${props.approval.paths.length === 1 ? '' : 's'} will be committed.`
    : `${props.approval.paths.length} file${props.approval.paths.length === 1 ? '' : 's'} will change staged state.`;

  return (
    <div className="git-approval-card">
      <div>
        <div className="section-title">Git approval required</div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <pre className="approval-command">{command}</pre>
      <div className="git-approval-paths">
        {props.approval.paths.slice(0, 6).map((path) => <code key={path}>{path}</code>)}
        {props.approval.paths.length > 6 ? <span>{props.approval.paths.length - 6} more</span> : null}
      </div>
      <div className="approval-actions">
        <button className="primary" disabled={props.busy} onClick={props.onApprove}>{props.busy ? 'Working...' : 'Approve and run'}</button>
        <button disabled={props.busy} onClick={props.onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function GitOperationHistory({ operations }: { operations: GitOperationRecord[] }) {
  return (
    <div className="git-operation-history">
      <div className="section-title">Git operation history</div>
      {operations.length === 0 ? <div className="empty-inline">No Git actions recorded yet.</div> : null}
      {operations.slice(0, 5).map((operation) => (
        <article key={operation.id} className={`git-operation-row ${operation.status}`}>
          <span className="event-kind"><Icon name={operation.status === 'completed' ? 'check' : 'close'} size={13} /></span>
          <span>
            <strong>{operation.title}</strong>
            <small>{operation.detail ?? operation.kind}{operation.branch ? ` · ${operation.branch}` : ''}</small>
          </span>
          <code>{formatTime(operation.createdAt)}</code>
        </article>
      ))}
    </div>
  );
}

function ShipCheck(props: { label: string; value: string; detail?: string; state: 'ok' | 'warn' | 'idle' }) {
  return (
    <div className="ship-check">
      <span>{props.label}</span>
      <strong className={props.state} title={props.detail ?? props.value}>{props.value}</strong>
    </div>
  );
}

type GitClosureStepModel = {
  label: string;
  value: string;
  state: 'ok' | 'warn' | 'idle';
};

type GitReviewQueueItem = {
  id: 'sync' | 'findings' | 'unstaged' | 'staged' | 'push' | 'release' | 'synced';
  title: string;
  detail: string;
  owner: '#explorer' | '#worker';
  state: 'attention' | 'ready' | 'waiting';
  metricLabel: string;
  metricValue: string;
  prompt: string;
  agentName: 'explorer' | 'worker';
  openLabel: string;
  openTarget?: { kind: 'file'; path: string; cached?: boolean } | { kind: 'draft' } | { kind: 'url'; url: string };
};

function GitClosureStep({ step, index }: { step: GitClosureStepModel; index: number }) {
  return (
    <div className={`git-closure-step ${step.state}`}>
      <span className="git-closure-index">{index}</span>
      <span className="git-closure-copy">
        <strong>{step.label}</strong>
        <small>{step.value}</small>
      </span>
    </div>
  );
}

function GitReviewQueueCard(props: {
  item: GitReviewQueueItem;
  onOpen: () => void;
  openDisabled?: boolean;
  onHandoff: () => void;
  handoffDisabled?: boolean;
  onCopy: () => void;
  copied?: boolean;
}) {
  return (
    <div className={`git-review-next ${props.item.state}`}>
      <div className="git-review-next-head">
        <span className="git-review-next-icon"><Icon name={props.item.state === 'attention' ? 'inbox' : 'branch'} size={14} /></span>
        <span>
          <strong>{props.item.title}</strong>
          <small>{props.item.detail}</small>
        </span>
        <code>{props.item.owner}</code>
      </div>
      <div className="git-review-next-meta">
        <span>{props.item.metricLabel}</span>
        <strong>{props.item.metricValue}</strong>
        <span>State</span>
        <strong>{props.item.state}</strong>
      </div>
      <div className="git-review-next-actions">
        <button className="mini-action" disabled={props.openDisabled} onClick={props.onOpen}>{props.item.openLabel}</button>
        <button className="mini-action primary-mini" disabled={props.handoffDisabled} onClick={props.onHandoff} aria-label="Hand off next Git review queue item to composer">Hand off next</button>
        <button className="mini-action" onClick={props.onCopy}>{props.copied ? 'Copied' : 'Copy prompt'}</button>
      </div>
    </div>
  );
}

function gitClosureSteps(input: {
  status: GitStatusSummary;
  stageablePaths: string[];
  stagedPaths: string[];
  draftMessage: string;
  reviewFindings: GitReviewFinding[];
  shipInfo: ReturnType<typeof gitShipInfo>;
  releaseInfo: ReturnType<typeof gitReleaseInfo>;
}): GitClosureStepModel[] {
  const changedCount = input.status.files.length;
  return [
    {
      label: 'Diff scope',
      value: changedCount === 0 ? 'working tree clean' : `${input.stagedPaths.length} staged · ${input.stageablePaths.length} unstaged`,
      state: changedCount === 0 || input.stagedPaths.length > 0 ? 'ok' : 'warn'
    },
    {
      label: 'Review findings',
      value: input.reviewFindings.length === 0 ? 'none captured' : `${input.reviewFindings.length} open`,
      state: input.reviewFindings.length === 0 ? 'idle' : 'warn'
    },
    {
      label: 'Commit draft',
      value: input.draftMessage || 'stage files to draft',
      state: input.draftMessage ? 'ok' : 'idle'
    },
    {
      label: 'Push / PR',
      value: input.shipInfo.label,
      state: input.shipInfo.state === 'ready' ? 'ok' : 'warn'
    },
    {
      label: 'Release verify',
      value: input.releaseInfo.label,
      state: input.releaseInfo.state === 'ready' ? 'ok' : input.releaseInfo.state === 'blocked' ? 'warn' : 'idle'
    }
  ];
}

function gitReviewQueueItem(input: {
  status: GitStatusSummary;
  stageablePaths: string[];
  stagedPaths: string[];
  draftMessage: string;
  reviewFindings: GitReviewFinding[];
  shipInfo: ReturnType<typeof gitShipInfo>;
  releaseInfo: ReturnType<typeof gitReleaseInfo>;
  reviewBrief: string;
  prBody?: string;
  evidence: ReviewEvidencePacket;
}): GitReviewQueueItem {
  const firstFinding = input.reviewFindings[0];
  const firstUnstaged = input.stageablePaths[0];
  const firstStaged = input.stagedPaths[0];
  const base = {
    reviewBrief: input.reviewBrief,
    prBody: input.prBody,
    evidence: input.evidence
  };

  if ((input.status.behind ?? 0) > 0) {
    return gitReviewQueueModel({
      id: 'sync',
      title: 'Sync before review',
      detail: `Branch is behind upstream by ${input.status.behind ?? 0}.`,
      owner: '#explorer',
      state: 'attention',
      metricLabel: 'Behind',
      metricValue: String(input.status.behind ?? 0),
      agentName: 'explorer',
      openLabel: 'Open repo',
      openTarget: input.shipInfo.repoUrl ? { kind: 'url', url: input.shipInfo.repoUrl } : undefined,
      ...base
    });
  }

  if (firstFinding) {
    return gitReviewQueueModel({
      id: 'findings',
      title: 'Resolve review findings',
      detail: `${input.reviewFindings.length} captured finding${input.reviewFindings.length === 1 ? '' : 's'} before commit.`,
      owner: '#worker',
      state: 'attention',
      metricLabel: 'Findings',
      metricValue: String(input.reviewFindings.length),
      agentName: 'worker',
      openLabel: 'Open finding',
      openTarget: { kind: 'file', path: firstFinding.path, cached: false },
      ...base
    });
  }

  if (firstUnstaged) {
    return gitReviewQueueModel({
      id: 'unstaged',
      title: 'Review unstaged diff',
      detail: `${input.stageablePaths.length} unstaged path${input.stageablePaths.length === 1 ? '' : 's'} need scope review.`,
      owner: '#explorer',
      state: 'attention',
      metricLabel: 'Unstaged',
      metricValue: String(input.stageablePaths.length),
      agentName: 'explorer',
      openLabel: 'Open diff',
      openTarget: { kind: 'file', path: firstUnstaged, cached: false },
      ...base
    });
  }

  if (firstStaged) {
    return gitReviewQueueModel({
      id: 'staged',
      title: 'Review staged package',
      detail: input.draftMessage || `${input.stagedPaths.length} staged path${input.stagedPaths.length === 1 ? '' : 's'} ready for review.`,
      owner: '#explorer',
      state: 'ready',
      metricLabel: 'Staged',
      metricValue: String(input.stagedPaths.length),
      agentName: 'explorer',
      openLabel: 'Open staged',
      openTarget: { kind: 'file', path: firstStaged, cached: true },
      ...base
    });
  }

  if ((input.status.ahead ?? 0) > 0) {
    return gitReviewQueueModel({
      id: 'push',
      title: 'Push and PR verification',
      detail: input.shipInfo.prNote,
      owner: '#worker',
      state: 'ready',
      metricLabel: 'Ahead',
      metricValue: String(input.status.ahead ?? 0),
      agentName: 'worker',
      openLabel: input.shipInfo.compareUrl ? 'Open compare' : 'Open repo',
      openTarget: input.shipInfo.compareUrl ? { kind: 'url', url: input.shipInfo.compareUrl } : input.shipInfo.repoUrl ? { kind: 'url', url: input.shipInfo.repoUrl } : undefined,
      ...base
    });
  }

  if (input.releaseInfo.state !== 'ready') {
    return gitReviewQueueModel({
      id: 'release',
      title: 'Verify release evidence',
      detail: input.releaseInfo.detail,
      owner: '#explorer',
      state: input.releaseInfo.state === 'blocked' ? 'attention' : 'waiting',
      metricLabel: 'Release',
      metricValue: input.releaseInfo.label,
      agentName: 'explorer',
      openLabel: input.releaseInfo.actionsUrl ? 'Open Actions' : input.releaseInfo.healthUrl ? 'Open healthz' : 'Open repo',
      openTarget: input.releaseInfo.actionsUrl
        ? { kind: 'url', url: input.releaseInfo.actionsUrl }
        : input.releaseInfo.healthUrl
          ? { kind: 'url', url: input.releaseInfo.healthUrl }
          : input.shipInfo.repoUrl
            ? { kind: 'url', url: input.shipInfo.repoUrl }
            : undefined,
      ...base
    });
  }

  return gitReviewQueueModel({
    id: 'synced',
    title: 'Ready for release readback',
    detail: 'Working tree, upstream, Actions, and runtime evidence are aligned.',
    owner: '#explorer',
    state: 'ready',
    metricLabel: 'Release',
    metricValue: input.releaseInfo.label,
    agentName: 'explorer',
    openLabel: input.releaseInfo.healthUrl ? 'Open healthz' : 'Open repo',
    openTarget: input.releaseInfo.healthUrl ? { kind: 'url', url: input.releaseInfo.healthUrl } : input.shipInfo.repoUrl ? { kind: 'url', url: input.shipInfo.repoUrl } : undefined,
    ...base
  });
}

function gitReviewQueueModel(input: Omit<GitReviewQueueItem, 'prompt'> & {
  reviewBrief: string;
  prBody?: string;
  evidence: ReviewEvidencePacket;
}): GitReviewQueueItem {
  return {
    id: input.id,
    title: input.title,
    detail: input.detail,
    owner: input.owner,
    state: input.state,
    metricLabel: input.metricLabel,
    metricValue: input.metricValue,
    agentName: input.agentName,
    openLabel: input.openLabel,
    openTarget: input.openTarget,
    prompt: gitReviewQueuePrompt(input)
  };
}

function gitReviewQueuePrompt(input: Omit<GitReviewQueueItem, 'prompt'> & {
  reviewBrief: string;
  prBody?: string;
  evidence: ReviewEvidencePacket;
}): string {
  return [
    'Continue the next Codex-Platform Git / PR review queue item.',
    '',
    `Recommended owner: ${input.owner}.`,
    `Queue item: ${input.title}`,
    `State: ${input.state}`,
    `Metric: ${input.metricLabel} = ${input.metricValue}`,
    `Detail: ${input.detail}`,
    input.openTarget?.kind === 'file' ? `Open target: ${input.openTarget.path}${input.openTarget.cached ? ' (staged)' : ''}` : undefined,
    input.openTarget?.kind === 'url' ? `Open target: ${input.openTarget.url}` : undefined,
    '',
    'Review package:',
    input.reviewBrief,
    '',
    'PR body draft:',
    input.prBody ?? '- not available',
    '',
    'Evidence packet summary:',
    ...reviewEvidenceSummaryLines(input.evidence),
    '',
    'Execution rules:',
    '- Inspect the current files and diff before editing.',
    '- Preserve the staged/unstaged boundary.',
    '- Keep fixes scoped to the queue item.',
    '- Rerun focused validation, then update the review package.'
  ].filter((line): line is string => line !== undefined).join('\n');
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

function draftCommitMessage(files: GitStatusSummary['files']): string {
  const staged = files.filter(canUnstageFile);
  if (staged.length === 0) return '';
  const paths = staged.map((file) => file.path);
  const scope = commitScope(paths);
  const action = staged.every((file) => file.status === 'added')
    ? 'add'
    : staged.every((file) => file.status === 'deleted')
      ? 'remove'
      : 'update';
  if (scope === 'docs') return `docs: ${action} project documentation`;
  if (scope === 'styles') return `style: ${action} command center styling`;
  if (scope === 'server') return `feat: ${action} server workflow`;
  if (scope === 'release') return `chore: ${action} release workflow`;
  if (scope === 'web') return `feat: ${action} web workflow`;
  return `chore: ${action} project files`;
}

function commitScope(paths: string[]): 'docs' | 'styles' | 'server' | 'release' | 'web' | 'mixed' {
  if (paths.every((path) => path.startsWith('docs/') || path.endsWith('.md'))) return 'docs';
  if (paths.every((path) => path.endsWith('.css'))) return 'styles';
  if (paths.every((path) => path.startsWith('src/server/'))) return 'server';
  if (paths.every((path) => path.startsWith('cloud/hfs/') || path.startsWith('scripts/') || path.startsWith('.github/'))) return 'release';
  if (paths.every((path) => path.startsWith('src/web/') || path.startsWith('src/shared/'))) return 'web';
  return 'mixed';
}

function gitReviewBrief(status: GitStatusSummary, actions?: GitHubActionsSummary, health?: ServerHealth, draftMessage?: string, findings: GitReviewFinding[] = [], evidence?: ReviewEvidencePacket): string {
  const staged = status.files.filter(canUnstageFile).map((file) => file.path);
  const unstaged = status.files.filter(canStageFile).map((file) => file.path);
  const shipInfo = gitShipInfo(status);
  const lines = [
    'PR / review brief',
    '',
    `Branch: ${status.branch ?? 'HEAD'}`,
    `Default branch: ${status.defaultBranch ?? 'unknown'}`,
    `PR base: ${shipInfo.prBaseBranch ?? 'unknown'} (${baseBranchSourceLabel(shipInfo.prBaseSource)})`,
    `HEAD: ${status.head ?? 'unknown'}`,
    `Upstream: ${status.upstream ?? 'none'}`,
    `Ahead / behind: ${status.ahead ?? 0} / ${status.behind ?? 0}`,
    `Working tree: ${status.files.length} changed (${staged.length} staged, ${unstaged.length} unstaged)`,
    draftMessage ? `Suggested commit: ${draftMessage}` : undefined,
    '',
    'Staged files:',
    ...listPaths(staged),
    '',
    'Unstaged files:',
    ...listPaths(unstaged),
    '',
    'Inline review findings:',
    ...reviewFindingLines(findings),
    '',
    'Browser and artifact evidence:',
    ...reviewEvidenceSummaryLines(evidence),
    '',
    'Verification evidence:',
    `- GitHub Actions: ${githubActionsShipLabel(actions)}`,
    `- Runtime build: ${health?.build?.sha ?? 'unknown'}`,
    `- HF target: ${health?.huggingFace?.enabled ? health.huggingFace.spaceId ?? health.huggingFace.spaceHost ?? 'configured' : 'local/unknown'}`,
    '',
    'Review focus:',
    '- Inspect staged and unstaged diffs separately.',
    '- Confirm the commit message matches the staged scope.',
    '- After push, verify GitHub Actions and HF /healthz build SHA before calling the release complete.'
  ];
  return lines.filter((line): line is string => line !== undefined).join('\n');
}

function gitReviewPrompt(status: GitStatusSummary, findings: GitReviewFinding[], draftMessage?: string): string {
  const lines = [
    'Address these Codex-Platform review findings before commit or PR.',
    '',
    `Branch: ${status.branch ?? 'HEAD'}`,
    `Default branch: ${status.defaultBranch ?? 'unknown'}`,
    `HEAD: ${status.head ?? 'unknown'}`,
    draftMessage ? `Suggested commit: ${draftMessage}` : undefined,
    '',
    'Review findings:',
    ...reviewFindingLines(findings),
    '',
    'Please inspect the referenced files and diff lines, implement the smallest complete fix, rerun focused validation, and update the Git review package before committing.'
  ];
  return lines.filter((line): line is string => line !== undefined).join('\n');
}

function gitReviewHandoffPrompt(reviewBrief: string, prBody: string | undefined, findingCount: number): string {
  const owner = findingCount > 0 ? '#worker for fixing review findings' : '#explorer for release-readiness review';
  return [
    'Continue this Codex-Platform Git review and release closure.',
    '',
    `Recommended owner: ${owner}.`,
    '',
    reviewBrief,
    '',
    'PR body draft:',
    prBody ?? '- not available',
    '',
    'Next steps:',
    '- Inspect the live files and git diff before making changes.',
    '- Keep the staged/unstaged boundary explicit.',
    '- Rerun focused validation after changes.',
    '- After push, verify GitHub Actions and Hugging Face /healthz build SHA.'
  ].join('\n');
}

function gitPrBody(
  status: GitStatusSummary,
  actions?: GitHubActionsSummary,
  health?: ServerHealth,
  draftMessage?: string,
  findings: GitReviewFinding[] = [],
  evidence?: ReviewEvidencePacket,
  shipNote?: string,
  releaseDetail?: string
): string {
  const staged = status.files.filter(canUnstageFile).map((file) => file.path);
  const unstaged = status.files.filter(canStageFile).map((file) => file.path);
  const changed = status.files.map((file) => file.path);
  const buildSha = health?.build?.sha;
  const lines = [
    '## Summary',
    `- ${draftMessage || 'Codex-Platform update'}`,
    `- Branch: ${status.branch ?? 'HEAD'}`,
    `- Default branch: ${status.defaultBranch ?? 'unknown'}`,
    `- HEAD: ${status.head ?? 'unknown'}`,
    shipNote ? `- Release path: ${shipNote}` : undefined,
    releaseDetail ? `- Deployment evidence: ${releaseDetail}` : undefined,
    '',
    '## Review Scope',
    `- Changed files: ${changed.length}`,
    `- Staged files: ${staged.length}`,
    `- Unstaged files: ${unstaged.length}`,
    '',
    'Changed files:',
    ...listPaths(changed),
    '',
    '## Inline Review Findings',
    ...reviewFindingLines(findings),
    '',
    '## Browser Evidence',
    ...browserEvidenceLines(evidence),
    '',
    '## Artifact Evidence',
    ...artifactEvidenceLines(evidence),
    '',
    '## Validation',
    `- GitHub Actions: ${githubActionsShipLabel(actions)}`,
    `- Runtime build SHA: ${buildSha ?? 'unknown'}`,
    `- HF target: ${health?.huggingFace?.enabled ? health.huggingFace.spaceId ?? health.huggingFace.spaceHost ?? 'configured' : 'local/unknown'}`,
    ...githubActionsRunLines(actions),
    '',
    '## Release Checklist',
    '- [ ] Review staged and unstaged diffs separately.',
    '- [ ] Confirm the commit message matches the staged scope.',
    '- [ ] Push the branch or default branch intentionally.',
    '- [ ] Confirm GitHub Actions completed successfully for this commit.',
    '- [ ] Confirm Hugging Face /healthz build.sha matches the GitHub commit.',
    '- [ ] Run the HF smoke check before calling the release complete.'
  ];
  return lines.filter((line): line is string => line !== undefined).join('\n');
}

function reviewEvidenceSummaryLines(evidence?: ReviewEvidencePacket): string[] {
  if (!evidence) return ['- none loaded'];
  const browserNotes = evidence.browserFeedback.trim();
  const artifactNotes = evidence.artifactFeedback.trim();
  return [
    `- Browser targets: ${evidence.browserTargets.length}`,
    `- Artifacts: ${evidence.artifacts.length}`,
    `- Browser notes: ${browserNotes || 'none recorded'}`,
    `- Artifact notes: ${artifactNotes || 'none recorded'}`
  ];
}

function browserEvidenceLines(evidence?: ReviewEvidencePacket): string[] {
  if (!evidence || (evidence.browserTargets.length === 0 && !evidence.browserFeedback.trim())) return ['- none captured'];
  const lines = evidence.browserTargets.slice(0, 6).map((target) => `- ${target.title}: ${target.url} (${targetKindLabel(target.kind)} · ${target.source})`);
  if (evidence.browserTargets.length > lines.length) lines.push(`- ${evidence.browserTargets.length - lines.length} more browser targets`);
  lines.push(`- Observed feedback: ${evidence.browserFeedback.trim() || 'none recorded'}`);
  return lines;
}

function artifactEvidenceLines(evidence?: ReviewEvidencePacket): string[] {
  if (!evidence || (evidence.artifacts.length === 0 && !evidence.artifactFeedback.trim())) return ['- none captured'];
  const lines = evidence.artifacts.slice(0, 8).map((artifact) => `- ${artifactKind(artifact)}: ${artifact.filePath ?? artifact.title}`);
  if (evidence.artifacts.length > lines.length) lines.push(`- ${evidence.artifacts.length - lines.length} more artifacts`);
  lines.push(`- Follow-up feedback: ${evidence.artifactFeedback.trim() || 'none recorded'}`);
  return lines;
}

function reviewFindingLines(findings: GitReviewFinding[]): string[] {
  if (findings.length === 0) return ['- none'];
  return findings.slice(0, 12).flatMap((finding) => [
    `- ${finding.path}:${finding.lineNumber} (${finding.kind}) ${finding.note}`,
    `  ${finding.lineText || ' '}`
  ]);
}

function githubActionsRunLines(actions?: GitHubActionsSummary): string[] {
  if (!actions?.runs.length) return ['- GitHub Actions runs: none loaded'];
  return [
    '- GitHub Actions runs:',
    ...actions.runs.slice(0, 4).map((run) => `  - ${run.name}: ${run.conclusion ?? run.status ?? 'unknown'}${run.headSha ? ` (${shortSha(run.headSha)})` : ''}`)
  ];
}

function listPaths(paths: string[]): string[] {
  if (paths.length === 0) return ['- none'];
  const visible = paths.slice(0, 16).map((path) => `- ${path}`);
  if (paths.length > visible.length) visible.push(`- ${paths.length - visible.length} more`);
  return visible;
}

function gitShipInfo(status: GitStatusSummary): {
  state: 'ready' | 'review' | 'blocked';
  label: string;
  detail: string;
  remoteLabel: string;
  pushCommand?: string;
  compareUrl?: string;
  prCommand?: string;
  prUrl?: string;
  prBaseBranch?: string;
  prBaseSource?: BaseBranchSource;
  prMode: 'branch' | 'direct' | 'unavailable';
  prNote: string;
  repoUrl?: string;
} {
  const branch = status.branch && status.branch !== 'HEAD' ? status.branch : undefined;
  const baseBranch = defaultBaseBranch(status, branch);
  const remoteName = status.defaultRemote || status.upstream?.split('/')[0] || 'origin';
  const repoUrl = githubRemoteUrl(status.remoteUrl);
  const remoteLabel = status.remoteUrl ? remoteName : 'missing';
  const pushCommand = branch ? `git push ${remoteName} ${branch}` : undefined;
  const prMode = repoUrl && branch ? branch === baseBranch.branch ? 'direct' : 'branch' : 'unavailable';
  const compareUrl = repoUrl && branch
    ? prMode === 'branch'
      ? `${repoUrl}/compare/${encodeURIComponent(baseBranch.branch)}...${encodeURIComponent(branch)}?expand=1`
      : `${repoUrl}/commits/${encodeURIComponent(branch)}`
    : undefined;
  const prUrl = repoUrl && branch && prMode === 'branch' ? `${repoUrl}/compare/${encodeURIComponent(baseBranch.branch)}...${encodeURIComponent(branch)}?expand=1` : undefined;
  const prCommand = branch && prMode === 'branch' ? `gh pr create --base ${shellQuote(baseBranch.branch)} --head ${shellQuote(branch)} --fill --draft` : undefined;
  const prNote = prMode === 'branch'
    ? `Branch flow: push ${branch}, then open a draft PR into ${baseBranch.branch} (${baseBranchSourceLabel(baseBranch.source)}).`
    : prMode === 'direct'
      ? `Default branch flow: ${branch} matches ${baseBranch.branch} (${baseBranchSourceLabel(baseBranch.source)}); push, then verify GitHub Actions and HF runtime evidence.`
      : 'Add a GitHub remote and named branch to enable PR commands.';
  const changed = status.files.length;
  const ahead = status.ahead ?? 0;
  const behind = status.behind ?? 0;

  if (!branch || !status.remoteUrl) {
    return {
      state: 'blocked',
      label: 'setup needed',
      detail: 'Missing branch or remote.',
      remoteLabel,
      prMode,
      prNote,
      prBaseBranch: baseBranch.branch,
      prBaseSource: baseBranch.source,
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
      prCommand,
      prUrl,
      prBaseBranch: baseBranch.branch,
      prBaseSource: baseBranch.source,
      prMode,
      prNote,
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
      prCommand,
      prUrl,
      prBaseBranch: baseBranch.branch,
      prBaseSource: baseBranch.source,
      prMode,
      prNote,
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
      prCommand,
      prUrl,
      prBaseBranch: baseBranch.branch,
      prBaseSource: baseBranch.source,
      prMode,
      prNote,
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
    prCommand,
    prUrl,
    prBaseBranch: baseBranch.branch,
    prBaseSource: baseBranch.source,
    prMode,
    prNote,
    repoUrl
  };
}

type BaseBranchSource = 'remote-head' | 'upstream' | 'current' | 'assumed';

function defaultBaseBranch(status: GitStatusSummary, branch?: string): { branch: string; source: BaseBranchSource } {
  const detected = status.defaultBranch?.trim();
  if (detected) return { branch: detected, source: 'remote-head' };

  const upstreamBranch = remoteBranchName(status.upstream);
  if (upstreamBranch && isDefaultBranch(upstreamBranch)) return { branch: upstreamBranch, source: 'upstream' };
  if (branch && isDefaultBranch(branch)) return { branch, source: 'current' };
  return { branch: 'main', source: 'assumed' };
}

function remoteBranchName(value?: string): string | undefined {
  const branch = value?.trim();
  if (!branch) return undefined;
  const slash = branch.indexOf('/');
  return slash >= 0 ? branch.slice(slash + 1) : branch;
}

function baseBranchSourceLabel(source?: BaseBranchSource): string {
  if (source === 'remote-head') return 'remote HEAD';
  if (source === 'upstream') return 'upstream branch';
  if (source === 'current') return 'current default branch';
  return 'assumed default';
}

function baseBranchCheckLabel(source?: BaseBranchSource): string {
  if (source === 'remote-head') return 'detected';
  if (source === 'upstream') return 'upstream';
  if (source === 'current') return 'current';
  return 'assumed';
}

function isDefaultBranch(branch: string): boolean {
  return branch === 'main' || branch === 'master';
}

function gitReleaseInfo(status: GitStatusSummary, health?: ServerHealth, actions?: GitHubActionsSummary): {
  state: 'ready' | 'review' | 'blocked';
  label: string;
  detail: string;
  checks: Array<{ label: string; value: string; state: 'ok' | 'warn' | 'idle' }>;
  actionsUrl?: string;
  healthUrl?: string;
} {
  const buildSha = health?.build?.sha;
  const sourceSha = status.head;
  const buildMatchesHead = buildSha && sourceSha ? buildSha === sourceSha : undefined;
  const actionsState = githubActionsShipState(actions);
  const hfTarget = health?.huggingFace?.enabled ? health.huggingFace.spaceId ?? health.huggingFace.spaceHost ?? 'configured' : 'local';
  const healthBaseUrl = health?.huggingFace?.publicUrl ?? (health?.huggingFace?.spaceHost ? `https://${health.huggingFace.spaceHost}` : undefined);
  const checks = [
    { label: 'Actions', value: githubActionsShipLabel(actions), state: actionsState },
    { label: 'Runtime build', value: buildSha ? shortSha(buildSha) : 'unversioned', state: buildSha ? 'ok' : 'idle' },
    { label: 'Build vs HEAD', value: buildMatchesHead === undefined ? 'unknown' : buildMatchesHead ? 'match' : 'mismatch', state: buildMatchesHead === undefined ? 'idle' : buildMatchesHead ? 'ok' : 'warn' },
    { label: 'HF target', value: hfTarget, state: health?.huggingFace?.enabled ? 'ok' : 'idle' }
  ] satisfies Array<{ label: string; value: string; state: 'ok' | 'warn' | 'idle' }>;

  if (actionsState === 'warn' || buildMatchesHead === false) {
    return {
      state: 'blocked',
      label: 'attention',
      detail: 'Post-push verification has a failing or mismatched signal.',
      checks,
      actionsUrl: actions?.htmlUrl,
      healthUrl: healthBaseUrl ? `${healthBaseUrl.replace(/\/$/, '')}/healthz` : undefined
    };
  }
  if (actionsState === 'ok' && buildMatchesHead === true && health?.huggingFace?.enabled) {
    return {
      state: 'ready',
      label: 'verified',
      detail: 'GitHub Actions, runtime build SHA, and HF target line up.',
      checks,
      actionsUrl: actions?.htmlUrl,
      healthUrl: healthBaseUrl ? `${healthBaseUrl.replace(/\/$/, '')}/healthz` : undefined
    };
  }
  return {
    state: 'review',
    label: 'partial',
    detail: 'Use this after push to confirm Actions and HF runtime evidence.',
    checks,
    actionsUrl: actions?.htmlUrl,
    healthUrl: healthBaseUrl ? `${healthBaseUrl.replace(/\/$/, '')}/healthz` : undefined
  };
}

function githubActionsShipState(actions?: GitHubActionsSummary): 'ok' | 'warn' | 'idle' {
  if (!actions || actions.state === 'unavailable' || actions.state === 'unknown') return 'idle';
  if (actions.state === 'success') return 'ok';
  return 'warn';
}

function githubActionsShipLabel(actions?: GitHubActionsSummary): string {
  if (!actions) return 'loading';
  if (actions.state === 'success') return 'passing';
  if (actions.state === 'failure') return 'failing';
  if (actions.state === 'pending') return 'pending';
  return 'unknown';
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

function ArtifactsTab({
  cards,
  project,
  feedback,
  onFeedbackChange,
  onFocusCard,
  onUsePrompt
}: {
  cards: TimelineCard[];
  project?: Project;
  feedback: string;
  onFeedbackChange: (value: string) => void;
  onFocusCard?: (cardId: string) => void;
  onUsePrompt?: (handoff: PromptHandoff) => void;
}) {
  const artifacts = artifactCards(cards);
  const [selectedId, setSelectedId] = useState('');
  const [copiedArtifact, setCopiedArtifact] = useState(false);
  const selected = artifacts.find((artifact) => artifact.id === selectedId) ?? artifacts[0];
  const artifactPrompt = selected ? artifactFeedbackPrompt(selected, project, feedback) : missingArtifactFeedbackPrompt(project, feedback);
  const loopSteps = artifactLoopSteps(selected, feedback);
  const hasArtifactFeedbackPrompt = Boolean(artifactPrompt);

  async function copyArtifactPrompt() {
    if (!artifactPrompt) return;
    await copyText(artifactPrompt);
    setCopiedArtifact(true);
    window.setTimeout(() => setCopiedArtifact(false), 1800);
  }

  function handOffArtifactPrompt() {
    if (!artifactPrompt) return;
    onUsePrompt?.({
      prompt: artifactPrompt,
      threadId: selected?.threadId,
      agentName: selected ? selected.kind === 'error' ? 'explorer' : 'worker' : 'explorer'
    });
  }

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
                <div className="artifact-detail-actions">
                  <button className="small ghost" onClick={() => onFocusCard?.(selected.id)}>Focus</button>
                </div>
              </div>
              <FocusedCard card={selected} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="artifact-feedback-card">
        <div>
          <strong>Follow-up feedback</strong>
          <span>{selected ? 'Artifact notes become the next scoped review or fix task.' : 'Describe the expected artifact so an explorer can trace why it is missing.'}</span>
        </div>
        <textarea
          value={feedback}
          onChange={(event) => onFeedbackChange(event.target.value)}
          placeholder={selected ? 'Example: preserve this diff but refine the empty state copy and verify the artifact still appears here.' : 'Example: the run should have produced a deploy screenshot or diff artifact; trace the event stream and restore the artifact capture path.'}
          rows={3}
        />
        <EvidenceLoopStrip
          title="Artifact evidence loop"
          steps={loopSteps}
          summary={selected ? 'Selected output, excerpt, and notes are included.' : hasArtifactFeedbackPrompt ? 'Missing artifact notes are ready for diagnosis.' : 'Record the expected artifact before handoff.'}
          onHandOff={handOffArtifactPrompt}
          handoffDisabled={!hasArtifactFeedbackPrompt || !onUsePrompt}
          onCopy={() => void copyArtifactPrompt()}
          copyDisabled={!hasArtifactFeedbackPrompt}
          copied={copiedArtifact}
        />
      </div>
    </section>
  );
}

function artifactCards(cards: TimelineCard[]): TimelineCard[] {
  return cards
    .filter((card) => card.kind === 'fileChange' || card.kind === 'agent' || card.kind === 'plan' || card.kind === 'error' || (card.kind === 'command' && (card.stdout || card.stderr)))
    .slice(-12)
    .reverse();
}

function artifactLoopSteps(card: TimelineCard | undefined, feedback: string): EvidenceLoopStep[] {
  const notesReady = feedback.trim().length > 0;
  const owner = card ? card.kind === 'error' ? '#explorer' : '#worker' : '#explorer';
  const verify = card ? artifactVerificationLabel(card) : notesReady ? 'trace missing output' : 'record expectation';
  return [
    {
      label: 'Artifact',
      value: card ? `${artifactKind(card)} · ${card.filePath ?? card.title}` : 'none',
      tone: card ? 'ok' : 'idle'
    },
    {
      label: 'Notes',
      value: notesReady ? 'recorded' : 'empty',
      tone: notesReady ? 'ok' : 'warn'
    },
    {
      label: 'Owner',
      value: owner,
      tone: card || notesReady ? 'ok' : 'idle'
    },
    {
      label: 'Verify',
      value: verify,
      tone: card ? 'ok' : notesReady ? 'warn' : 'idle'
    }
  ];
}

function RawTab(props: { card?: TimelineCard; thread?: ThreadSummary; project?: Project; rawEvents: RawEventRecord[] }) {
  const [selectedRawId, setSelectedRawId] = useState('');
  const selectedRaw = props.rawEvents.find((event) => event.id === selectedRawId) ?? props.rawEvents[0];
  const payload = selectedRaw
    ? { event: selectedRaw, focus: { card: props.card, thread: props.thread, project: props.project } }
    : { focus: { card: props.card, thread: props.thread, project: props.project } };

  return (
    <section className="panel grow raw-panel">
      <div className="review-pane-header">
        <div>
          <div className="section-title">Raw events</div>
          <div className="panel-title">{selectedRaw ? selectedRaw.method : 'Focused payload'}</div>
        </div>
        <span className="side-panel-count">{props.rawEvents.length} events</span>
      </div>
      <div className="raw-event-shell">
        <div className="raw-event-list" aria-label="Raw event history">
          {props.rawEvents.length === 0 ? <div className="empty-inline">No raw events captured yet.</div> : null}
          {props.rawEvents.slice(0, 24).map((event) => (
            <button
              key={event.id}
              className={`raw-event-row ${selectedRaw?.id === event.id ? 'active' : ''}`}
              onClick={() => setSelectedRawId(event.id)}
            >
              <span>
                <strong>{event.method}</strong>
                <small>{rawEventSummary(event.params)}</small>
              </span>
              <code>{formatTime(event.createdAt)}</code>
            </button>
          ))}
        </div>
        <pre className="json-snippet large-json raw-json">{safeJson(payload)}</pre>
      </div>
    </section>
  );
}

function rawEventSummary(value: unknown): string {
  if (value === undefined || value === null) return 'no payload';
  if (typeof value !== 'object') return compactText(String(value), 72);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length ? keys.slice(0, 4).join(', ') : 'object';
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({ error: 'Unable to serialize payload.' }, null, 2);
  }
}

function compactText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
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

function tabShortLabel(tab: InspectorTab): string {
  switch (tab) {
    case 'review': return 'Rev';
    case 'files': return 'File';
    case 'terminal': return 'Term';
    case 'browser': return 'Web';
    case 'artifacts': return 'Art';
    default: return tabLabel(tab);
  }
}

function tabIcon(tab: InspectorTab): IconName {
  switch (tab) {
    case 'review': return 'check';
    case 'plan': return 'clock';
    case 'diff': return 'file';
    case 'files': return 'folder';
    case 'git': return 'branch';
    case 'terminal': return 'terminal';
    case 'browser': return 'panel';
    case 'artifacts': return 'paperclip';
    case 'raw': return 'sliders';
    default: return 'dot';
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
        cardId: card.id,
        capturedAt: card.createdAt,
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

function artifactVerificationLabel(card: TimelineCard): string {
  if (card.kind === 'fileChange') return 'diff review + UI smoke';
  if (card.kind === 'command') return card.exitCode === 0 ? 'rerun if touched' : 'diagnose exit';
  if (card.kind === 'error') return 'reproduce + trace';
  if (card.kind === 'plan') return 'acceptance check';
  if (card.kind === 'agent') return 'source readback';
  return 'source check';
}

function artifactFeedbackPrompt(card: TimelineCard, project: Project | undefined, feedback: string): string {
  const owner = card.kind === 'error' ? '#explorer for diagnosis' : '#worker for scoped follow-up';
  const lines = [
    'Use this thread artifact as context for the next Codex task.',
    '',
    `Recommended owner: ${owner}.`,
    '',
    `Project: ${project?.name ?? 'current project'}`,
    `Artifact: ${card.filePath ?? card.title}`,
    `Kind: ${artifactKind(card)}`,
    `Status: ${card.status ?? 'unknown'}`,
    `Created: ${formatTime(card.createdAt)}`,
    '',
    'Follow-up feedback:',
    feedback.trim() || '- Describe what should be changed, preserved, verified, or explained.',
    '',
    'Artifact excerpt:',
    artifactExcerpt(card),
    '',
    'Please inspect the source files before editing, keep the change scoped, and verify the affected UI or workflow.'
  ];
  return lines.join('\n');
}

function missingArtifactFeedbackPrompt(project: Project | undefined, feedback: string): string | undefined {
  const feedbackText = feedback.trim();
  if (!feedbackText) return undefined;
  const lines = [
    'Investigate a missing or expected thread artifact.',
    '',
    'Recommended owner: #explorer for diagnosis before implementation.',
    '',
    `Project: ${project?.name ?? 'current project'}`,
    'Artifact: none selected or none produced',
    '',
    'Expected artifact feedback:',
    feedbackText,
    '',
    'Please inspect the thread event stream, artifact extraction rules, and source files before editing. Identify whether the artifact was never produced, was filtered out, or is not represented in the Artifacts pane, then implement the smallest complete fix and verify the artifact appears in the pane.'
  ];
  return lines.join('\n');
}

function artifactExcerpt(card: TimelineCard): string {
  const value = card.diff || card.stdout || card.stderr || card.text || safeJson(card.payload ?? card);
  return compactText(value, 1800);
}
