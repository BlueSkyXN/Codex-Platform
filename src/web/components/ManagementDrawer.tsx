import { useState } from 'react';
import type { AccountSummary, AgentSummary, AdminStatus, ApprovalRecord, ApprovalRequest, CodexWebConfig, GitHubActionsSummary, GitOperationRecord, GitStatusSummary, InspectorTab, ManagementTab, ServerHealth, SkillSummary, ThreadSummary, TimelineCard } from '../../shared/types.js';
import { Icon } from './Icon.js';

const managementTabs: ManagementTab[] = ['skills', 'agents', 'admin', 'automations', 'triage', 'settings'];

type ReleaseEvidenceSummary = {
  state: 'ready' | 'waiting' | 'attention';
  label: 'verified' | 'partial' | 'attention';
  detail: string;
};

export function ManagementDrawer(props: {
  open: boolean;
  tab: ManagementTab;
  skills: SkillSummary[];
  agents: AgentSummary[];
  skillsLoading?: boolean;
  agentsLoading?: boolean;
  skillsError?: string;
  agentsError?: string;
  account?: AccountSummary;
  health?: ServerHealth;
  adminStatus?: AdminStatus;
  adminLoading?: boolean;
  adminError?: string;
  githubActions?: GitHubActionsSummary;
  gitStatus?: GitStatusSummary;
  codexWebConfig?: CodexWebConfig;
  approvals: ApprovalRequest[];
  approvalHistory: ApprovalRecord[];
  gitOperations: GitOperationRecord[];
  threads: ThreadSummary[];
  cards: TimelineCard[];
  errors: string[];
  notificationsEnabled: boolean;
  notificationsSupported: boolean;
  onClose: () => void;
  onTabChange: (tab: ManagementTab) => void;
  onRefreshSkills?: () => void;
  onRefreshAdmin?: () => void;
  onUseSkill?: (skill: SkillSummary) => void;
  onUseAgent?: (agent: AgentSummary) => void;
  onToggleNotifications?: (enabled: boolean) => void;
  onOpenInspectorTab?: (tab: InspectorTab) => void;
  onSelectThread?: (threadId: string) => void | Promise<void>;
}) {
  if (!props.open) return null;

  return (
    <div className="management-backdrop" role="presentation" onMouseDown={props.onClose}>
      <aside className="management-drawer" role="dialog" aria-modal="true" aria-label="Management" onMouseDown={(event) => event.stopPropagation()}>
        <header className="management-head">
          <div>
            <div className="section-title">Management</div>
            <h2>{tabTitle(props.tab)}</h2>
          </div>
          <button className="icon-button" onClick={props.onClose} title="Close management" aria-label="Close management"><Icon name="close" size={15} /></button>
        </header>

        <nav className="management-tabs" aria-label="Management sections">
          {managementTabs.map((tab) => (
            <button key={tab} className={`tab ${props.tab === tab ? 'active' : ''}`} onClick={() => props.onTabChange(tab)}>{tabLabel(tab)}</button>
          ))}
        </nav>

        {props.tab === 'skills' ? <SkillsRegistry skills={props.skills} loading={Boolean(props.skillsLoading)} error={props.skillsError} onRefresh={props.onRefreshSkills} onUseSkill={props.onUseSkill} /> : null}
        {props.tab === 'agents' ? <AgentsRegistry agents={props.agents} loading={Boolean(props.agentsLoading)} error={props.agentsError} onRefresh={props.onRefreshSkills} onUseAgent={props.onUseAgent} /> : null}
        {props.tab === 'admin' ? <AdminControlPanel status={props.adminStatus} loading={Boolean(props.adminLoading)} error={props.adminError} onRefresh={props.onRefreshAdmin} /> : null}
        {props.tab === 'automations' ? (
          <AutomationsPanel
            threads={props.threads}
            approvals={props.approvals}
            gitOperations={props.gitOperations}
            gitStatus={props.gitStatus}
            githubActions={props.githubActions}
            health={props.health}
            onOpenInspectorTab={props.onOpenInspectorTab}
          />
        ) : null}
        {props.tab === 'triage' ? (
          <TriagePanel
            approvals={props.approvals}
            approvalHistory={props.approvalHistory}
            gitOperations={props.gitOperations}
            threads={props.threads}
            cards={props.cards}
            errors={props.errors}
            gitStatus={props.gitStatus}
            githubActions={props.githubActions}
            health={props.health}
            onOpenInspectorTab={props.onOpenInspectorTab}
            onSelectThread={props.onSelectThread}
          />
        ) : null}
        {props.tab === 'settings' ? (
          <RuntimeSettings
            health={props.health}
            githubActions={props.githubActions}
            gitStatus={props.gitStatus}
            codexWebConfig={props.codexWebConfig}
            account={props.account}
            notificationsEnabled={props.notificationsEnabled}
            notificationsSupported={props.notificationsSupported}
            onToggleNotifications={props.onToggleNotifications}
          />
        ) : null}
      </aside>
    </div>
  );
}

