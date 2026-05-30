import { useMemo, useState, type CSSProperties } from 'react';
import type {
  AgentSummary,
  FileReadResult,
  FileTreeNode,
  GitDiffResult,
  GitStatusSummary,
  SkillSummary,
  StartTurnRequest,
  ThreadSummary,
  TimelineCard,
  TurnContextAttachment,
  TurnContextAttachmentKind,
  CodexWebConfig
} from '../../shared/types.js';
import { Icon, type IconName } from './Icon.js';

type Suggestion = { kind: 'command' | 'skill' | 'agent'; name: string; description?: string; path?: string; disabled?: boolean };
type ComposerOptions = Pick<StartTurnRequest, 'model' | 'effort' | 'sandbox' | 'approvalPolicy' | 'summary'> & {
  skill?: { name: string; path: string };
  agent?: { name: string; path?: string };
  context?: TurnContextAttachment[];
};
type ContextFileOption = { node: FileTreeNode; depth: number };

const MAX_CONTEXT_CONTENT_CHARS = 36_000;

export function Composer(props: {
  disabled: boolean;
  selectedThread?: ThreadSummary;
  skills: SkillSummary[];
  agents?: AgentSummary[];
  cards?: TimelineCard[];
  fileTree?: FileTreeNode;
  fileContent?: FileReadResult;
  gitStatus?: GitStatusSummary;
  gitDiff?: GitDiffResult;
  skillsLoading: boolean;
  agentsLoading?: boolean;
  skillsError?: string;
  agentsError?: string;
  codexWebConfig?: CodexWebConfig;
  onReloadSkills: () => void;
  onReadFileContext?: (path: string) => Promise<FileReadResult>;
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
  const [showContextPicker, setShowContextPicker] = useState(false);
  const [contextAttachments, setContextAttachments] = useState<TurnContextAttachment[]>([]);
  const [contextBusyId, setContextBusyId] = useState<string | undefined>();

  const agents = props.agents ?? [];
  const selectedSkill = useMemo(() => props.skills.find((skill) => skill.name === selectedSkillName), [props.skills, selectedSkillName]);
  const selectedAgent = useMemo(() => agents.find((agent) => agent.name === selectedAgentName), [agents, selectedAgentName]);
  const suggestions = useMemo(() => buildSuggestions(text, props.skills, agents), [text, props.skills, agents]);
  const terminalCards = useMemo(() => (props.cards ?? []).filter((card) => card.kind === 'command'), [props.cards]);
  const lastTerminalCard = terminalCards.at(-1);
  const fileOptions = useMemo(() => flattenTree(props.fileTree).filter((item) => item.node.path !== '.').slice(0, 18), [props.fileTree]);

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
      ...(selectedAgent ? { agent: { name: selectedAgent.name, path: selectedAgent.path } } : {}),
      ...(contextAttachments.length ? { context: contextAttachments } : {})
    };
    setText('');
    setShowSuggestions(false);
    setShowContextPicker(false);
    setContextAttachments([]);
    await props.onSubmit(trimmed, options);
  }

  function attachContext(attachment: TurnContextAttachment) {
    setContextAttachments((current) => {
      const next = normalizeAttachment(attachment);
      return current.some((item) => item.id === next.id) ? current : [...current, next].slice(0, 12);
    });
    setShowContextPicker(false);
  }

  async function attachFile(node: FileTreeNode) {
    if (node.type === 'directory') {
      attachContext(folderAttachment(node));
      return;
    }
    if (node.type !== 'file') return;
    const id = `file:${node.path}`;
    setContextBusyId(id);
    try {
      const file = props.fileContent?.path === node.path ? props.fileContent : await props.onReadFileContext?.(node.path);
      attachContext(file ? fileAttachment(file) : pathOnlyFileAttachment(node));
    } finally {
      setContextBusyId(undefined);
    }
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
              <span className="suggestion-icon"><Icon name={suggestion.kind === 'skill' ? 'spark' : suggestion.kind === 'agent' ? 'agent' : 'terminal'} size={15} /></span>
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

      {showContextPicker ? (
        <div className="context-picker-popover">
          <div className="context-picker-head">
            <div>
              <strong>Add context</strong>
              <span>Attach live project state to the next turn.</span>
            </div>
            <button className="round-tool" title="Close context picker" aria-label="Close context picker" onClick={() => setShowContextPicker(false)}>
              <Icon name="close" size={14} />
            </button>
          </div>

          <div className="context-picker-grid">
            <section className="context-picker-section">
              <div className="context-picker-label">Review state</div>
              <ContextOption
                icon="branch"
                title="Git status"
                subtitle={props.gitStatus?.isRepo ? gitStatusSummary(props.gitStatus) : 'No Git repository loaded'}
                disabled={!props.gitStatus?.isRepo}
                onClick={() => props.gitStatus ? attachContext(gitStatusAttachment(props.gitStatus)) : undefined}
              />
              <ContextOption
                icon="file"
                title="Current diff"
                subtitle={props.gitDiff?.diff ? diffSummary(props.gitDiff) : 'Open a changed file in Git first'}
                disabled={!props.gitDiff?.diff}
                onClick={() => props.gitDiff ? attachContext(gitDiffAttachment(props.gitDiff)) : undefined}
              />
              <ContextOption
                icon="terminal"
                title="Last terminal output"
                subtitle={lastTerminalCard?.command ?? 'No command output in this thread'}
                disabled={!lastTerminalCard}
                onClick={() => lastTerminalCard ? attachContext(terminalAttachment(lastTerminalCard)) : undefined}
              />
            </section>

            <section className="context-picker-section">
              <div className="context-picker-label">Project files</div>
              {props.fileContent ? (
                <ContextOption
                  icon="file"
                  title="Current file"
                  subtitle={props.fileContent.path}
                  onClick={() => attachContext(fileAttachment(props.fileContent!))}
                />
              ) : null}
              {fileOptions.length === 0 ? <div className="context-picker-empty">No project files loaded.</div> : null}
              {fileOptions.slice(0, 10).map(({ node, depth }) => (
                <ContextOption
                  key={`${node.type}:${node.path}`}
                  icon={node.type === 'directory' ? 'folder' : 'file'}
                  title={node.name}
                  subtitle={node.path}
                  indent={depth}
                  busy={contextBusyId === `file:${node.path}`}
                  disabled={node.type === 'symlink'}
                  onClick={() => void attachFile(node)}
                />
              ))}
            </section>

            <section className="context-picker-section">
              <div className="context-picker-label">Skills</div>
              {props.skills.length === 0 ? <div className="context-picker-empty">No skills available.</div> : null}
              {props.skills.slice(0, 6).map((skill) => (
                <ContextOption
                  key={skill.id}
                  icon="spark"
                  title={`$${skill.name}`}
                  subtitle={skill.description ?? skill.path ?? 'Skill'}
                  disabled={skill.enabled === false}
                  onClick={() => {
                    setSelectedSkillName(skill.name);
                    attachContext(skillAttachment(skill));
                  }}
                />
              ))}
            </section>

            <section className="context-picker-section">
              <div className="context-picker-label">Agents</div>
              {agents.length === 0 ? <div className="context-picker-empty">No agents available.</div> : null}
              {agents.slice(0, 6).map((agent) => (
                <ContextOption
                  key={agent.id}
                  icon="agent"
                  title={`#${agent.name}`}
                  subtitle={agent.description ?? agent.path ?? 'Agent'}
                  onClick={() => {
                    setSelectedAgentName(agent.name);
                    attachContext(agentAttachment(agent));
                  }}
                />
              ))}
            </section>
          </div>
        </div>
      ) : null}

      <div className="codex-composer">
        {contextAttachments.length > 0 ? (
          <div className="composer-context-strip" aria-label="Attached context">
            {contextAttachments.map((attachment) => (
              <button
                key={attachment.id}
                className={`composer-context-chip ${attachment.kind}`}
                onClick={() => setContextAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                title={`${attachment.title}${attachment.path ? ` · ${attachment.path}` : ''}`}
              >
                <Icon name={iconForContextKind(attachment.kind)} size={13} />
                <span>{attachment.title}</span>
                <Icon name="close" size={12} />
              </button>
            ))}
          </div>
        ) : null}
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
              setShowContextPicker(false);
            }
          }}
          placeholder={placeholder}
        />

        <div className="composer-bottom-row">
          <div className="composer-left-tools">
            <button
              className={`round-tool context-tool ${showContextPicker || contextAttachments.length ? 'active' : ''}`}
              title="Add context"
              aria-label={contextAttachments.length ? `Add context, ${contextAttachments.length} attached` : 'Add context'}
              onClick={() => setShowContextPicker((value) => !value)}
              disabled={props.disabled}
            >
              <Icon name="paperclip" size={16} />
              {contextAttachments.length ? <span className="tool-count">{contextAttachments.length}</span> : null}
            </button>
            <span className="mode-option active composer-local-pill" title="Run in the current project directory">Local</span>
            <button className="model-chip composer-model-chip" onClick={() => setShowRunConfig((value) => !value)} title="Configure this turn">
              {model.trim() || props.codexWebConfig?.defaultModel || 'Default model'}
            </button>
            <button className="model-chip composer-effort-chip" onClick={() => setShowRunConfig((value) => !value)} title="Reasoning effort">
              {effortLabel(effort)}<Icon name="chevronDown" size={13} />
            </button>
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
            <span className="branch-chip composer-policy-chip">{sandboxLabel(sandbox)} · {approvalLabel(approvalPolicy)}</span>
            <button className="round-tool" onClick={props.onReloadSkills} disabled={props.skillsLoading || props.agentsLoading} title="Reload skills and agents" aria-label="Reload skills and agents">
              {props.skillsLoading || props.agentsLoading ? <span className="loading-dot">...</span> : <Icon name="refresh" size={15} />}
            </button>
            <button className="round-tool" onClick={() => setShowRunConfig((value) => !value)} title="Run configuration" aria-label="Run configuration"><Icon name="sliders" size={15} /></button>
            <button className="send-orb" onClick={submit} disabled={props.disabled || !text.trim()} title="Send" aria-label="Send"><Icon name="send" size={17} /></button>
          </div>
        </div>
      </div>

      <div className="composer-hint codex-composer-hint" aria-hidden="true" />
    </div>
  );
}

