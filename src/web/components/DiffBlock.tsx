import { Icon } from './Icon.js';

export type DiffLineSelection = {
  lineNumber: number;
  text: string;
  kind: string;
};

export function DiffBlock({
  diff,
  compact = false,
  activeLine,
  onSelectLine
}: {
  diff?: string;
  compact?: boolean;
  activeLine?: number;
  onSelectLine?: (line: DiffLineSelection) => void;
}) {
  const text = diff || '';
  if (!text) return <div className="empty">No diff content.</div>;
  const lines = text.split('\n');
  const visible = compact && lines.length > 28 ? lines.slice(0, 28) : lines;
  return (
    <div className={`diff-block codex-diff-block ${compact ? 'compact' : ''}`}>
      {visible.map((line, index) => {
        const lineNumber = index + 1;
        const kind = lineClass(line);
        return (
          <div key={`${index}:${line}`} className={`diff-line ${kind} ${activeLine === lineNumber ? 'selected' : ''}`}>
            {onSelectLine ? (
              <button
                type="button"
                className="diff-comment-hook"
                title="Add review finding"
                aria-label={`Add review finding for diff line ${lineNumber}`}
                onClick={() => onSelectLine({ lineNumber, text: line, kind })}
              >
                <Icon name="plus" size={12} />
              </button>
            ) : (
              <span className="diff-comment-hook" title="Inline review comments can be wired here"><Icon name="plus" size={12} /></span>
            )}
            <span className="diff-lineno">{lineNumber}</span>
            <span className="diff-code">{line || ' '}</span>
          </div>
        );
      })}
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
