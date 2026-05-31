import type { GitStatusSummary, Project, ServerHealth, ThreadSummary } from '../../shared/types.js';
import { Icon } from './Icon.js';

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
  const threadLabel = props.thread?.name || props.thread?.preview || (props.thread?.id ? compactThreadId(props.thread.id) : undefined);
  const toggleInspector = () => {
    if (!inspectorVisible && props.onOpenReview) props.onOpenReview();
    else props.onToggleInspector();
  };

  return (
    <header className="topbar app-frame-bar web-topbar">
      <div className="topbar-product" aria-label="Codex Platform navigation">
        <button className="icon-button frame-toggle" onClick={props.onToggleSidebar} title="Toggle sidebar" aria-label="Toggle sidebar">
          <Icon name={sidebarVisible ? 'sidebarLeft' : 'sidebarRight'} size={15} />
        </button>
        <div className="topbar-product-copy">
          <span className="topbar-product-name">Codex Platform</span>
          <span className="topbar-product-tagline">Multi-agent Codex workspace</span>
        </div>
      </div>

      <div className="frame-breadcrumb" title={props.project?.cwd}>
        <span className="breadcrumb-project">{props.project?.name ?? 'Choose project'}</span>
        {threadLabel ? (
          <>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-thread">{threadLabel}</span>
          </>
        ) : null}
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
        <button className={`ghost compact-action icon-only activity-button ${props.pendingApprovals ? 'attention' : ''}`} onClick={props.onOpenActivity} title="Open activity center" aria-label="Open activity center">
          <Icon name="clock" size={15} />
          {props.pendingApprovals ? <span className="top-badge">{props.pendingApprovals}</span> : null}
        </button>
        {isRunning ? <button className="ghost compact-action icon-only stop-action" onClick={props.onInterrupt} disabled={props.busy} title="Interrupt" aria-label="Interrupt"><Icon name="stop" size={13} /></button> : null}
        <button className="ghost compact-action icon-only panel-toggle" onClick={toggleInspector} title={inspectorVisible ? 'Hide side panel' : 'Open review panel'} aria-label={inspectorVisible ? 'Hide side panel' : 'Open review panel'}><Icon name="panel" size={15} /></button>
        {props.onLogout ? <button className="ghost compact-action" onClick={props.onLogout}>Lock</button> : null}
        <button className="ghost compact-action icon-only new-thread-action" onClick={props.onNewThread} disabled={props.busy || !props.project} title="New thread" aria-label="New thread"><Icon name="plus" size={15} /></button>
      </div>
    </header>
  );
}

function compactThreadId(id: string): string {
  return id.replace(/^thr_/, '').slice(-10);
}
