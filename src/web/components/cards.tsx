import { useState } from 'react';
import type { TimelineCard } from '../../shared/types.js';
import { DiffBlock } from './DiffBlock.js';
import { Icon } from './Icon.js';

export function CommandCard({ card }: { card: TimelineCard }) {
  const [expanded, setExpanded] = useState(card.status === 'failed' || card.status === 'running' || card.status === 'waiting_approval');
  const output = [card.stdout, card.stderr].filter(Boolean).join(card.stdout && card.stderr ? '\n' : '');
  const exitStatus = card.exitCode === null || card.exitCode === undefined ? undefined : card.exitCode === 0 ? 'ok' : 'bad';
  return (
    <div className="command-card codex-command-card">
      <div className="command-line-wrap">
        <span className="prompt-mark">$</span>
        <div className="card-title mono command-line">{card.command || card.title}</div>
      </div>
      <div className="card-meta-row compact-meta">
        {card.cwd ? <span className="subtle mono">{card.cwd}</span> : <span className="subtle">No cwd provided</span>}
        <div className="card-actions-inline">
          {exitStatus ? <span className={`exit-pill ${exitStatus}`}>exit {card.exitCode}</span> : null}
          <button className="small ghost" onClick={(event) => { event.stopPropagation(); void navigator.clipboard?.writeText(card.command || card.title); }}>Copy</button>
        </div>
      </div>
      {output ? (
        <>
          {expanded ? <pre className="terminal-output codex-terminal-output">{output}</pre> : <div className="terminal-preview mono">{output.split('\n').slice(0, 3).join('\n')}</div>}
          <button className="small text-button output-toggle" onClick={(event) => { event.stopPropagation(); setExpanded((value) => !value); }}>
            {expanded ? 'Hide output' : 'Show output'}
          </button>
        </>
      ) : (
        <div className="subtle command-muted">Waiting for output…</div>
      )}
    </div>
  );
}

export function FileChangeCard({ card }: { card: TimelineCard }) {
  const [expanded, setExpanded] = useState(false);
  const diff = card.diff || JSON.stringify(card.payload ?? {}, null, 2);
  const stats = diffStats(diff);
  return (
    <div className="file-card codex-file-card">
      <div className="file-change-header">
        <div className="file-change-main">
          <span className="file-icon"><Icon name="file" size={15} /></span>
          <span className="file-change-title">{card.filePath ?? card.title}</span>
        </div>
        <span className="change-stats"><span className="add-stat">+{stats.added}</span> <span className="del-stat">-{stats.removed}</span></span>
      </div>
      {card.filePath && card.filePath !== card.title ? <div className="mono subtle file-path-line">{card.title}</div> : null}
      {diff ? (expanded ? <DiffBlock diff={diff} /> : <DiffBlock diff={diff} compact />) : null}
      <div className="file-card-actions">
        <button className="small ghost" onClick={(event) => { event.stopPropagation(); setExpanded((value) => !value); }}>
          {expanded ? 'Collapse diff' : 'Open diff'}
        </button>
      </div>
    </div>
  );
}

function diffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added += 1;
    if (line.startsWith('-')) removed += 1;
  }
  return { added, removed };
}
