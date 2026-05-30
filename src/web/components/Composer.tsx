import { useMemo, useState } from 'react';
import type { AgentSummary, SkillSummary, StartTurnRequest, ThreadSummary, CodexWebConfig } from '../../shared/types.js';

type Suggestion = { kind: 'command' | 'skill' | 'agent'; name: string; description?: string; path?: string; disabled?: boolean };
type ComposerOptions = Pick<StartTurnRequest, 'model' | 'effort' | 'sandbox' | 'approvalPolicy' | 'summary'> & {
  skill?: { name: string; path: string };
  agent?: { name: string; path?: string };
};

export function Composer(props: {
  disabled: boolean;
  selectedThread?: ThreadSummary;
  skills: SkillSummary[];
  agents?: AgentSummary[];
  skillsLoading: boolean;
  agentsLoading?: boolean;
  skillsError?: string;
  agentsError?: string;
  codexWebConfig?: CodexWebConfig;
  onReloadSkills: () => void;
  onSubmit: (text: string, options?: ComposerOptions) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [selectedSkillName, setSelectedSkillName] = useState('');
  const [selectedAgentName, setSelectedAgentName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showRunConfig, setShowRunConfig] = useState(false);
  const [model, setModel] = useState(props.codexWebConfig?.defaultModel ?? '');
  const [effort, setEffort] = useState(props.codexWebConfig?.defaultEffort ?? 'medium');
  const [summary, setSummary] = useState(props.codexWebConfig?.defaultSummary ?? 'concise');
  const [sandbox, setSandbox] = useState(props.codexWebConfig?.defaultSandbox ?? 'workspaceWrite');
  const [approvalPolicy, setApprovalPolicy] = useState(props.codexWebConfig?.defaultApprovalPolicy ?? 'unlessTrusted');

  const agents = props.agents ?? [];
  const selectedSkill = useMemo(() => props.skills.find((skill) => skill.name === selectedSkillName), [props.skills, selectedSkillName]);
  const selectedAgent = useMemo(() => agents.find((agent) => agent.name === selectedAgentName), [agents, selectedAgentName]);
  const suggestions = useMemo(() => buildSuggestions(text, props.skills, agents), [text, props.skills, agents]);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || props.disabled) return;
    const options: ComposerOptions = {
      ...(model.trim() ? { model: model.trim() } : {}),
      ...(effort ? { effort } : {}),
      ...(summary ? { summary } : {}),
      ...(sandbox ? { sandbox } : {}),
      ...(approvalPolicy ? { approvalPolicy } : {}),
      ...(selectedSkill && selectedSkill.path ? { skill: { name: selectedSkill.name, path: selectedSkill.path } } : {}),
      ...(selectedAgent ? { agent: { name: selectedAgent.name, path: selectedAgent.path } } : {})
    };
    setText('');
    setShowSuggestions(false);
    await props.onSubmit(trimmed, options);
  }

  function chooseSuggestion(suggestion: Suggestion) {
    if (suggestion.disabled) return;
    if (suggestion.kind === 'skill') {
      setSelectedSkillName(suggestion.name);
      setText((current) => replaceTrigger(current, `$${suggestion.name} `));
    } else if (suggestion.kind === 'agent') {
      setSelectedAgentName(suggestion.name);
      setText((current) => replaceTrigger(current, `#${suggestion.name} `));
    } else {
      setText((current) => replaceTrigger(current, `${suggestion.name} `));
    }
    setShowSuggestions(false);
  }

  const placeholder = 'Ask Codex anything…';

  return (
    <div className="composer-wrap codex-composer-wrap">
      {showSuggestions && suggestions.length > 0 ? (
        <div className="floating-command-menu">
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.kind}:${suggestion.name}:${suggestion.path ?? ''}`}
              className={suggestion.disabled ? 'disabled' : ''}
              onClick={() => chooseSuggestion(suggestion)}
              disabled={suggestion.disabled}
            >
              <span className="suggestion-icon">{suggestion.kind === 'skill' ? '◇' : suggestion.kind === 'agent' ? '◎' : '/'}</span>
              <span className="suggestion-main">
                <strong>{suggestion.kind === 'skill' ? `$${suggestion.name}` : suggestion.kind === 'agent' ? `#${suggestion.name}` : suggestion.name}</strong>
                <span>{suggestion.description}</span>
              </span>
              <span className="suggestion-scope">{suggestion.kind}</span>
            </button>
          ))}
        </div>
      ) : null}

      {showRunConfig ? (
        <div className="run-config-popover">
          <label>
            <span>Model</span>
            <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Use server default" />
          </label>
          <label>
            <span>Reasoning</span>
            <select value={effort} onChange={(event) => setEffort(event.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="xhigh">Extra High</option>
            </select>
          </label>
          <label>
            <span>Summary</span>
            <select value={summary} onChange={(event) => setSummary(event.target.value)}>
              <option value="none">None</option>
              <option value="concise">Concise</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>
          <label>
            <span>Sandbox</span>
            <select value={sandbox} onChange={(event) => setSandbox(event.target.value)}>
              <option value="readOnly">Read only</option>
              <option value="workspaceWrite">Workspace write</option>
              <option value="dangerFullAccess">Full access</option>
            </select>
          </label>
          <label>
            <span>Approval</span>
            <select value={approvalPolicy} onChange={(event) => setApprovalPolicy(event.target.value)}>
              <option value="unlessTrusted">Unless trusted</option>
              <option value="onRequest">On request</option>
              <option value="onFailure">On failure</option>
              <option value="never">Never</option>
            </select>
          </label>
        </div>
      ) : null}

      <div className="codex-composer">
        <textarea
          value={text}
          disabled={props.disabled}
          onChange={(e) => {
            setText(e.target.value);
            setShowSuggestions(hasOpenTrigger(e.target.value));
          }}
          onFocus={() => setShowSuggestions(hasOpenTrigger(text))}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
            if (e.key === 'Escape') {
              setShowSuggestions(false);
              setShowRunConfig(false);
            }
          }}
          placeholder={placeholder}
        />

        <div className="composer-bottom-row">
          <div className="composer-left-tools">
            <button className="round-tool" title="Add context" disabled>＋</button>
            <button className="model-chip" onClick={() => setShowRunConfig((value) => !value)} title="Configure this turn">
              {model.trim() || props.codexWebConfig?.defaultModel || 'Default model'}
            </button>
            <button className="model-chip" onClick={() => setShowRunConfig((value) => !value)} title="Reasoning effort">{effortLabel(effort)}⌄</button>
            {selectedSkill ? (
              <button className="selected-skill-pill" onClick={() => setSelectedSkillName('')} title={selectedSkill.path}>
                ${selectedSkill.name} ×
              </button>
            ) : null}
            {selectedAgent ? (
              <button className="selected-agent-pill" onClick={() => setSelectedAgentName('')} title={selectedAgent.path}>
                #{selectedAgent.name} ×
              </button>
            ) : null}
          </div>

          <div className="composer-right-tools">
            {props.skillsError ? <span className="composer-error">skills unavailable</span> : null}
            {props.agentsError ? <span className="composer-error">agents unavailable</span> : null}
            <button className="round-tool" onClick={props.onReloadSkills} disabled={props.skillsLoading || props.agentsLoading} title="Reload skills and agents">{props.skillsLoading || props.agentsLoading ? '…' : '◇'}</button>
            <button className="round-tool" onClick={() => setShowRunConfig((value) => !value)} title="Run configuration">▣</button>
            <button className="round-tool" disabled title="Voice input not implemented">⌕</button>
            <button className="send-orb" onClick={submit} disabled={props.disabled || !text.trim()} title="Send">↑</button>
          </div>
        </div>

        <div className="mode-row">
          <button className="mode-option active" title="Run in the current project directory">Local</button>
          <span className="mode-spacer" />
          <span className="branch-chip">{sandboxLabel(sandbox)} · {approvalLabel(approvalPolicy)}</span>
        </div>
      </div>

      <div className="composer-hint codex-composer-hint" aria-hidden="true" />
    </div>
  );
}