function ContextOption(props: {
  icon: IconName;
  title: string;
  subtitle?: string;
  disabled?: boolean;
  busy?: boolean;
  indent?: number;
  onClick: () => void;
}) {
  return (
    <button
      className="context-picker-option"
      style={{ '--context-indent': String(Math.min(props.indent ?? 0, 3)) } as CSSProperties}
      disabled={props.disabled || props.busy}
      onClick={props.onClick}
      title={props.subtitle}
    >
      <span className="context-picker-option-icon"><Icon name={props.icon} size={14} /></span>
      <span className="context-picker-option-main">
        <strong>{props.title}</strong>
        {props.subtitle ? <span>{props.subtitle}</span> : null}
      </span>
      {props.busy ? <span className="loading-dot">...</span> : null}
    </button>
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

function flattenTree(node: FileTreeNode | undefined, depth = 0): ContextFileOption[] {
  if (!node) return [];
  const out: ContextFileOption[] = [{ node, depth }];
  for (const child of node.children ?? []) out.push(...flattenTree(child, depth + 1));
  return out;
}

function normalizeAttachment(attachment: TurnContextAttachment): TurnContextAttachment {
  const content = attachment.content ? truncateContent(attachment.content) : undefined;
  return {
    ...attachment,
    content: content?.value,
    truncated: Boolean(attachment.truncated || content?.truncated),
    createdAt: attachment.createdAt ?? Date.now()
  };
}

function fileAttachment(file: FileReadResult): TurnContextAttachment {
  return {
    id: `file:${file.path}`,
    kind: 'file',
    title: file.path.split('/').at(-1) || file.path,
    subtitle: file.path,
    path: file.path,
    content: file.content,
    truncated: file.truncated,
    metadata: { size: file.size, encoding: file.encoding }
  };
}

function pathOnlyFileAttachment(node: FileTreeNode): TurnContextAttachment {
  return {
    id: `file:${node.path}`,
    kind: 'file',
    title: node.name,
    subtitle: node.path,
    path: node.path,
    content: 'File content was not loaded in the browser. Use the path as explicit context and read the file before editing.',
    metadata: { type: node.type, size: node.size ?? 0 }
  };
}

function folderAttachment(node: FileTreeNode): TurnContextAttachment {
  return {
    id: `folder:${node.path}`,
    kind: 'folder',
    title: node.name === '.' ? 'Project root' : node.name,
    subtitle: node.path,
    path: node.path,
    content: folderOutline(node),
    metadata: { type: node.type }
  };
}

function gitStatusAttachment(status: GitStatusSummary): TurnContextAttachment {
  return {
    id: 'gitStatus:current',
    kind: 'gitStatus',
    title: 'Git status',
    subtitle: gitStatusSummary(status),
    content: formatGitStatus(status),
    metadata: {
      branch: status.branch ?? '',
      upstream: status.upstream ?? '',
      ahead: status.ahead ?? 0,
      behind: status.behind ?? 0,
      files: status.files.length
    }
  };
}

function gitDiffAttachment(diff: GitDiffResult): TurnContextAttachment {
  return {
    id: `gitDiff:${diff.cached ? 'cached' : 'working'}:${diff.path ?? 'all'}`,
    kind: 'gitDiff',
    title: diff.path ? `Diff: ${diff.path}` : 'Current diff',
    subtitle: diffSummary(diff),
    path: diff.path,
    content: diff.diff,
    metadata: { cached: Boolean(diff.cached) }
  };
}

function terminalAttachment(card: TimelineCard): TurnContextAttachment {
  return {
    id: `terminal:${card.id}`,
    kind: 'terminal',
    title: card.command ? `Command: ${card.command}` : card.title,
    subtitle: card.status ?? 'terminal output',
    content: [
      card.command ? `$ ${card.command}` : undefined,
      card.cwd ? `cwd: ${card.cwd}` : undefined,
      card.stdout ? `stdout:\n${card.stdout}` : undefined,
      card.stderr ? `stderr:\n${card.stderr}` : undefined,
      card.exitCode !== undefined && card.exitCode !== null ? `exit code: ${card.exitCode}` : undefined
    ].filter(Boolean).join('\n\n'),
    metadata: { status: card.status ?? '', exitCode: card.exitCode ?? -1 }
  };
}

function skillAttachment(skill: SkillSummary): TurnContextAttachment {
  return {
    id: `skill:${skill.path ?? skill.name}`,
    kind: 'skill',
    title: `$${skill.name}`,
    subtitle: skill.description ?? skill.path,
    path: skill.path,
    content: [
      `Skill: ${skill.name}`,
      skill.description ? `Description: ${skill.description}` : undefined,
      skill.scope ? `Scope: ${skill.scope}` : undefined,
      skill.source ? `Source: ${skill.source}` : undefined,
      skill.path ? `Path: ${skill.path}` : undefined
    ].filter(Boolean).join('\n'),
    metadata: { enabled: skill.enabled !== false }
  };
}

function agentAttachment(agent: AgentSummary): TurnContextAttachment {
  return {
    id: `agent:${agent.path ?? agent.name}`,
    kind: 'agent',
    title: `#${agent.name}`,
    subtitle: agent.description ?? agent.path,
    path: agent.path,
    content: [
      `Agent: ${agent.name}`,
      agent.description ? `Description: ${agent.description}` : undefined,
      agent.scope ? `Scope: ${agent.scope}` : undefined,
      agent.model ? `Model: ${agent.model}` : undefined,
      agent.effort ? `Effort: ${agent.effort}` : undefined,
      agent.sandbox ? `Sandbox: ${agent.sandbox}` : undefined,
      agent.aliases?.length ? `Aliases: ${agent.aliases.join(', ')}` : undefined,
      agent.path ? `Path: ${agent.path}` : undefined
    ].filter(Boolean).join('\n'),
    metadata: { hasDeveloperInstructions: Boolean(agent.hasDeveloperInstructions) }
  };
}

function folderOutline(node: FileTreeNode): string {
  const lines: string[] = [];
  function visit(current: FileTreeNode, depth: number) {
    if (lines.length >= 80) return;
    const prefix = `${'  '.repeat(depth)}-`;
    lines.push(`${prefix} ${current.path} (${current.type})`);
    for (const child of current.children ?? []) visit(child, depth + 1);
  }
  visit(node, 0);
  if (lines.length >= 80) lines.push('...');
  return lines.join('\n');
}

function formatGitStatus(status: GitStatusSummary): string {
  if (!status.isRepo) return status.error ?? 'Not a Git repository.';
  const lines = [
    `Branch: ${status.branch ?? 'HEAD'}`,
    status.upstream ? `Upstream: ${status.upstream}` : undefined,
    status.ahead ? `Ahead: ${status.ahead}` : undefined,
    status.behind ? `Behind: ${status.behind}` : undefined,
    status.files.length ? 'Files:' : 'Files: clean'
  ].filter(Boolean) as string[];
  for (const file of status.files) {
    lines.push(`${file.index}${file.workingTree} ${file.path}${file.oldPath ? ` (from ${file.oldPath})` : ''} - ${file.status}`);
  }
  return lines.join('\n');
}

function gitStatusSummary(status: GitStatusSummary): string {
  if (!status.isRepo) return status.error ?? 'Not a Git repository';
  const branch = status.branch ?? 'HEAD';
  const changed = status.files.length;
  const tracking = [status.ahead ? `ahead ${status.ahead}` : '', status.behind ? `behind ${status.behind}` : ''].filter(Boolean).join(', ');
  return `${branch} · ${changed} changed${tracking ? ` · ${tracking}` : ''}`;
}

function diffSummary(diff: GitDiffResult): string {
  const label = diff.cached ? 'staged' : 'working tree';
  return `${diff.path ?? 'all files'} · ${label} diff`;
}

function truncateContent(value: string): { value: string; truncated: boolean } {
  if (value.length <= MAX_CONTEXT_CONTENT_CHARS) return { value, truncated: false };
  return { value: `${value.slice(0, MAX_CONTEXT_CONTENT_CHARS)}\n...`, truncated: true };
}

function iconForContextKind(kind: TurnContextAttachmentKind): IconName {
  switch (kind) {
    case 'folder':
      return 'folder';
    case 'gitStatus':
      return 'branch';
    case 'terminal':
      return 'terminal';
    case 'skill':
      return 'spark';
    case 'agent':
      return 'agent';
    case 'file':
    case 'gitDiff':
    default:
      return 'file';
  }
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
