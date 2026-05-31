import { useMemo, useState } from 'react';
import type { ManagementTab, Project, ThreadSummary } from '../../shared/types.js';
import { Icon } from './Icon.js';

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
  onOpenManagementTab?: (tab: ManagementTab) => void;
}) {
  const [query, setQuery] = useState('');
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [cwd, setCwd] = useState('');
  const [name, setName] = useState('');
  const [savingProject, setSavingProject] = useState(false);

  const lower = query.trim().toLowerCase();
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
        <div className="codex-logo" aria-hidden="true">CP</div>
        <div>
          <div className="sidebar-brand">Codex Platform</div>
          <div className="sidebar-caption">Agent command center</div>
        </div>
      </div>

      <nav className="sidebar-primary-actions">
        <div className="sidebar-nav-group">
          <div className="sidebar-nav-label">Work</div>
          <button className="primary-nav" onClick={props.onNewThread}>
            <span className="nav-icon"><Icon name="chat" size={15} /></span>
            <span>New thread</span>
          </button>
        </div>
        <div className="sidebar-nav-group">
          <div className="sidebar-nav-label">Capabilities</div>
          <button className="primary-nav" onClick={() => props.onOpenManagementTab?.('skills')}>
            <span className="nav-icon"><Icon name="spark" size={15} /></span>
            <span>Skills</span>
          </button>
          <button className="primary-nav" onClick={() => props.onOpenManagementTab?.('agents')}>
            <span className="nav-icon"><Icon name="agent" size={15} /></span>
            <span>Agents</span>
          </button>
          <button className="primary-nav" onClick={() => props.onOpenManagementTab?.('automations')}>
            <span className="nav-icon"><Icon name="automation" size={15} /></span>
            <span>Automations</span>
          </button>
          <button className="primary-nav" onClick={() => props.onOpenManagementTab?.('triage')}>
            <span className="nav-icon"><Icon name="inbox" size={15} /></span>
            <span>Triage</span>
          </button>
        </div>
      </nav>

      <section className="sidebar-search-block sidebar-search-shell">
        <Icon name="search" size={14} />
        <input className="sidebar-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
      </section>

      <section className="thread-section project-tree-section">
        <div className="section-title row">
          <span>Threads</span>
          <span className="row-actions">
            <button className="small ghost icon-only" disabled={!props.onRefreshThreads} onClick={() => void props.onRefreshThreads?.()} title="Reload thread list" aria-label="Reload thread list"><Icon name="refresh" size={13} /></button>
            <button
              className="small ghost icon-only add-project-button"
              onClick={() => setNewProjectOpen((value) => !value)}
              title={newProjectOpen ? 'Close add project form' : 'Add project'}
              aria-label={newProjectOpen ? 'Close add project form' : 'Add project'}
            >
              <Icon name={newProjectOpen ? 'close' : 'plus'} size={13} />
            </button>
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
                <span className="folder-icon"><Icon name="folder" size={15} /></span>
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
                        <span className="thread-meta-line">{threadMeta(thread.status, thread.updatedAt ?? thread.createdAt)}</span>
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
        <button className="settings-row" onClick={() => props.onOpenManagementTab?.('settings')}>
          <span className="nav-icon"><Icon name="settings" size={15} /></span>
          <span>Settings</span>
        </button>
      </section>
    </aside>
  );
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
  if (status === 'idle') return 'ready';
  if (status === 'waiting_approval') return 'approval';
  if (status === 'inProgress') return 'running';
  return status.replace(/_/g, ' ');
}

function threadMeta(status: string | undefined, value?: number): string {
  const when = timeAgo(value);
  const state = shortStatus(status);
  return state === 'ready' ? when : `${state} · ${when}`;
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
