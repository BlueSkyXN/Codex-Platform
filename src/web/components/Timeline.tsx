import { useEffect, useMemo, useRef, useState } from 'react';
import type { TimelineCard, TimelineCardKind } from '../../shared/types.js';
import { CommandCard, FileChangeCard } from './cards.js';
import { Icon, type IconName } from './Icon.js';

const kindFilters: Array<'all' | TimelineCardKind> = ['all', 'agent', 'command', 'fileChange', 'plan', 'tool', 'reasoning'];

export function Timeline(props: { cards: TimelineCard[]; focusedCardId?: string; projectName?: string; onFocus: (cardId: string) => void }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | TimelineCardKind>('all');
  const [toolsOpen, setToolsOpen] = useState(false);
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
  const filtersActive = query.trim().length > 0 || kind !== 'all';
  const toolbarExpanded = toolsOpen || filtersActive;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [props.cards.length, props.cards.at(-1)?.updatedAt]);

  return (
    <div className="timeline-shell codex-timeline-shell">
      {props.cards.length > 0 ? (
        <div className={`timeline-toolbar codex-timeline-toolbar ${toolbarExpanded ? 'expanded' : 'collapsed'}`}>
          <div className="timeline-toolbar-main">
            <button className={`thread-tool-button ${toolbarExpanded ? 'active' : ''}`} onClick={() => setToolsOpen((value) => !value)} title="Find and filter thread" aria-label="Find and filter thread"><Icon name="search" size={14} /></button>
            <span className="timeline-count">{filtersActive ? `${filteredCards.length}/${props.cards.length}` : `${props.cards.length} events`}</span>
          </div>
          {toolbarExpanded ? (
            <div className="timeline-filter-panel">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find in thread" />
              <div className="filter-row compact-filter-row">
                {kindFilters.map((item) => (
                  <button key={item} className={`filter-chip ${kind === item ? 'active' : ''}`} onClick={() => setKind(item)}>
                    {item === 'all' ? 'All' : label(item)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="timeline codex-timeline">
        {props.cards.length === 0 ? (
          <div className="empty-state codex-empty-state">
            <div className="empty-title">What should we build in {props.projectName ?? 'this project'}?</div>
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
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    props.onFocus(card.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-current={card.id === props.focusedCardId ? 'true' : undefined}
              >
                <div className="card-head codex-card-head">
                  <span className="kind"><span className="kind-icon"><Icon name={kindIcon(card.kind)} size={13} /></span>{label(card.kind)}</span>
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

function kindIcon(kind: TimelineCard['kind']): IconName {
  switch (kind) {
    case 'agent': return 'agent';
    case 'user': return 'user';
    case 'command': return 'terminal';
    case 'fileChange': return 'file';
    case 'plan': return 'check';
    case 'reasoning': return 'clock';
    case 'tool': return 'tool';
    default: return 'dot';
  }
}

function statusLabel(status?: string): string {
  if (!status || status === 'loaded') return 'ready';
  if (status === 'inProgress') return 'running';
  if (status === 'waiting_approval') return 'approval';
  return status.replace(/_/g, ' ');
}