function SkillsRegistry(props: { skills: SkillSummary[]; loading: boolean; error?: string; onRefresh?: () => void; onUseSkill?: (skill: SkillSummary) => void }) {
  const stats = skillStats(props.skills);
  return (
    <section className="management-panel skills-panel">
      <div className="pane-header">
        <div>
          <div className="section-title">Skills registry</div>
          <div className="subtle">Capabilities discovered for this workspace through app-server.</div>
        </div>
        <button className="small ghost" onClick={props.onRefresh} disabled={props.loading || !props.onRefresh}>{props.loading ? 'Loading...' : 'Reload'}</button>
      </div>
      <CapabilitySummary
        items={[
          { label: 'Ready', value: String(stats.ready), tone: 'ok' },
          { label: 'Attention', value: String(stats.attention), tone: stats.attention ? 'warn' : undefined },
          { label: 'Sources', value: String(stats.sources) }
        ]}
      />
      {props.error ? <CapabilityError message={props.error} /> : null}
      {props.skills.length === 0 ? <div className="empty">No skills returned for this project.</div> : null}
      <div className="skill-table management-list">
        {props.skills.map((skill) => (
          <article key={skill.id} className={`skill-row ${skill.enabled === false ? 'disabled' : ''}`}>
            <span className="skill-row-icon"><Icon name="spark" size={15} /></span>
            <div>
              <strong>{skill.name}</strong>
              {skill.description ? <p>{skill.description}</p> : null}
              {skill.diagnostic ? <p className="capability-diagnostic">{skill.diagnostic}</p> : null}
              {skill.path ? <code className="agent-path" title={skill.path}>{skill.path}</code> : null}
            </div>
            <div className="capability-state-stack">
              <span className={`capability-state ${capabilityState(skill)}`}>{capabilityStateLabel(capabilityState(skill))}</span>
              <span className="skill-scope">{skillScopeLabel(skill)}</span>
              <button className="mini-action capability-use" disabled={skill.enabled === false || !props.onUseSkill} onClick={() => props.onUseSkill?.(skill)}>Use</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AgentsRegistry(props: { agents: AgentSummary[]; loading: boolean; error?: string; onRefresh?: () => void; onUseAgent?: (agent: AgentSummary) => void }) {
  const repoAgents = props.agents.filter((agent) => agent.scope === 'repo');
  const userAgents = props.agents.filter((agent) => agent.scope !== 'repo');
  const stats = agentStats(props.agents);
  return (
    <section className="management-panel agents-panel">
      <div className="pane-header">
        <div>
          <div className="section-title">Codex agents registry</div>
          <div className="subtle">Project and user agents available for multi-agent delegation.</div>
        </div>
        <button className="small ghost" onClick={props.onRefresh} disabled={props.loading || !props.onRefresh}>{props.loading ? 'Loading...' : 'Reload'}</button>
      </div>
      <CapabilitySummary
        items={[
          { label: 'Project', value: String(stats.repo) },
          { label: 'User', value: String(stats.user) },
          { label: 'Attention', value: String(stats.attention), tone: stats.attention ? 'warn' : undefined }
        ]}
      />
      {props.error ? <CapabilityError message={props.error} /> : null}
      {props.agents.length === 0 ? <div className="empty">No configured Codex agents found. Built-in agents such as explorer and worker can still be requested in natural language.</div> : null}
      <AgentGroup title="Project Codex agents" agents={repoAgents} onUseAgent={props.onUseAgent} />
      <AgentGroup title="User Codex agents" agents={userAgents} onUseAgent={props.onUseAgent} />
      <div className="agent-help-card">
        <strong>Multi-agent routing</strong>
        <p>Type <code>#</code> in the composer to pick an agent for the next turn. Codex-Platform prefixes the request with a direct delegation brief.</p>
      </div>
    </section>
  );
}

function AgentGroup({ title, agents, onUseAgent }: { title: string; agents: AgentSummary[]; onUseAgent?: (agent: AgentSummary) => void }) {
  if (!agents.length) return null;
  return (
    <div className="agent-group">
      <div className="section-title">{title}</div>
      {agents.map((agent) => (
        <article key={agent.id} className="agent-card">
          <div className="agent-card-head">
            <span className="agent-avatar"><Icon name="agent" size={15} /></span>
            <div>
              <strong>{agent.name}</strong>
              {agent.aliases?.length ? <span className="agent-aliases">{agent.aliases.join(', ')}</span> : null}
            </div>
            <div className="capability-state-stack">
              <span className={`capability-state ${capabilityState(agent)}`}>{capabilityStateLabel(capabilityState(agent))}</span>
              <span className="skill-scope">{agent.scope ?? 'agent'}</span>
              <button className="mini-action capability-use" disabled={!onUseAgent} onClick={() => onUseAgent?.(agent)}>Use</button>
            </div>
          </div>
          {agent.description ? <p>{agent.description}</p> : null}
          {agent.diagnostic ? <p className="capability-diagnostic">{agent.diagnostic}</p> : null}
          <div className="agent-meta-row">
            {agent.model ? <code>{agent.model}</code> : null}
            {agent.effort ? <code>{agent.effort}</code> : null}
            {agent.sandbox ? <code>{agent.sandbox}</code> : null}
            {agent.hasDeveloperInstructions ? <code>instructions</code> : null}
          </div>
          {agent.path ? <code className="agent-path" title={agent.path}>{agent.path}</code> : null}
        </article>
      ))}
    </div>
  );
}

function AdminControlPanel(props: { status?: AdminStatus; loading: boolean; error?: string; onRefresh?: () => void }) {
  const status = props.status;
  const checkSummary = status ? adminCheckSummary(status) : { ok: 0, attention: 0, total: 0 };
  return (
    <section className="management-panel admin-panel">
      <div className="pane-header">
        <div>
          <div className="section-title">Runtime status</div>
          <div className="subtle">Read-only control-plane posture, auth, storage, and HFS deployment evidence.</div>
        </div>
        <button className="small ghost" onClick={props.onRefresh} disabled={props.loading || !props.onRefresh}>{props.loading ? 'Loading...' : 'Refresh'}</button>
      </div>
      <CapabilitySummary
        items={[
          { label: 'Mode', value: status?.server.mode ?? 'unknown', tone: status?.server.mode === 'real' ? 'ok' : undefined },
          { label: 'Checks', value: status ? `${checkSummary.ok}/${checkSummary.total}` : 'loading', tone: status ? (checkSummary.attention ? 'warn' : 'ok') : undefined },
          { label: 'Auth', value: status ? (status.auth.required ? 'required' : 'open') : 'unknown', tone: status ? (status.auth.required ? 'ok' : 'warn') : undefined }
        ]}
      />
      {props.error ? <CapabilityError title="Runtime status failed" message={props.error} /> : null}
      {!status && !props.error ? <div className="empty">{props.loading ? 'Loading runtime status...' : 'No runtime status loaded.'}</div> : null}
      {status ? (
        <>
          <div className="admin-section">
            <div className="section-title">Control plane</div>
            <div className="kv"><span>Runtime</span><strong>{status.server.appServer}</strong></div>
            <div className="kv"><span>Ready</span><strong>{status.server.ready ? 'ready' : 'not ready'}</strong></div>
            <div className="kv"><span>Uptime</span><code>{formatDuration(status.server.uptimeSeconds)}</code></div>
            <div className="kv"><span>Build</span><code>{status.server.buildSha ? shortSha(status.server.buildSha) : 'not pinned'}</code></div>
          </div>

          <div className="admin-check-list">
            {status.checks.map((check) => (
              <div key={check.id} className={`admin-check ${check.state}`}>
                <span className="admin-check-dot" />
                <div>
                  <strong>{check.label}</strong>
                  {check.detail ? <small title={check.detail}>{check.detail}</small> : null}
                </div>
                <span className="lane-state">{check.state}</span>
              </div>
            ))}
          </div>

          <div className="admin-section">
            <div className="section-title">Security boundary</div>
            <div className="kv"><span>Auth</span><strong>{status.auth.required ? 'required' : 'not required'}</strong></div>
            <div className="kv"><span>Header</span><code>{status.auth.headerName}</code></div>
            <div className="kv"><span>Cookie</span><code>{status.auth.cookieName}</code></div>
            <div className="kv"><span>Mode</span><code>{status.auth.allowUnauthenticated ? 'allow unauthenticated' : 'token gated'}</code></div>
          </div>

          <div className="admin-section">
            <div className="section-title">Runtime configuration</div>
            <div className="kv"><span>Listen</span><code>{status.runtime.host}:{status.runtime.port}</code></div>
            <div className="kv"><span>Codex</span><code>{[status.runtime.codexBin, ...status.runtime.codexArgs].join(' ')}</code></div>
            <div className="kv"><span>Client</span><code>{status.runtime.clientName}</code></div>
            <div className="kv"><span>Policy</span><code>{status.runtime.approvalPolicy} / {status.runtime.sandbox}</code></div>
            <div className="kv"><span>Model</span><code>{status.runtime.defaultModel ?? 'Codex default'}</code></div>
          </div>

          <div className="admin-section">
            <div className="section-title">Storage and limits</div>
            <div className="kv"><span>Workspace</span><code title={status.workspace.root}>{status.workspace.root}</code></div>
            <div className="kv"><span>Data dir</span><code title={status.workspace.dataDir}>{status.workspace.dataDir}</code></div>
            <div className="kv"><span>Event log</span><code title={status.storage.eventLogFile}>{status.storage.eventLogBytes === undefined ? 'not created' : formatBytes(status.storage.eventLogBytes)}</code></div>
            <div className="kv"><span>WebSocket</span><code>{status.limits.activeWsClients}/{status.limits.maxWsClients} clients</code></div>
          </div>

          <div className="capability-summary-grid admin-counts">
            <div className="capability-summary-card"><span>Projects</span><strong>{status.counts.projects}</strong></div>
            <div className="capability-summary-card"><span>Threads</span><strong>{status.counts.threads}</strong></div>
            <div className="capability-summary-card"><span>Approvals</span><strong>{status.counts.approvals}</strong></div>
            <div className="capability-summary-card"><span>Cards</span><strong>{status.counts.cards}</strong></div>
            <div className="capability-summary-card"><span>Git ops</span><strong>{status.counts.gitOperations}</strong></div>
            <div className="capability-summary-card"><span>Errors</span><strong>{status.counts.errors}</strong></div>
          </div>

          {status.huggingFace?.enabled ? (
            <div className="admin-section">
              <div className="section-title">Hugging Face Space</div>
              <div className="kv"><span>Space</span><code>{status.huggingFace.spaceId ?? status.huggingFace.spaceHost ?? 'configured'}</code></div>
              <div className="kv"><span>URL</span><code>{status.huggingFace.publicUrl ?? '-'}</code></div>
              <div className="kv"><span>Storage</span><code>{status.huggingFace.storageRoot}</code></div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function AutomationsPanel(props: {
  threads: ThreadSummary[];
  approvals: ApprovalRequest[];
  gitOperations: GitOperationRecord[];
  gitStatus?: GitStatusSummary;
  githubActions?: GitHubActionsSummary;
  health?: ServerHealth;
  onOpenInspectorTab?: (tab: InspectorTab) => void;
}) {
  const activeThreads = props.threads.filter((thread) => isActiveThread(thread.status)).length;
  const failedGit = props.gitOperations.filter((operation) => operation.status === 'failed').length;
  const release = releaseEvidenceSummary(props.gitStatus, props.health, props.githubActions);
  const releasePrompt = releaseVerificationPrompt(props.gitStatus, props.health, props.githubActions, release);
  const automationAttention = props.approvals.length > 0 || failedGit > 0 || release.state === 'attention';
  const rows = [
    {
      id: 'release',
      icon: 'branch' as const,
      title: 'Release evidence packet',
      detail: release.detail,
      state: release.state,
      action: () => props.onOpenInspectorTab?.('git')
    },
    {
      id: 'approvals',
      icon: 'check' as const,
      title: 'Approval sweep',
      detail: `${props.approvals.length} pending approval${props.approvals.length === 1 ? '' : 's'}`,
      state: props.approvals.length ? 'attention' : 'ready',
      action: () => props.onOpenInspectorTab?.('review')
    },
    {
      id: 'threads',
      icon: 'chat' as const,
      title: 'Thread supervision',
      detail: `${activeThreads} running or blocked thread${activeThreads === 1 ? '' : 's'}`,
      state: activeThreads ? 'running' : 'ready',
      action: () => props.onOpenInspectorTab?.('review')
    },
    {
      id: 'git',
      icon: 'terminal' as const,
      title: 'Git operation audit',
      detail: failedGit ? `${failedGit} failed Git action${failedGit === 1 ? '' : 's'}` : 'latest Git operations clear',
      state: failedGit ? 'attention' : 'ready',
      action: () => props.onOpenInspectorTab?.('git')
    }
  ];

  return (
    <section className="management-panel automation-panel">
      <div className="pane-header">
        <div>
          <div className="section-title">Automations</div>
          <div className="subtle">Release, approval, thread, and Git supervision lanes.</div>
        </div>
        <div className="management-head-actions">
          <CopyReleasePromptButton prompt={releasePrompt} />
          <span className={`capability-state ${automationAttention ? 'warning' : 'ready'}`}>{automationAttention ? 'attention' : release.label}</span>
        </div>
      </div>
      <CapabilitySummary
        items={[
          { label: 'Active', value: String(activeThreads), tone: activeThreads ? 'warn' : undefined },
          { label: 'Approvals', value: String(props.approvals.length), tone: props.approvals.length ? 'warn' : undefined },
          { label: 'Actions', value: props.githubActions ? githubActionsValue(props.githubActions) : 'loading', tone: props.githubActions?.state === 'failure' ? 'warn' : props.githubActions?.state === 'success' ? 'ok' : undefined },
          { label: 'Release', value: release.label, tone: release.state === 'ready' ? 'ok' : 'warn' }
        ]}
      />
      <div className="automation-lanes">
        {rows.map((row) => (
          <button key={row.id} className={`automation-lane ${row.state}`} onClick={row.action} disabled={!props.onOpenInspectorTab}>
            <span className="automation-lane-icon"><Icon name={row.icon} size={15} /></span>
            <span>
              <strong>{row.title}</strong>
              <small>{row.detail}</small>
            </span>
            <span className="lane-state">{row.state}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TriagePanel(props: {
  approvals: ApprovalRequest[];
  approvalHistory: ApprovalRecord[];
  gitOperations: GitOperationRecord[];
  threads: ThreadSummary[];
  cards: TimelineCard[];
  errors: string[];
  gitStatus?: GitStatusSummary;
  githubActions?: GitHubActionsSummary;
  health?: ServerHealth;
  onOpenInspectorTab?: (tab: InspectorTab) => void;
  onSelectThread?: (threadId: string) => void | Promise<void>;
}) {
  const failedThreads = props.threads.filter((thread) => isFailedThread(thread.status));
  const failedGit = props.gitOperations.filter((operation) => operation.status === 'failed');
  const reviewCards = props.cards.filter((card) => card.kind === 'fileChange' || card.kind === 'error').slice(-8).reverse();
  const release = releaseEvidenceSummary(props.gitStatus, props.health, props.githubActions);
  const releasePrompt = releaseVerificationPrompt(props.gitStatus, props.health, props.githubActions, release);
  const changedFiles = props.gitStatus?.isRepo ? props.gitStatus.files.length : 0;
  const items: Array<{ id: string; icon: 'branch' | 'chat' | 'check' | 'file' | 'inbox' | 'terminal'; title: string; detail: string; tone: 'attention' | 'warn' | 'ready'; tab?: InspectorTab; threadId?: string }> = [];

  for (const approval of props.approvals.slice(0, 4)) {
    items.push({
      id: `approval-${approval.requestId}`,
      icon: 'check',
      title: approval.title,
      detail: approval.command ?? approval.reason ?? approval.kind,
      tone: 'attention',
      tab: 'review',
      threadId: approval.threadId
    });
  }
  for (const thread of failedThreads.slice(0, 4)) {
    items.push({
      id: `thread-${thread.id}`,
      icon: 'chat',
      title: thread.name || thread.preview || compactThreadId(thread.id),
      detail: `${thread.status ?? 'failed'} · ${compactThreadId(thread.id)}`,
      tone: 'warn',
      tab: 'review',
      threadId: thread.id
    });
  }
  for (const operation of failedGit.slice(0, 3)) {
    items.push({
      id: `git-${operation.id}`,
      icon: 'terminal',
      title: operation.title,
      detail: operation.error ?? operation.stderr ?? operation.detail ?? operation.kind,
      tone: 'warn',
      tab: 'git'
    });
  }
  if (props.githubActions?.state === 'failure') {
    items.push({
      id: 'github-actions',
      icon: 'branch',
      title: 'GitHub Actions attention',
      detail: githubActionsDetail(props.githubActions),
      tone: 'warn',
      tab: 'git'
    });
  }
  if (changedFiles > 0) {
    items.push({
      id: 'git-review-package',
      icon: 'file',
      title: 'Review package changed',
      detail: `${changedFiles} changed file${changedFiles === 1 ? '' : 's'} before PR/release handoff`,
      tone: 'warn',
      tab: 'git'
    });
  }
  if (release.state !== 'ready') {
    items.push({
      id: 'release-evidence',
      icon: 'branch',
      title: release.state === 'attention' ? 'Release evidence attention' : 'Release evidence partial',
      detail: release.detail,
      tone: release.state === 'attention' ? 'attention' : 'warn',
      tab: 'git'
    });
  }
  for (const card of reviewCards) {
    items.push({
      id: `card-${card.id}`,
      icon: card.kind === 'fileChange' ? 'file' : 'inbox',
      title: card.title,
      detail: card.filePath ?? card.status ?? card.kind,
      tone: card.kind === 'error' ? 'warn' : 'ready',
      tab: card.kind === 'fileChange' ? 'diff' : 'review',
      threadId: card.threadId
    });
  }

  const visibleItems = items.slice(0, 12);

  return (
    <section className="management-panel triage-panel">
      <div className="pane-header">
        <div>
          <div className="section-title">Triage</div>
          <div className="subtle">Approvals, failures, review work, and release risks.</div>
        </div>
        <div className="management-head-actions">
          <CopyReleasePromptButton prompt={releasePrompt} />
          <span className={`capability-state ${visibleItems.some((item) => item.tone !== 'ready') ? 'warning' : 'ready'}`}>{visibleItems.length || 'clear'}</span>
        </div>
      </div>
      <CapabilitySummary
        items={[
          { label: 'Approvals', value: String(props.approvals.length), tone: props.approvals.length ? 'warn' : undefined },
          { label: 'Failures', value: String(failedThreads.length + failedGit.length + props.errors.length), tone: failedThreads.length + failedGit.length + props.errors.length ? 'warn' : undefined },
          { label: 'Release', value: release.label, tone: release.state === 'ready' ? 'ok' : 'warn' },
          { label: 'Decisions', value: String(props.approvalHistory.length) }
        ]}
      />
      {visibleItems.length === 0 ? <div className="empty">No triage items waiting.</div> : null}
      <div className="triage-list">
        {visibleItems.map((item) => (
          <button
            key={item.id}
            className={`triage-row ${item.tone}`}
            onClick={() => {
              if (item.threadId) void props.onSelectThread?.(item.threadId);
              if (item.tab) props.onOpenInspectorTab?.(item.tab);
            }}
            disabled={!props.onOpenInspectorTab && !props.onSelectThread}
          >
            <span className="triage-icon"><Icon name={item.icon} size={15} /></span>
            <span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
            <span className="lane-state">{item.tone}</span>
          </button>
        ))}
      </div>
      {props.errors.length > 0 ? (
        <div className="triage-errors">
          {props.errors.slice(0, 3).map((error, index) => <code key={index}>{error}</code>)}
        </div>
      ) : null}
    </section>
  );
}

function CopyReleasePromptButton(props: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    await copyText(props.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button type="button" className={`small release-copy-button ${copied ? 'primary' : 'ghost'}`} onClick={() => void copyPrompt()} title="Copy release verification prompt">
      {copied ? 'Copied' : 'Copy verification prompt'}
    </button>
  );
}

function CapabilitySummary(props: { items: Array<{ label: string; value: string; tone?: 'ok' | 'warn' }> }) {
  return (
    <div className="capability-summary-grid">
      {props.items.map((item) => (
        <div key={item.label} className={`capability-summary-card ${item.tone ?? ''}`}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function CapabilityError(props: { message: string; title?: string }) {
  return (
    <div className="capability-error">
      <strong>{props.title ?? 'Discovery failed'}</strong>
      <code>{props.message}</code>
    </div>
  );
}

function RuntimeSettings(props: { health?: ServerHealth; githubActions?: GitHubActionsSummary; gitStatus?: GitStatusSummary; codexWebConfig?: CodexWebConfig; account?: AccountSummary; notificationsEnabled: boolean; notificationsSupported: boolean; onToggleNotifications?: (enabled: boolean) => void }) {
  const buildSha = props.health?.build?.sha;
  const gitHead = props.gitStatus?.head;
  const upstreamHead = props.gitStatus?.upstreamHead;
  const sourceSynced = gitHead && upstreamHead ? gitHead === upstreamHead : undefined;
  const buildMatchesGit = buildSha && gitHead ? buildSha === gitHead : undefined;
  const actionsState = props.githubActions ? githubActionsCheckState(props.githubActions) : undefined;
  return (
    <section className="management-panel">
      <div className="section-title">Runtime settings</div>
      <div className="release-verification-card">
        <div className="release-card-head">
          <div>
            <strong>Release verification</strong>
            <span>GitHub source, running build, and Space target evidence.</span>
          </div>
          <span className={`release-state ${releaseState(sourceSynced, buildMatchesGit, actionsState)}`}>{releaseStateLabel(sourceSynced, buildMatchesGit, actionsState)}</span>
        </div>
        <div className="release-check-list">
          <ReleaseCheck label="GitHub source" value={gitHead ? shortSha(gitHead) : 'unknown'} detail={props.gitStatus?.remoteUrl ?? props.gitStatus?.upstream ?? 'No origin remote detected'} state={sourceSynced} />
          <ReleaseCheck label="Upstream sync" value={upstreamHead ? shortSha(upstreamHead) : 'unknown'} detail={sourceSynced === undefined ? 'No upstream HEAD available' : sourceSynced ? 'Local HEAD matches upstream' : 'Local HEAD differs from upstream'} state={sourceSynced} />
          <ReleaseCheck label="GitHub Actions" value={githubActionsValue(props.githubActions)} detail={githubActionsDetail(props.githubActions)} state={actionsState} href={props.githubActions?.htmlUrl} />
          <ReleaseCheck label="Running build" value={buildSha ? shortSha(buildSha) : 'not pinned'} detail={buildMatchesGit === undefined ? 'Build SHA is only present in release images' : buildMatchesGit ? 'Build SHA matches local Git HEAD' : 'Build SHA differs from local Git HEAD'} state={buildMatchesGit} />
          <ReleaseCheck label="HF target" value={props.health?.huggingFace?.enabled ? 'configured' : 'self-hosted'} detail={props.health?.huggingFace?.publicUrl ?? props.health?.huggingFace?.spaceHost ?? 'No Hugging Face Space URL'} state={props.health?.huggingFace?.enabled ? true : undefined} />
        </div>
        {props.githubActions?.runs.length ? <GitHubActionsRuns actions={props.githubActions} /> : null}
      </div>
      <div className="kv"><span>Auth</span><strong>{props.codexWebConfig?.authRequired ? 'required' : 'not required'}</strong></div>
      <div className="kv"><span>Mode</span><strong>{props.codexWebConfig?.demoMode ? 'demo' : 'real app-server'}</strong></div>
      <div className="kv"><span>Runtime</span><strong>{props.health?.appServer ?? 'unknown'}</strong></div>
      <div className="kv"><span>Deploy target</span><strong>{props.health?.huggingFace?.enabled ? 'Hugging Face Space' : 'self-hosted'}</strong></div>
      {props.health?.huggingFace?.spaceHost ? <div className="kv"><span>Space host</span><code>{props.health.huggingFace.spaceHost}</code></div> : null}
      {props.health?.codexHome ? <div className="kv"><span>Codex home</span><code>{props.health.codexHome}</code></div> : null}
      <div className="kv"><span>Account</span><strong>{props.account?.email ?? props.account?.mode ?? '-'}</strong></div>
      <div className="kv"><span>Approval</span><code>{props.codexWebConfig?.defaultApprovalPolicy ?? '-'}</code></div>
      <div className="kv"><span>Sandbox</span><code>{props.codexWebConfig?.defaultSandbox ?? '-'}</code></div>
      <div className="kv"><span>Default model</span><code>{props.codexWebConfig?.defaultModel ?? 'Codex default'}</code></div>
      <div className="settings-toggle-row">
        <div>
          <strong>Browser approval notifications</strong>
          <span>Useful when supervising long running agents from another tab or device.</span>
        </div>
        <button disabled={!props.notificationsSupported || !props.onToggleNotifications} onClick={() => props.onToggleNotifications?.(!props.notificationsEnabled)}>
          {props.notificationsEnabled ? 'Enabled' : 'Enable'}
        </button>
      </div>
      <div className="kv"><span>Workspace</span><code>{props.health?.workspaceRoot ?? '-'}</code></div>
      <div className="kv"><span>Data dir</span><code>{props.health?.dataDir ?? '-'}</code></div>
      {props.health?.allowedWorkspaceRoots?.length ? (
        <div className="settings-list">
          <div className="section-title">Allowed project roots</div>
          {props.health.allowedWorkspaceRoots.map((root) => <code key={root}>{root}</code>)}
        </div>
      ) : null}
    </section>
  );
}

function ReleaseCheck(props: { label: string; value: string; detail: string; state?: boolean; href?: string }) {
  return (
    <div className="release-check">
      <span className={`release-dot ${props.state === undefined ? 'unknown' : props.state ? 'ok' : 'warn'}`} />
      <div>
        <strong>{props.label}</strong>
        {props.href ? <a href={props.href} target="_blank" rel="noreferrer" title={props.detail}>{props.value}</a> : <code title={props.detail}>{props.value}</code>}
        <small title={props.detail}>{props.detail}</small>
      </div>
    </div>
  );
}

function GitHubActionsRuns(props: { actions: GitHubActionsSummary }) {
  return (
    <div className="github-actions-runs" aria-label="GitHub Actions runs">
      {props.actions.runs.slice(0, 4).map((run) => (
        <a key={run.id} href={run.htmlUrl} target="_blank" rel="noreferrer" className={`github-actions-run ${githubActionsRunState(run)}`}>
          <span>{run.name}</span>
          <strong>{run.conclusion ?? run.status ?? 'unknown'}</strong>
          <code>{run.headSha ? shortSha(run.headSha) : '-'}</code>
        </a>
      ))}
    </div>
  );
}

function releaseEvidenceSummary(gitStatus?: GitStatusSummary, health?: ServerHealth, actions?: GitHubActionsSummary): ReleaseEvidenceSummary {
  const changedFiles = gitStatus?.isRepo ? gitStatus.files.length : 0;
  const buildSha = health?.build?.sha;
  const gitHead = gitStatus?.head;
  const upstreamHead = gitStatus?.upstreamHead;
  const sourceSynced = gitHead && upstreamHead ? gitHead === upstreamHead : undefined;
  const buildMatchesGit = buildSha && gitHead ? buildSha === gitHead : undefined;
  const actionsState = actions ? githubActionsCheckState(actions) : undefined;
  const hfTarget = health?.huggingFace?.publicUrl ?? health?.huggingFace?.spaceHost ?? 'no HF target';

  if (actionsState === false) {
    return { state: 'attention', label: 'attention', detail: `GitHub Actions failing for ${actions?.checkedSha ? shortSha(actions.checkedSha) : 'current HEAD'}.` };
  }
  if (buildMatchesGit === false) {
    return { state: 'attention', label: 'attention', detail: `Runtime build ${buildSha ? shortSha(buildSha) : 'unknown'} does not match HEAD ${gitHead ? shortSha(gitHead) : 'unknown'}.` };
  }
  if (sourceSynced === false) {
    return { state: 'attention', label: 'attention', detail: `Local HEAD ${gitHead ? shortSha(gitHead) : 'unknown'} differs from upstream ${upstreamHead ? shortSha(upstreamHead) : 'unknown'}.` };
  }
  if (changedFiles > 0) {
    return { state: 'waiting', label: 'partial', detail: `${changedFiles} changed file${changedFiles === 1 ? '' : 's'} need review before release evidence is final.` };
  }
  if (actionsState === true && buildMatchesGit === true && health?.huggingFace?.enabled) {
    return { state: 'ready', label: 'verified', detail: `Actions, HEAD, runtime build, and ${hfTarget} line up.` };
  }
  return { state: 'waiting', label: 'partial', detail: `${githubActionsValue(actions)} Actions · runtime ${buildSha ? shortSha(buildSha) : 'unversioned'} · ${hfTarget}.` };
}

function releaseVerificationPrompt(gitStatus: GitStatusSummary | undefined, health: ServerHealth | undefined, actions: GitHubActionsSummary | undefined, release: ReleaseEvidenceSummary): string {
  const files = gitStatus?.isRepo ? gitStatus.files : [];
  const changedFileLines = files.length
    ? files.slice(0, 14).map((file) => `- ${file.status || `${file.index}${file.workingTree}`.trim() || 'changed'} ${file.path}${file.oldPath ? ` (from ${file.oldPath})` : ''}`)
    : ['- none'];
  if (files.length > changedFileLines.length) {
    changedFileLines.push(`- ... ${files.length - changedFileLines.length} more`);
  }

  const actionLines = actions?.runs.length
    ? actions.runs.slice(0, 6).map((run) => `- ${run.name}: ${run.status ?? 'unknown'} / ${run.conclusion ?? 'pending'} · ${run.headSha ? shortSha(run.headSha) : 'unknown sha'}${run.htmlUrl ? ` · ${run.htmlUrl}` : ''}`)
    : ['- no workflow runs loaded'];

  const hfUrl = health?.huggingFace?.publicUrl ?? (health?.huggingFace?.spaceHost ? `https://${health.huggingFace.spaceHost}` : undefined);
  const smokeTarget = hfUrl ?? '<HF Space URL>';

  return [
    'Continue release verification for Codex-Platform.',
    '',
    'Goal:',
    '- Prove the GitHub commit, GitHub Actions result, Hugging Face Space runtime, and local review package line up before calling the release safe.',
    '',
    'Current release evidence:',
    `- State: ${release.label} (${release.state})`,
    `- Detail: ${release.detail}`,
    `- Branch: ${gitStatus?.branch ?? 'unknown'}`,
    `- Default branch: ${gitStatus?.defaultBranch ?? 'unknown'}`,
    `- HEAD: ${gitStatus?.head ?? 'unknown'}`,
    `- Upstream: ${gitStatus?.upstream ?? 'unknown'}`,
    `- Upstream HEAD: ${gitStatus?.upstreamHead ?? 'unknown'}`,
    `- Remote: ${gitStatus?.remoteUrl ?? 'unknown'}`,
    `- Changed files: ${files.length}`,
    `- GitHub Actions: ${githubActionsValue(actions)}; ${githubActionsDetail(actions)}`,
    `- Actions checked SHA: ${actions?.checkedSha ?? actions?.headSha ?? 'unknown'}`,
    `- Runtime build SHA: ${health?.build?.sha ?? 'unknown'}`,
    `- HF enabled: ${health?.huggingFace?.enabled ? 'yes' : 'no'}`,
    `- HF space: ${health?.huggingFace?.spaceId ?? health?.huggingFace?.spaceHost ?? 'unknown'}`,
    `- HF URL: ${hfUrl ?? 'unknown'}`,
    '',
    'Changed files:',
    ...changedFileLines,
    '',
    'Recent GitHub Actions runs:',
    ...actionLines,
    '',
    'Required next actions:',
    '1. Inspect the changed review package and confirm no unrelated files, secrets, local-only files, or HFS boundary violations are included.',
    '2. Run lightweight local gates: git diff --check; npm run typecheck; npm run build:web; npm run build:server; scripts/static-check.sh; bash -n scripts/hf-entrypoint.sh scripts/hf-healthcheck.sh scripts/hf-space-smoke.sh cloud/hfs/export_space_bundle.sh.',
    '3. Export the HFS bundle with cloud/hfs/export_space_bundle.sh and confirm it does not contain .env.local, local, dist, node_modules, .playwright-cli, or output.',
    '4. Commit and push to GitHub only after the review package is clean.',
    '5. Watch GitHub CI and HF Deploy for the pushed commit until both complete successfully.',
    `6. Poll ${smokeTarget}/healthz until build.sha matches the pushed commit SHA.`,
    `7. Run SMOKE_RETRIES=12 SMOKE_DELAY=5 scripts/hf-space-smoke.sh ${smokeTarget}.`,
    '8. Report the verified commit SHA, CI run, HF deploy run, healthz build.sha, smoke result, and any residual risk.'
  ].join('\n');
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back to the legacy selection path below.
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}

function shortSha(value: string): string {
  return value.slice(0, 12);
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds % 60}s`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function adminCheckSummary(status: AdminStatus): { ok: number; attention: number; total: number } {
  let ok = 0;
  let attention = 0;
  for (const check of status.checks) {
    if (check.state === 'ok') ok += 1;
    else attention += 1;
  }
  return { ok, attention, total: status.checks.length };
}

function releaseState(sourceSynced?: boolean, buildMatchesGit?: boolean, actionsState?: boolean): string {
  if (sourceSynced === false || buildMatchesGit === false || actionsState === false) return 'warn';
  if (sourceSynced === true && buildMatchesGit === true && actionsState === true) return 'ok';
  return 'unknown';
}

function releaseStateLabel(sourceSynced?: boolean, buildMatchesGit?: boolean, actionsState?: boolean): string {
  const state = releaseState(sourceSynced, buildMatchesGit, actionsState);
  if (state === 'ok') return 'verified';
  if (state === 'warn') return 'attention';
  return 'partial';
}

function githubActionsCheckState(actions: GitHubActionsSummary): boolean | undefined {
  if (actions.state === 'success') return true;
  if (actions.state === 'failure') return false;
  return undefined;
}

function githubActionsValue(actions?: GitHubActionsSummary): string {
  if (!actions) return 'loading';
  if (actions.state === 'success') return 'passing';
  if (actions.state === 'failure') return 'failing';
  if (actions.state === 'pending') return 'pending';
  if (actions.state === 'unknown') return 'unknown';
  return 'unavailable';
}

function githubActionsDetail(actions?: GitHubActionsSummary): string {
  if (!actions) return 'GitHub Actions status has not loaded yet.';
  if (actions.error) return actions.error;
  const matched = actions.matchedRuns ?? 0;
  const repo = actions.repo ? `${actions.repo}` : 'GitHub repository';
  if (matched > 0) return `${matched} workflow run${matched === 1 ? '' : 's'} found for ${actions.checkedSha ? shortSha(actions.checkedSha) : 'current HEAD'} in ${repo}.`;
  return `No matching workflow run found for ${actions.headSha ? shortSha(actions.headSha) : 'current HEAD'} in ${repo}.`;
}

function githubActionsRunState(run: GitHubActionsSummary['runs'][number]): string {
  if (run.status !== 'completed') return 'pending';
  if (run.conclusion === 'success' || run.conclusion === 'skipped' || run.conclusion === 'neutral') return 'success';
  return 'failure';
}

function skillStats(skills: SkillSummary[]): { ready: number; attention: number; sources: number } {
  const sources = new Set<string>();
  let ready = 0;
  let attention = 0;
  for (const skill of skills) {
    if (skill.source) sources.add(skill.source);
    const state = capabilityState(skill);
    if (state === 'ready') ready += 1;
    else attention += 1;
  }
  return { ready, attention, sources: sources.size };
}

function agentStats(agents: AgentSummary[]): { repo: number; user: number; attention: number } {
  let repo = 0;
  let user = 0;
  let attention = 0;
  for (const agent of agents) {
    if (agent.scope === 'repo') repo += 1;
    else user += 1;
    if (capabilityState(agent) !== 'ready') attention += 1;
  }
  return { repo, user, attention };
}

function capabilityState(item: SkillSummary | AgentSummary): 'ready' | 'disabled' | 'warning' | 'error' {
  if (item.state === 'error') return 'error';
  if ('enabled' in item && item.enabled === false) return 'disabled';
  if (item.state === 'disabled') return 'disabled';
  if (item.state === 'warning') return 'warning';
  if (!item.path) return 'warning';
  if ('hasDeveloperInstructions' in item && item.hasDeveloperInstructions === false) return 'warning';
  return 'ready';
}

function capabilityStateLabel(state: ReturnType<typeof capabilityState>): string {
  if (state === 'ready') return 'ready';
  if (state === 'disabled') return 'disabled';
  if (state === 'error') return 'error';
  return 'attention';
}

function tabLabel(tab: ManagementTab): string {
  switch (tab) {
    case 'skills': return 'Skills';
    case 'agents': return 'Agents';
    case 'admin': return 'Runtime';
    case 'automations': return 'Automations';
    case 'triage': return 'Triage';
    case 'settings': return 'Settings';
  }
}

function tabTitle(tab: ManagementTab): string {
  if (tab === 'skills') return 'Skills registry';
  if (tab === 'agents') return 'Codex agents';
  if (tab === 'admin') return 'Runtime status';
  if (tab === 'automations') return 'Automations';
  if (tab === 'triage') return 'Triage inbox';
  return 'Runtime settings';
}

function skillScopeLabel(skill: SkillSummary): string {
  const value = skill.scope ?? skill.source;
  if (!value) return 'Personal';
  if (value.includes('/') || value.includes('\\')) return 'Project';
  return value;
}

function isActiveThread(status?: string): boolean {
  const value = String(status ?? '').toLowerCase();
  return value.includes('run') || value.includes('progress') || value.includes('approval') || value.includes('block');
}

function isFailedThread(status?: string): boolean {
  const value = String(status ?? '').toLowerCase();
  return value.includes('fail') || value.includes('error') || value.includes('cancel');
}

function compactThreadId(id: string): string {
  return id.replace(/^thr_/, '').slice(-12) || id;
}