function hasOpenTrigger(text: string): boolean {
  const trigger = currentTrigger(text);
  return trigger?.startsWith('/') || trigger?.startsWith('$') || trigger?.startsWith('#') || false;
}

function currentTrigger(text: string): string | undefined {
  const afterBreak = text.split(/\n/).at(-1) ?? text;
  const token = afterBreak.split(/\s/).at(-1) ?? '';
  if (token.startsWith('/') || token.startsWith('$') || token.startsWith('#')) return token;
  return undefined;
}

function replaceTrigger(text: string, replacement: string): string {
  const parts = text.split(/(\s+)/);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i].startsWith('/') || parts[i].startsWith('$') || parts[i].startsWith('#')) {
      parts[i] = replacement;
      return parts.join('');
    }
  }
  return `${text}${text.endsWith(' ') || !text ? '' : ' '}${replacement}`;
}

function buildSuggestions(text: string, skills: SkillSummary[], agents: AgentSummary[]): Suggestion[] {
  const trigger = currentTrigger(text);
  if (!trigger) return [];
  if (trigger.startsWith('/')) {
    const q = trigger.toLowerCase();
    return commands
      .filter((command) => command.name.toLowerCase().startsWith(q))
      .map((command) => ({ kind: 'command', ...command }));
  }
  if (trigger.startsWith('$')) {
    const q = trigger.slice(1).toLowerCase();
    return skills
      .filter((skill) => !q || skill.name.toLowerCase().includes(q))
      .slice(0, 10)
      .map((skill) => ({
        kind: 'skill',
        name: skill.name,
        description: skill.description,
        path: skill.path,
        disabled: skill.enabled === false
      }));
  }
  if (trigger.startsWith('#')) {
    const q = trigger.slice(1).toLowerCase();
    return agents
      .filter((agent) => !q || agent.name.toLowerCase().includes(q) || agent.aliases?.some((alias) => alias.toLowerCase().includes(q)))
      .slice(0, 10)
      .map((agent) => ({
        kind: 'agent',
        name: agent.name,
        description: agent.description,
        path: agent.path
      }));
  }
  return [];
}

function effortLabel(value: string): string {
  if (value === 'xhigh') return 'Extra High';
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : 'Reasoning';
}

function sandboxLabel(value: string): string {
  if (value === 'readOnly') return 'read only';
  if (value === 'workspaceWrite') return 'workspace write';
  if (value === 'dangerFullAccess') return 'full access';
  return value || 'sandbox';
}

function approvalLabel(value: string): string {
  if (value === 'unlessTrusted') return 'unless trusted';
  if (value === 'onRequest') return 'on request';
  if (value === 'onFailure') return 'on failure';
  return value || 'approval';
}

const commands = [
  { name: '/plan', description: 'Ask Codex to make or update a multi-step implementation plan.' },
  { name: '/review', description: 'Review uncommitted changes or compare against a base branch.' },
  { name: '/status', description: 'Show thread id, context, runtime, and rate limit state.' },
  { name: '/mcp', description: 'Open connected MCP server status.' },
  { name: '/goal', description: 'Set a durable goal for this thread.' },
  { name: '/fix', description: 'Diagnose a failure and make a minimal patch.' },
  { name: '/agent', description: 'Delegate investigation to a custom or built-in subagent.' }
];
