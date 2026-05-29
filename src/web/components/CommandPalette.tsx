import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { InspectorTab, Project, ThreadSummary } from '../../shared/types.js';

type PaletteAction = {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void | Promise<void>;
};

export function CommandPalette(props: {
  open: boolean;
  projects: Project[];
  threads: ThreadSummary[];
  selectedProjectId?: string;
  selectedThreadId?: string;
  onClose: () => void;
  onNewThread: () => void | Promise<void>;
  onRefreshThreads: () => void | Promise<void>;
  onReloadSkills: () => void | Promise<void>;
  onSelectProject: (projectId: string) => void;
  onSelectThread: (threadId: string) => void | Promise<void>;
  onOpenInspectorTab: (tab: InspectorTab) => void;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onOpenActivity: () => void;
  onLogout?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setQuery('');
    setActiveIndex(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [props.open]);

  const actions = useMemo<PaletteAction[]>(() => {
    const base: PaletteAction[] = [
      { id: 'new-thread', group: 'Actions', title: 'New thread', subtitle: 'Start a new Codex thread in the selected project', shortcut: '⌘N', disabled: !props.selectedProjectId, run: props.onNewThread },
      { id: 'refresh-threads', group: 'Actions', title: 'Refresh threads', subtitle: 'Ask codex app-server for the latest thread list', run: props.onRefreshThreads },
      { id: 'reload-skills', group: 'Actions', title: 'Reload skills', subtitle: 'Force Codex to rediscover available skills for this project', run: props.onReloadSkills },
      { id: 'activity', group: 'Navigation', title: 'Open activity center', subtitle: 'Approvals, running threads, recent events', run: props.onOpenActivity },
      { id: 'review', group: 'Navigation', title: 'Open review pane', subtitle: 'Changed files, approvals, focused item', run: () => props.onOpenInspectorTab('review') },
      { id: 'diff', group: 'Navigation', title: 'Open diff pane', subtitle: 'Review reported file changes', shortcut: '⌘⇧I', run: () => props.onOpenInspectorTab('diff') },
      { id: 'terminal', group: 'Navigation', title: 'Open terminal pane', subtitle: 'Commands and outputs from the thread', shortcut: '⌘J', run: () => props.onOpenInspectorTab('terminal') },
      { id: 'files', group: 'Navigation', title: 'Open files pane', subtitle: 'Browse the active project without leaving Codex-Platform', run: () => props.onOpenInspectorTab('files') },
      { id: 'git', group: 'Navigation', title: 'Open Git pane', subtitle: 'Inspect branch and working tree status', run: () => props.onOpenInspectorTab('git') },
      { id: 'skills', group: 'Navigation', title: 'Open skills pane', subtitle: 'Available project/user/admin skills', run: () => props.onOpenInspectorTab('skills') },
      { id: 'agents', group: 'Navigation', title: 'Open custom agents pane', subtitle: 'Project and user .codex/agents TOML presets', run: () => props.onOpenInspectorTab('agents') },
      { id: 'settings', group: 'Navigation', title: 'Open settings pane', subtitle: 'Runtime, workspace, auth, notification settings', run: () => props.onOpenInspectorTab('settings') },
      { id: 'toggle-sidebar', group: 'Layout', title: 'Toggle sidebar', subtitle: 'Show or hide project/thread navigation', shortcut: '⌘B', run: props.onToggleSidebar },
      { id: 'toggle-inspector', group: 'Layout', title: 'Toggle side panel', subtitle: 'Show or hide review/terminal/artifacts pane', shortcut: '⌘⌥B', run: props.onToggleInspector },
      { id: 'copy-thread', group: 'Utilities', title: 'Copy current thread id', subtitle: props.selectedThreadId ?? 'No selected thread', disabled: !props.selectedThreadId, run: () => void navigator.clipboard?.writeText(props.selectedThreadId ?? '') },
      { id: 'copy-project-path', group: 'Utilities', title: 'Copy project path', subtitle: props.projects.find((project) => project.id === props.selectedProjectId)?.cwd ?? 'No selected project', disabled: !props.selectedProjectId, run: () => void navigator.clipboard?.writeText(props.projects.find((project) => project.id === props.selectedProjectId)?.cwd ?? '') }
    ];
    if (props.onLogout) {
      base.push({ id: 'lock', group: 'Security', title: 'Lock Codex-Platform', subtitle: 'Clear the local Codex-Platform token', run: props.onLogout });
    }
    const projectActions = props.projects.map<PaletteAction>((project) => ({
      id: `project-${project.id}`,
      group: 'Projects',
      title: `Switch project: ${project.name}`,
      subtitle: project.cwd,
      run: () => props.onSelectProject(project.id)
    }));
    const threadActions = [...props.threads]
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))
      .slice(0, 24)
      .map<PaletteAction>((thread) => ({
        id: `thread-${thread.id}`,
        group: 'Threads',
        title: thread.name || thread.preview || compactThreadId(thread.id),
        subtitle: `${thread.status ?? 'idle'} · ${compactThreadId(thread.id)}`,
        run: () => props.onSelectThread(thread.id)
      }));
    return [...base, ...projectActions, ...threadActions];
  }, [props]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return actions;
    return actions.filter((action) => `${action.title} ${action.subtitle ?? ''} ${action.group}`.toLowerCase().includes(needle));
  }, [actions, query]);

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [activeIndex, filtered.length]);

  if (!props.open) return null;

  async function run(action?: PaletteAction) {
    if (!action || action.disabled) return;
    await action.run();
    props.onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onClose();
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, filtered.length - 1)));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void run(filtered[activeIndex]);
    }
  }

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={props.onClose}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command menu" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-input-row">
          <span className="palette-icon">⌘</span>
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder="Search commands, projects, threads…" />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-results">
          {filtered.length === 0 ? <div className="palette-empty">No matching command.</div> : null}
          {filtered.map((action, index) => {
            const showGroup = index === 0 || filtered[index - 1]?.group !== action.group;
            return (
              <div key={action.id}>
                {showGroup ? <div className="palette-group">{action.group}</div> : null}
                <button className={`palette-row ${index === activeIndex ? 'active' : ''}`} disabled={action.disabled} onMouseEnter={() => setActiveIndex(index)} onClick={() => void run(action)}>
                  <span className="palette-row-main">
                    <strong>{action.title}</strong>
                    {action.subtitle ? <span>{action.subtitle}</span> : null}
                  </span>
                  {action.shortcut ? <kbd>{action.shortcut}</kbd> : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function compactThreadId(id: string): string {
  return id.replace(/^thr_/, '').slice(-12) || id;
}
