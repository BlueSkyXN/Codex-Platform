import { Icon } from './Icon.js';

export function DiffBlock({ diff, compact = false }: { diff?: string; compact?: boolean }) {
  const text = diff || '';
  if (!text) return <div className="empty">No diff content.</div>;
  const lines = text.split('\n');
  const visible = compact && lines.length > 28 ? lines.slice(0, 28) : lines;
  return (
    <div className={`diff-block codex-diff-block ${compact ? 'compact' : ''}`}>
      {visible.map((line, index) => (
        <div key={`${index}:${line}`} className={`diff-line ${lineClass(line)}`}>
          <span className="diff-comment-hook" title="Inline review comments can be wired here"><Icon name="plus" size={12} /></span>
          <span className="diff-lineno">{index + 1}</span>
          <span className="diff-code">{line || ' '}</span>
        </div>
      ))}
      {visible.length < lines.length ? <div className="diff-more">{lines.length - visible.length} more lines hidden</div> : null}
    </div>
  );
}

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'meta';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  if (line.startsWith('diff --git')) return 'meta';
  return 'ctx';
}
