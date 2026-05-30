import type { ApprovalRequest, Project, ThreadSummary, TimelineCard } from '../../shared/types.js';
import { deriveSupervisionSummary, supervisionStateClass } from '../lib/supervision.js';
import { Icon } from './Icon.js';

function statusLabel(status?: string): string {
  if (!status || status === 'loaded') return 'Ready';
  if (status === 'waiting_approval') return 'Waiting approval';
  if (status === 'inProgress') return 'Running';
  return status.replace(/_/g, ' ');
}

function countByKind(cards: TimelineCard[], kind: TimelineCard['kind']): number {
  return cards.filter((card) => card.kind === kind).length;
}

function isRunning(status?: string): boolean {
  const s = String(status ?? '').toLowerCase();
  return s.includes('active') || s.includes('running') || s.includes('progress') || s.includes('approval');
}

function branchFromThread(thread?: ThreadSummary): string {
  const raw = thread?.raw;
  if (raw && typeof raw === 'object' && 'branch' in raw && typeof (raw as { branch?: unknown }).branch === 'string') return (raw as { branch: string }).branch;
  return 'main';
}

export function ThreadHeader(props: {
  project?: Project;
  thread?: ThreadSummary;
  cards: TimelineCard[];
  approvals: ApprovalRequest[];
  busy: boolean;
  onInterrupt: () => void;
}) {
  if (!props.thread || (props.cards.length === 0 && props.approvals.length === 0)) return null;

  const fileChanges = countByKind(props.cards, 'fileChange');
  const commands = countByKind(props.cards, 'command');
  const pendingApprovals = props.approvals.filter((a) => !props.thread?.id || !a.threadId || a.threadId === props.thread.id).length;
  const running = isRunning(props.thread?.status);
  const title = props.thread?.name || props.thread?.preview || props.thread?.id || 'No thread selected';
  const visibleStatus = pendingApprovals > 0 ? 'Approval' : statusLabel(props.thread?.status);
  const visibleStatusClass = pendingApprovals > 0 ? 'waiting_approval' : props.thread?.status ?? 'idle';
  const supervision = deriveSupervisionSummary({ thread: props.thread, cards: props.cards, approvals: props.approvals });

  return (
    <div className="thread-header codex-thread-header">
      <div className="thread-header-main">
        <div className="thread-title-line">
          <h1>{title}</h1>
          <span className={`status-pill dot-status ${visibleStatusClass}`}>{visibleStatus}</span>
        </div>
        <div className="thread-context codex-thread-context">
          <span>Local</span>
          <span className="dot" />
          <span>{props.project?.name ?? 'No project'}</span>
          <span className="dot" />
          <code title={props.project?.cwd}>{props.project?.cwd ?? '—'}</code>
        </div>
        <div className={`agent-supervision-strip ${supervisionStateClass(supervision.state)}`} aria-label="Agent execution supervision">
          <span className="agent-supervision-icon"><Icon name={supervision.state === 'waiting_approval' ? 'clock' : supervision.state === 'failed' ? 'close' : 'agent'} size={14} /></span>
          <span className="agent-supervision-state">{supervision.label}</span>
          <strong title={supervision.current}>{supervision.current}</strong>
          <span title={supervision.detail}>{supervision.detail}</span>
          {supervision.turnId ? <code title={supervision.turnId}>{compactTurnId(supervision.turnId)}</code> : null}
        </div>
      </div>

      <div className="thread-metrics codex-thread-actions">
        <span className="metric branch-metric"><Icon name="branch" size={13} /> {branchFromThread(props.thread)}</span>
        <span className="metric">{props.cards.length} items</span>
        <span className="metric">{commands} commands</span>
        <span className="metric">{fileChanges} files</span>
        {pendingApprovals > 0 ? <span className="metric attention">{pendingApprovals} approvals</span> : null}
        <button className="compact-action thread-stop-action stop-action" onClick={props.onInterrupt} disabled={!props.thread || props.busy || !running} title="Interrupt the current turn" aria-label="Interrupt the current turn">
          <Icon name="stop" size={13} />
        </button>
      </div>
    </div>
  );
}

function compactTurnId(id: string): string {
  return id.replace(/^turn_/, '').slice(-10);
}
