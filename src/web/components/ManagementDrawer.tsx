import type { AccountSummary, AgentSummary, CodexWebConfig, GitStatusSummary, ManagementTab, ServerHealth, SkillSummary } from '../../shared/types.js';
import { Icon } from './Icon.js';

const managementTabs: ManagementTab[] = ['skills', 'agents', 'settings'];

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
  gitStatus?: GitStatusSummary;
  codexWebConfig?: CodexWebConfig;
  notificationsEnabled: boolean;
  notificationsSupported: boolean;
  onClose: () => void;
  onTabChange: (tab: ManagementTab) => void;
  onRefreshSkills?: () => void;
  onToggleNotifications?: (enabled: boolean) => void;
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

        {props.tab === 'skills' ? <SkillsRegistry skills={props.skills} loading={Boolean(props.skillsLoading)} error={props.skillsError} onRefresh={props.onRefreshSkills} /> : null}
        {props.tab === 'agents' ? <AgentsRegistry agents={props.agents} loading={Boolean(props.agentsLoading)} error={props.agentsError} onRefresh={props.onRefreshSkills} /> : null}
        {props.tab === 'settings' ? (
          <RuntimeSettings
            health={props.health}
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

function SkillsRegistry(props: { skills: SkillSummary[]; loading: boolean; error?: string; onRefresh?: () => void }) {
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
            <span className="capability-state-stack">
              <span className={`capability-state ${capabilityState(skill)}`}>{capabilityStateLabel(capabilityState(skill))}</span>
              <span className="skill-scope">{skillScopeLabel(skill)}</span>
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function AgentsRegistry(props: { agents: AgentSummary[]; loading: boolean; error?: string; onRefresh?: () => void }) {
  const repoAgents = props.agents.filter((agent) => agent.scope === 'repo');
  const userAgents = props.agents.filter((agent) => agent.scope !== 'repo');
  const stats = agentStats(props.agents);
  return (
    <section className="management-panel agents-panel">
      <div className="pane-header">
        <div>
          <div className="section-title">Agents registry</div>
          <div className="subtle">Custom agents discovered from user and project configuration.</div>
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
      {props.agents.length === 0 ? <div className="empty">No custom agents found. Built-in agents such as explorer and worker can still be requested in natural language.</div> : null}
      <AgentGroup title="Project agents" agents={repoAgents} />
      <AgentGroup title="User agents" agents={userAgents} />
      <div className="agent-help-card">
        <strong>Composer shortcut</strong>
        <p>Type <code>#</code> in the composer to pick one of these agents. Codex-Platform prefixes the next turn with a direct delegation request.</p>
      </div>
    </section>
  );
}

function AgentGroup({ title, agents }: { title: string; agents: AgentSummary[] }) {
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
            <span className="capability-state-stack">
              <span className={`capability-state ${capabilityState(agent)}`}>{capabilityStateLabel(capabilityState(agent))}</span>
              <span className="skill-scope">{agent.scope ?? 'agent'}</span>
            </span>
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

function CapabilityError(props: { message: string }) {
  return (
    <div className="capability-error">
      <strong>Discovery failed</strong>
      <code>{props.message}</code>
    </div>
  );
}

function RuntimeSettings(props: { health?: ServerHealth; gitStatus?: GitStatusSummary; codexWebConfig?: CodexWebConfig; account?: AccountSummary; notificationsEnabled: boolean; notificationsSupported: boolean; onToggleNotifications?: (enabled: boolean) => void }) {
  const buildSha = props.health?.build?.sha;
  const gitHead = props.gitStatus?.head;
  const upstreamHead = props.gitStatus?.upstreamHead;
  const sourceSynced = gitHead && upstreamHead ? gitHead === upstreamHead : undefined;
  const buildMatchesGit = buildSha && gitHead ? buildSha === gitHead : undefined;
  return (
    <section className="management-panel">
      <div className="section-title">Runtime settings</div>
      <div className="release-verification-card">
        <div className="release-card-head">
          <div>
            <strong>Release verification</strong>
            <span>GitHub source, running build, and Space target evidence.</span>
          </div>
          <span className={`release-state ${releaseState(sourceSynced, buildMatchesGit)}`}>{releaseStateLabel(sourceSynced, buildMatchesGit)}</span>
        </div>
        <div className="release-check-list">
          <ReleaseCheck label="GitHub source" value={gitHead ? shortSha(gitHead) : 'unknown'} detail={props.gitStatus?.remoteUrl ?? props.gitStatus?.upstream ?? 'No origin remote detected'} state={sourceSynced} />
          <ReleaseCheck label="Upstream sync" value={upstreamHead ? shortSha(upstreamHead) : 'unknown'} detail={sourceSynced === undefined ? 'No upstream HEAD available' : sourceSynced ? 'Local HEAD matches upstream' : 'Local HEAD differs from upstream'} state={sourceSynced} />
          <ReleaseCheck label="Running build" value={buildSha ? shortSha(buildSha) : 'not pinned'} detail={buildMatchesGit === undefined ? 'Build SHA is only present in release images' : buildMatchesGit ? 'Build SHA matches local Git HEAD' : 'Build SHA differs from local Git HEAD'} state={buildMatchesGit} />
          <ReleaseCheck label="HF target" value={props.health?.huggingFace?.enabled ? 'configured' : 'self-hosted'} detail={props.health?.huggingFace?.publicUrl ?? props.health?.huggingFace?.spaceHost ?? 'No Hugging Face Space URL'} state={props.health?.huggingFace?.enabled ? true : undefined} />
        </div>
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

function ReleaseCheck(props: { label: string; value: string; detail: string; state?: boolean }) {
  return (
    <div className="release-check">
      <span className={`release-dot ${props.state === undefined ? 'unknown' : props.state ? 'ok' : 'warn'}`} />
      <div>
        <strong>{props.label}</strong>
        <code title={props.detail}>{props.value}</code>
        <small title={props.detail}>{props.detail}</small>
      </div>
    </div>
  );
}

function shortSha(value: string): string {
  return value.slice(0, 12);
}

function releaseState(sourceSynced?: boolean, buildMatchesGit?: boolean): string {
  if (sourceSynced === false || buildMatchesGit === false) return 'warn';
  if (sourceSynced === true && buildMatchesGit === true) return 'ok';
  return 'unknown';
}

function releaseStateLabel(sourceSynced?: boolean, buildMatchesGit?: boolean): string {
  const state = releaseState(sourceSynced, buildMatchesGit);
  if (state === 'ok') return 'verified';
  if (state === 'warn') return 'attention';
  return 'partial';
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
    case 'settings': return 'Settings';
  }
}

function tabTitle(tab: ManagementTab): string {
  if (tab === 'skills') return 'Skills registry';
  if (tab === 'agents') return 'Agents registry';
  return 'Runtime settings';
}

function skillScopeLabel(skill: SkillSummary): string {
  const value = skill.scope ?? skill.source;
  if (!value) return 'Personal';
  if (value.includes('/') || value.includes('\\')) return 'Project';
  return value;
}
