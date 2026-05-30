import type { ApprovalDecision, ApprovalRecord, ApprovalRequest, InspectorTab, ThreadSummary, TimelineCard } from '../../shared/types.js';
import { deriveSupervisionSummary, supervisionStateClass } from '../lib/supervision.js';
import { Icon, type IconName } from './Icon.js';

export function ActivityCenter(props: {
  open: boolean;
  approvals: ApprovalRequest[];
  approvalHistory: ApprovalRecord[];
  threads: ThreadSummary[];
  cards: TimelineCard[];
  errors: string[];
  selectedThreadId?: string;
  onClose: () => void;
  onSelectThread: (threadId: string) => void | Promise<void>;
  onDecision: (requestId: string | number, decision: ApprovalDecision) => void;
  onOpenInspectorTab: (tab: InspectorTab) => void;
  onFocusCard?: (card: TimelineCard) => void;
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
          <button className="icon-button" onClick={props.onClose} title="Close activity center" aria-label="Close activity center"><Icon name="close" size={15} /></button>
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
          <div className="activity-section-title">Recent decisions</div>
          {props.approvalHistory.length === 0 ? <div className="empty-mini">No approval decisions recorded yet.</div> : null}
          {props.approvalHistory.slice(0, 5).map((approval) => (
            <article key={String(approval.requestId)} className={`activity-decision ${decisionTone(approval.decision)}`}>
              <span className="event-kind approval"><Icon name={decisionIcon(approval.decision)} size={13} /></span>
              <span>
                <strong>{approval.title}</strong>
                <small>{approval.decision ?? 'resolved'} · {approval.command ?? approval.reason ?? approval.kind}</small>
              </span>
            </article>
          ))}
        </section>

        <section className="activity-section">
          <div className="activity-section-title">Running / blocked threads</div>
          {activeThreads.length === 0 ? <div className="empty-mini">No active threads.</div> : null}
          {activeThreads.map((thread) => {
            const threadCards = props.cards.filter((card) => card.threadId === thread.id);
            const threadApprovals = props.approvals.filter((approval) => !approval.threadId || approval.threadId === thread.id);
            const supervision = deriveSupervisionSummary({ thread, cards: threadCards, approvals: threadApprovals });
            return (
              <button key={thread.id} className={`activity-thread ${thread.id === props.selectedThreadId ? 'active' : ''}`} onClick={() => void props.onSelectThread(thread.id)}>
                <span className={`thread-dot ${statusClass(thread.status)} ${supervisionStateClass(supervision.state)}`} />
                <span>
                  <strong>{thread.name || thread.preview || compactThreadId(thread.id)}</strong>
                  <small>{supervision.label} · {compactThreadId(thread.id)}</small>
                  <em title={supervision.current}>{supervision.current}</em>
                </span>
              </button>
            );
          })}
        </section>

        <section className="activity-section">
          <div className="activity-section-title row-title"><span>Recent events</span><button className="small ghost" onClick={() => props.onOpenInspectorTab('raw')}>Raw</button></div>
          {recentCards.length === 0 ? <div className="empty-mini">No events yet.</div> : null}
          {recentCards.map((card) => (
            <button key={card.id} className="activity-event" onClick={() => props.onFocusCard ? props.onFocusCard(card) : props.onOpenInspectorTab(tabForCard(card))}>
              <span className={`event-kind ${card.kind}`}><Icon name={kindIcon(card.kind)} size={13} /></span>
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

function decisionTone(decision?: string): string {
  const value = String(decision ?? '').toLowerCase();
  if (value.includes('accept') || value.includes('allow')) return 'accepted';
  if (value.includes('decline') || value.includes('deny') || value.includes('cancel')) return 'declined';
  return 'resolved';
}

function decisionIcon(decision?: string): IconName {
  const value = String(decision ?? '').toLowerCase();
  if (value.includes('accept') || value.includes('allow')) return 'check';
  if (value.includes('decline') || value.includes('deny') || value.includes('cancel')) return 'close';
  return 'clock';
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

function kindIcon(kind: TimelineCard['kind']): IconName {
  switch (kind) {
    case 'command': return 'terminal';
    case 'fileChange': return 'file';
    case 'approval': return 'clock';
    case 'plan': return 'check';
    case 'reasoning': return 'clock';
    case 'error': return 'close';
    case 'user': return 'user';
    case 'agent': return 'agent';
    default: return 'dot';
  }
}

function tabForCard(card: TimelineCard): InspectorTab {
  if (card.kind === 'command') return 'terminal';
  if (card.kind === 'fileChange') return 'diff';
  if (card.kind === 'plan' || card.kind === 'reasoning') return 'plan';
  return 'review';
}
