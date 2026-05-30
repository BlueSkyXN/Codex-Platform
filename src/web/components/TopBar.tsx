import type { GitStatusSummary, Project, ServerHealth, ThreadSummary } from '../../shared/types.js';

function running(status?: string): boolean {
  const s = String(status ?? '').toLowerCase();
  return s.includes('running') || s.includes('active') || s.includes('progress') || s.includes('approval');
}

export function TopBar(props: {
  project?: Project;
  thread?: ThreadSummary;
  connected: boolean;
  connectionMessage?: string;
  demoMode: boolean;
  busy: boolean;
  health?: ServerHealth;
  gitStatus?: GitStatusSummary;
  sidebarVisible?: boolean;
  inspectorVisible?: boolean;
  showSidebar?: boolean;
  showInspector?: boolean;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onNewThread: () => void;
  onInterrupt: () => void;
  onOpenReview?: () => void;
  onOpenActivity?: () => void;
  onOpenCommandPalette?: () => void;
  pendingApprovals?: number;
  onLogout?: () => void;
}) {
  const isRunning = running(props.thread?.status);
  const sidebarVisible = props.sidebarVisible ?? props.showSidebar ?? true;
  const inspectorVisible = props.inspectorVisible ?? props.showInspector ?? true;
  const appServer = props.health?.appServer ?? (props.demoMode ? 'demo' : 'starting');
  const ready = props.health?.ready || props.demoMode;
  const toggleInspector = () => {
    if (!inspectorVisible && props.onOpenReview) props.onOpenReview();
    else props.onToggleInspector();
  };

  return (
    <header className="topbar app-frame-bar">
      <div className="window-controls" aria-label="Window controls">
        <span className="traffic-dot close" />
        <span className="traffic-dot minimize" />
        <span className="traffic-dot zoom" />
        <button className="icon-button frame-toggle" onClick={props.onToggleSidebar} title="Toggle sidebar">{sidebarVisible ? '◧' : '◨'}</button>
      </div>

      <div className="frame-breadcrumb" title={props.project?.cwd}>
        <span className="breadcrumb-project">{props.project?.name ?? 'Choose project'}</span>
      </div>

      <div className="frame-runtime" title={props.connectionMessage}>
        <span className={`runtime-dot ${props.connected ? 'ok' : 'warn'}`} />
        <span>{props.connected ? 'Live' : 'Reconnecting'}</span>
        <span className="runtime-muted">·</span>
        <span className={ready ? 'runtime-ok' : 'runtime-warn'}>{appServer}</span>
        {props.gitStatus?.isRepo ? <span className="runtime-pill branch">{props.gitStatus.branch ?? 'git'}</span> : null}
        {props.demoMode ? <span className="runtime-pill">demo</span> : null}
      </div>

      <div className="top-actions codex-actions">
        <button className="ghost compact-action command-button" onClick={props.onOpenCommandPalette} title="Command menu (⌘K)">⌘K</button>
        <button className={`ghost compact-action activity-button ${props.pendingApprovals ? 'attention' : ''}`} onClick={props.onOpenActivity} title="Open activity center" aria-label="Open activity center">
          <span aria-hidden="true">◷</span>
          {props.pendingApprovals ? <span className="top-badge">{props.pendingApprovals}</span> : null}
        </button>
        {isRunning ? <button className="ghost compact-action stop-action" onClick={props.onInterrupt} disabled={props.busy} title="Interrupt" aria-label="Interrupt">■</button> : null}
        <button className="ghost compact-action panel-toggle" onClick={toggleInspector} title={inspectorVisible ? 'Hide side panel' : 'Open review panel'} aria-label={inspectorVisible ? 'Hide side panel' : 'Open review panel'}>▤</button>
        <button className="ghost compact-action" disabled title="Requires Git integration">Open</button>
        <button className="ghost compact-action" disabled title="Requires worktree handoff implementation">Hand off</button>
        <button className="ghost compact-action" disabled title="Requires Git integration">Commit</button>
        {props.onLogout ? <button className="ghost compact-action" onClick={props.onLogout}>Lock</button> : null}
        <button className="ghost compact-action new-thread-action" onClick={props.onNewThread} disabled={props.busy || !props.project} title="New thread" aria-label="New thread">＋</button>
      </div>
    </header>
  );
}
