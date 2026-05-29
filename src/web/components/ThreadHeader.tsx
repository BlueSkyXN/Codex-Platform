import type { ApprovalRequest, Project, ThreadSummary, TimelineCard } from '../../shared/types.js';

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
  const fileChanges = countByKind(props.cards, 'fileChange');
  const commands = countByKind(props.cards, 'command');
  const pendingApprovals = props.approvals.filter((a) => !props.thread?.id || !a.threadId || a.threadId === props.thread.id).length;
  const running = isRunning(props.thread?.status);
  const title = props.thread?.name || props.thread?.preview || props.thread?.id || 'No thread selected';

  return (
    <div className="thread-header codex-thread-header">
      <div className="thread-header-main">
        <div className="thread-title-line">
          <h1>{title}</h1>
          <span className={`status-pill dot-status ${props.thread?.status ?? 'idle'}`}>{statusLabel(props.thread?.status)}</span>
        </div>
        <div className="thread-context codex-thread-context">
          <span>Local</span>
          <span className="dot" />
          <span>{props.project?.name ?? 'No project'}</span>
          <span className="dot" />
          <code title={props.project?.cwd}>{props.project?.cwd ?? '—'}</code>
        </div>
      </div>

      <div className="thread-metrics codex-thread-actions">
        <span className="metric branch-metric">⑂ {branchFromThread(props.thread)}</span>
        <span className="metric">{props.cards.length} items</span>
        <span className="metric">{commands} commands</span>
        <span className="metric">{fileChanges} files</span>
        {pendingApprovals > 0 ? <span className="metric attention">{pendingApprovals} approvals</span> : null}
        <button className="compact-action" onClick={props.onInterrupt} disabled={!props.thread || props.busy || !running} title="Interrupt the current turn">
          Interrupt
        </button>
      </div>
    </div>
  );
}
