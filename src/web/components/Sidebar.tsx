import { useMemo, useState } from 'react';
import type { InspectorTab, Project, ThreadSummary } from '../../shared/types.js';

export function Sidebar(props: {
  projects: Project[];
  threads: ThreadSummary[];
  selectedProjectId?: string;
  selectedThreadId?: string;
  onSelectProject: (projectId: string) => void;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onAddProject?: (input: { cwd: string; name?: string }) => Promise<void>;
  onNewProject?: (cwd: string, name?: string) => Promise<void>;
  onRefreshThreads?: () => Promise<void>;
  onOpenInspectorTab?: (tab: InspectorTab) => void;
}) {
  const [query, setQuery] = useState('');
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [cwd, setCwd] = useState('');
  const [name, setName] = useState('');
  const [savingProject, setSavingProject] = useState(false);

  const lower = query.trim().toLowerCase();
  const activeThreads = useMemo(() => props.threads
    .filter((thread) => isThreadActive(thread.status))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 5), [props.threads]);

  const projectsWithThreads = useMemo(() => props.projects.map((project) => ({
    project,
    threads: props.threads
      .filter((thread) => thread.projectId === project.id || thread.projectId === 'default')
      .filter((thread) => !lower || `${project.name} ${thread.name ?? ''} ${thread.preview ?? ''} ${thread.id} ${thread.status ?? ''}`.toLowerCase().includes(lower))
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))
  })), [props.projects, props.threads, lower]);

  async function submitProject() {
    const trimmed = cwd.trim();
    if (!trimmed) return;
    setSavingProject(true);
    try {
      if (props.onAddProject) await props.onAddProject({ cwd: trimmed, name: name.trim() || undefined });
      else if (props.onNewProject) await props.onNewProject(trimmed, name.trim() || undefined);
      setCwd('');
      setName('');
      setNewProjectOpen(false);
    } finally {
      setSavingProject(false);
    }
  }

  return (
    <aside className="sidebar codex-sidebar">
      <div className="sidebar-head">
        <div className="codex-logo" aria-hidden="true">✦</div>
        <div>
          <div className="sidebar-brand">Codex</div>
          <div className="sidebar-caption">Standalone web UI</div>
        </div>
      </div>

      <nav className="sidebar-primary-actions">
        <button className="primary-nav" onClick={props.onNewThread}>
          <span className="nav-icon">＋</span>
          <span>New thread</span>
        </button>
        <button className="primary-nav" disabled title="Automation runtime is not wired yet">
          <span className="nav-icon">⌁</span>
          <span>Automations</span>
        </button>
        <button className="primary-nav" onClick={() => props.onOpenInspectorTab?.('skills')}>
          <span className="nav-icon">◇</span>
          <span>Skills</span>
        </button>
        <button className="primary-nav" onClick={() => props.onOpenInspectorTab?.('agents')}>
          <span className="nav-icon">◎</span>
          <span>Agents</span>
        </button>
      </nav>

      {activeThreads.length > 0 ? (
        <section className="active-thread-strip">
          {activeThreads.map((thread) => (
            <button key={thread.id} className={`queue-row ${thread.id === props.selectedThreadId ? 'active' : ''}`} onClick={() => props.onSelectThread(thread.id)}>
              <span className={`queue-indicator ${statusClass(thread.status)}`} />
              <span className="queue-title">{thread.name || thread.preview || compactThreadId(thread.id)}</span>
              <span className={`queue-status ${statusClass(thread.status)}`}>{shortStatus(thread.status)}</span>
            </button>
          ))}
        </section>
      ) : null}

      <section className="sidebar-search-block">
        <input className="sidebar-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects and threads" />
      </section>

      <section className="thread-section project-tree-section">
        <div className="section-title row">
          <span>Threads</span>
          <span className="row-actions">
            <button className="small ghost" disabled={!props.onRefreshThreads} onClick={() => void props.onRefreshThreads?.()} title="Reload thread list">↻</button>
            <button className="small ghost" onClick={() => setNewProjectOpen((value) => !value)}>{newProjectOpen ? 'Close' : 'Add project'}</button>
          </span>
        </div>

        {newProjectOpen ? (
          <div className="inline-form project-add-card">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name, optional" />
            <input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="/absolute/path/to/repo" />
            <button className="primary" disabled={savingProject || !cwd.trim()} onClick={submitProject}>{savingProject ? 'Adding…' : 'Add project'}</button>
          </div>
        ) : null}

        <div className="project-tree">
          {projectsWithThreads.map(({ project, threads }) => (
            <div key={project.id} className="project-node">
              <button
                className={`project-row ${project.id === props.selectedProjectId ? 'active' : ''}`}
                onClick={() => props.onSelectProject(project.id)}
                title={project.cwd}
              >
                <span className="folder-icon">▱</span>
                <span className="project-name">{project.name}</span>
                <span className="project-count">{threads.length || '—'}</span>
              </button>
              {project.id === props.selectedProjectId ? (
                <div className="project-thread-list">
                  {threads.length === 0 ? <div className="empty-mini">No threads yet</div> : null}
                  {threads.map((thread) => (
                    <button
                      key={thread.id}
                      className={`thread-item codex-thread-row ${thread.id === props.selectedThreadId ? 'active' : ''}`}
                      onClick={() => props.onSelectThread(thread.id)}
                    >
                      <span className={`thread-dot ${statusClass(thread.status)}`} />
                      <span className="thread-labels">
                        <span className="thread-title">{thread.name || thread.preview || compactThreadId(thread.id)}</span>
                        <span className="thread-meta-line">{shortStatus(thread.status)} · {timeAgo(thread.updatedAt ?? thread.createdAt)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="sidebar-footer codex-sidebar-footer">
        <button className="settings-row" onClick={() => props.onOpenInspectorTab?.('settings')}>
          <span className="nav-icon">⚙</span>
          <span>Settings</span>
        </button>
      </section>
    </aside>
  );
}

function isThreadActive(status?: string): boolean {
  const s = String(status ?? '').toLowerCase();
  return s.includes('running') || s.includes('active') || s.includes('approval') || s.includes('progress');
}

function shortPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.length <= 2 ? path : `…/${parts.slice(-2).join('/')}`;
}

function compactThreadId(id: string): string {
  return id.replace(/^thr_/, '').slice(-10);
}

function statusClass(status?: string): string {
  return (status ?? 'idle').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function shortStatus(status?: string): string {
  if (!status) return 'ready';
  if (status === 'loaded') return 'ready';
  if (status === 'waiting_approval') return 'approval';
  if (status === 'inProgress') return 'running';
  return status.replace(/_/g, ' ');
}

function timeAgo(value?: number): string {
  if (!value) return 'now';
  const delta = Math.max(0, Date.now() - value);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
