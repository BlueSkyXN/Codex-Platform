import { useEffect, useMemo, useRef, useState } from 'react';
import type { TimelineCard, TimelineCardKind } from '../../shared/types.js';
import { CommandCard, FileChangeCard } from './cards.js';

const kindFilters: Array<'all' | TimelineCardKind> = ['all', 'agent', 'command', 'fileChange', 'plan', 'tool', 'reasoning'];

export function Timeline(props: { cards: TimelineCard[]; focusedCardId?: string; onFocus: (cardId: string) => void }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | TimelineCardKind>('all');
  const endRef = useRef<HTMLDivElement | null>(null);

  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return props.cards.filter((card) => {
      if (kind !== 'all' && card.kind !== kind) return false;
      if (!normalizedQuery) return true;
      const haystack = [card.title, card.text, card.command, card.filePath, card.status, card.stdout, card.stderr, card.diff]
        .filter(Boolean)
        .join('\n')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [props.cards, query, kind]);

  const latestTurnId = props.cards.at(-1)?.turnId;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [props.cards.length, props.cards.at(-1)?.updatedAt]);

  return (
    <div className="timeline-shell codex-timeline-shell">
      <div className="timeline-toolbar codex-timeline-toolbar">
        <div className="timeline-toolbar-main">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find in thread" />
          <span className="timeline-count">{filteredCards.length}/{props.cards.length}</span>
        </div>
        <div className="filter-row compact-filter-row">
          {kindFilters.map((item) => (
            <button key={item} className={`filter-chip ${kind === item ? 'active' : ''}`} onClick={() => setKind(item)}>
              {item === 'all' ? 'All' : label(item)}
            </button>
          ))}
        </div>
      </div>

      <div className="timeline codex-timeline">
        {props.cards.length === 0 ? (
          <div className="empty-state codex-empty-state">
            <div className="empty-title">Start a Codex thread</div>
            <div className="empty-copy">Choose Local, Worktree, or Cloud-style execution, then ask Codex to inspect, edit, run, and review this project.</div>
          </div>
        ) : null}
        {props.cards.length > 0 && filteredCards.length === 0 ? <div className="empty-state compact">No events match the current filter.</div> : null}

        {filteredCards.map((card, index) => {
          const previous = filteredCards[index - 1];
          const newTurn = card.turnId && card.turnId !== previous?.turnId;
          const shouldShowWorkDivider = latestTurnId && card.turnId === latestTurnId && index > 0 && card.kind === 'agent' && previous?.kind !== 'agent';
          return (
            <div key={card.id} className="timeline-entry-wrap">
              {newTurn && index > 0 ? <div className="turn-divider"><span>New turn</span></div> : null}
              {shouldShowWorkDivider ? <div className="worked-divider"><span>Working</span></div> : null}
              <article
                className={`timeline-card codex-timeline-card ${card.kind} ${card.id === props.focusedCardId ? 'focused' : ''}`}
                onClick={() => props.onFocus(card.id)}
              >
                <div className="card-head codex-card-head">
                  <span className="kind"><span className="kind-icon">{kindIcon(card.kind)}</span>{label(card.kind)}</span>
                  <span className={`status ${card.status ?? 'idle'}`}>{statusLabel(card.status)}</span>
                </div>
                {card.kind === 'command' ? <CommandCard card={card} /> : card.kind === 'fileChange' ? <FileChangeCard card={card} /> : <GenericCard card={card} />}
              </article>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function GenericCard({ card }: { card: TimelineCard }) {
  return (
    <>
      <div className="card-title">{card.title}</div>
      {card.text ? <div className="message-text">{card.text}</div> : null}
      {!card.text && card.payload ? <pre className="json-snippet compact-json">{JSON.stringify(card.payload, null, 2)}</pre> : null}
    </>
  );
}

function label(kind: TimelineCard['kind']): string {
  switch (kind) {
    case 'agent': return 'Codex';
    case 'user': return 'You';
    case 'command': return 'Ran command';
    case 'fileChange': return 'File changed';
    case 'plan': return 'Plan';
    case 'reasoning': return 'Thinking';
    case 'tool': return 'Tool';
    case 'approval': return 'Approval';
    case 'error': return 'Error';
    case 'system': return 'System';
    default: return 'Event';
  }
}

function kindIcon(kind: TimelineCard['kind']): string {
  switch (kind) {
    case 'agent': return '✦';
    case 'user': return '●';
    case 'command': return '›';
    case 'fileChange': return '±';
    case 'plan': return '☑';
    case 'reasoning': return '…';
    case 'tool': return '⌁';
    default: return '·';
  }
}

function statusLabel(status?: string): string {
  if (!status || status === 'loaded') return 'ready';
  if (status === 'inProgress') return 'running';
  if (status === 'waiting_approval') return 'approval';
  return status.replace(/_/g, ' ');
}
