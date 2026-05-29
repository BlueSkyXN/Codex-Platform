import type { ApprovalDecision, ApprovalRequest, InspectorTab, ThreadSummary, TimelineCard } from '../../shared/types.js';

export function ActivityCenter(props: {
  open: boolean;
  approvals: ApprovalRequest[];
  threads: ThreadSummary[];
  cards: TimelineCard[];
  errors: string[];
  selectedThreadId?: string;
  onClose: () => void;
  onSelectThread: (threadId: string) => void | Promise<void>;
  onDecision: (requestId: string | number, decision: ApprovalDecision) => void;
  onOpenInspectorTab: (tab: InspectorTab) => void;
}) {
  if (!props.open) return null;
  const activeThreads = props.threads
    .filter((thread) => isActive(thread.status))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const recentCards = [...props.cards].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)).slice(0, 18);

  return (
    <div className="activity-backdrop" role="presentation" onMouseDown={props.onClose}>
      <aside className="activity-center" role="dialog" aria-modal="true" aria-label="Activity center" onMouseDown={(event) => event.stopPropagation()}>
        <header className="activity-head">
          <div>
            <div className="section-title">Activity</div>
            <h2>Remote supervision</h2>
          </div>
          <button className="icon-button" onClick={props.onClose}>×</button>
        </header>

        {props.approvals.length > 0 ? (
          <section className="activity-section attention">
            <div className="activity-section-title">Approvals waiting</div>
            {props.approvals.map((approval) => (
              <article key={String(approval.requestId)} className="activity-approval">
                <strong>{approval.title}</strong>
                {approval.command ? <code>{approval.command}</code> : null}
                {approval.reason ? <p>{approval.reason}</p> : null}
                <div className="activity-actions">
                  <button className="primary" onClick={() => props.onDecision(approval.requestId, 'accept')}>Allow once</button>
                  <button onClick={() => props.onDecision(approval.requestId, 'acceptForSession')}>Session</button>
                  <button onClick={() => props.onDecision(approval.requestId, 'decline')}>Decline</button>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="activity-section quiet"><strong>No approvals waiting.</strong><span>When Codex needs permission, it will appear here.</span></section>
        )}

        <section className="activity-section">
          <div className="activity-section-title">Running / blocked threads</div>
          {activeThreads.length === 0 ? <div className="empty-mini">No active threads.</div> : null}
          {activeThreads.map((thread) => (
            <button key={thread.id} className={`activity-thread ${thread.id === props.selectedThreadId ? 'active' : ''}`} onClick={() => void props.onSelectThread(thread.id)}>
              <span className={`thread-dot ${statusClass(thread.status)}`} />
              <span><strong>{thread.name || thread.preview || compactThreadId(thread.id)}</strong><small>{thread.status ?? 'running'} · {compactThreadId(thread.id)}</small></span>
            </button>
          ))}
        </section>

        <section className="activity-section">
          <div className="activity-section-title row-title"><span>Recent events</span><button className="small ghost" onClick={() => props.onOpenInspectorTab('raw')}>Raw</button></div>
          {recentCards.length === 0 ? <div className="empty-mini">No events yet.</div> : null}
          {recentCards.map((card) => (
            <button key={card.id} className="activity-event" onClick={() => props.onOpenInspectorTab(tabForCard(card))}>
              <span className={`event-kind ${card.kind}`}>{kindIcon(card.kind)}</span>
              <span><strong>{card.title}</strong><small>{card.status ?? card.kind}</small></span>
            </button>
          ))}
        </section>

        {props.errors.length > 0 ? (
          <section className="activity-section errors">
            <div className="activity-section-title">Errors</div>
            {props.errors.slice(0, 4).map((error, index) => <div key={index} className="error-line">{error}</div>)}
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function isActive(status?: string): boolean {
  const value = String(status ?? '').toLowerCase();
  return value.includes('run') || value.includes('progress') || value.includes('approval') || value.includes('block');
}

function statusClass(status?: string): string {
  return String(status ?? 'idle').replace(/[^a-z0-9_-]/gi, '_');
}

function compactThreadId(id: string): string {
  return id.replace(/^thr_/, '').slice(-12) || id;
}

function kindIcon(kind: TimelineCard['kind']): string {
  switch (kind) {
    case 'command': return '⌁';
    case 'fileChange': return 'Δ';
    case 'approval': return '!';
    case 'plan': return '☷';
    case 'reasoning': return '∴';
    case 'error': return '×';
    case 'user': return 'U';
    case 'agent': return 'A';
    default: return '•';
  }
}

function tabForCard(card: TimelineCard): InspectorTab {
  if (card.kind === 'command') return 'terminal';
  if (card.kind === 'fileChange') return 'diff';
  if (card.kind === 'plan' || card.kind === 'reasoning') return 'plan';
  return 'review';
}
