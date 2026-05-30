import type { AccountSummary, AgentSummary, CodexWebConfig, ManagementTab, ServerHealth, SkillSummary } from '../../shared/types.js';
import { Icon } from './Icon.js';

const managementTabs: ManagementTab[] = ['skills', 'agents', 'settings'];

export function ManagementDrawer(props: {
  open: boolean;
  tab: ManagementTab;
  skills: SkillSummary[];
  agents: AgentSummary[];
  skillsLoading?: boolean;
  agentsLoading?: boolean;
  account?: AccountSummary;
  health?: ServerHealth;
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

        {props.tab === 'skills' ? <SkillsRegistry skills={props.skills} loading={Boolean(props.skillsLoading)} onRefresh={props.onRefreshSkills} /> : null}
        {props.tab === 'agents' ? <AgentsRegistry agents={props.agents} loading={Boolean(props.agentsLoading)} onRefresh={props.onRefreshSkills} /> : null}
        {props.tab === 'settings' ? (
          <RuntimeSettings
            health={props.health}
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

function SkillsRegistry(props: { skills: SkillSummary[]; loading: boolean; onRefresh?: () => void }) {
  return (
    <section className="management-panel skills-panel">
      <div className="pane-header">
        <div>
          <div className="section-title">Skills registry</div>
          <div className="subtle">Capabilities discovered for this workspace through app-server.</div>
        </div>
        <button className="small ghost" onClick={props.onRefresh} disabled={props.loading || !props.onRefresh}>{props.loading ? 'Loading...' : 'Reload'}</button>
      </div>
      {props.skills.length === 0 ? <div className="empty">No skills returned for this project.</div> : null}
      <div className="skill-table management-list">
        {props.skills.map((skill) => (
          <article key={skill.id} className={`skill-row ${skill.enabled === false ? 'disabled' : ''}`}>
            <span className="skill-row-icon"><Icon name="spark" size={15} /></span>
            <div>
              <strong>{skill.name}</strong>
              {skill.description ? <p>{skill.description}</p> : null}
              {skill.path ? <code className="agent-path" title={skill.path}>{skill.path}</code> : null}
            </div>
            <span className="skill-scope">{skillScopeLabel(skill)}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function AgentsRegistry(props: { agents: AgentSummary[]; loading: boolean; onRefresh?: () => void }) {
  const repoAgents = props.agents.filter((agent) => agent.scope === 'repo');
  const userAgents = props.agents.filter((agent) => agent.scope !== 'repo');
  return (
    <section className="management-panel agents-panel">
      <div className="pane-header">
        <div>
          <div className="section-title">Agents registry</div>
          <div className="subtle">Custom agents discovered from user and project configuration.</div>
        </div>
        <button className="small ghost" onClick={props.onRefresh} disabled={props.loading || !props.onRefresh}>{props.loading ? 'Loading...' : 'Reload'}</button>
      </div>
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
            <span className="skill-scope">{agent.scope ?? 'agent'}</span>
          </div>
          {agent.description ? <p>{agent.description}</p> : null}
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

function RuntimeSettings(props: { health?: ServerHealth; codexWebConfig?: CodexWebConfig; account?: AccountSummary; notificationsEnabled: boolean; notificationsSupported: boolean; onToggleNotifications?: (enabled: boolean) => void }) {
  return (
    <section className="management-panel">
      <div className="section-title">Runtime settings</div>
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
