import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type {
  AgentSummary,
  FileReadResult,
  FileTreeNode,
  GitDiffResult,
  GitHubActionsSummary,
  GitStatusSummary,
  ServerHealth,
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
type BrowserContextTarget = {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  source: string;
  cardId?: string;
  capturedAt?: number;
  kind: 'local' | 'remote' | 'space';
};
export type ComposerCapabilitySelection = { requestId: number; kind: 'skill' | 'agent'; name: string };

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
  githubActions?: GitHubActionsSummary;
  health?: ServerHealth;
  browserFeedback?: string;
  artifactFeedback?: string;
  skillsLoading: boolean;
  agentsLoading?: boolean;
  skillsError?: string;
  agentsError?: string;
  capabilitySelection?: ComposerCapabilitySelection;
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const agents = props.agents ?? [];
  const selectedSkill = useMemo(() => props.skills.find((skill) => skill.name === selectedSkillName), [props.skills, selectedSkillName]);
  const selectedAgent = useMemo(() => agents.find((agent) => agent.name === selectedAgentName), [agents, selectedAgentName]);
  const suggestions = useMemo(() => buildSuggestions(text, props.skills, agents), [text, props.skills, agents]);
  const terminalCards = useMemo(() => (props.cards ?? []).filter((card) => card.kind === 'command'), [props.cards]);
  const lastTerminalCard = terminalCards.at(-1);
  const browserTargets = useMemo(() => contextBrowserTargets(props.cards ?? [], props.health), [props.cards, props.health]);
  const artifacts = useMemo(() => contextArtifactCards(props.cards ?? []), [props.cards]);
  const browserFeedback = props.browserFeedback?.trim() ?? '';
  const artifactFeedback = props.artifactFeedback?.trim() ?? '';
  const fileOptions = useMemo(() => flattenTree(props.fileTree).filter((item) => item.node.path !== '.').slice(0, 18), [props.fileTree]);
  const showStarterPrompts = !text.trim() && contextAttachments.length === 0 && (props.cards?.length ?? 0) === 0;

  useEffect(() => {
    const selection = props.capabilitySelection;
    if (!selection) return;

    if (selection.kind === 'skill') {
      const skill = props.skills.find((item) => item.name === selection.name);
      if (!skill || skill.enabled === false) return;
      setSelectedSkillName(skill.name);
      attachContext(skillAttachment(skill));
      setText((current) => ensureCapabilityToken(current, `$${skill.name}`));
    } else {
      const agent = agents.find((item) => item.name === selection.name);
      if (!agent) return;
      setSelectedAgentName(agent.name);
      attachContext(agentAttachment(agent));
      setText((current) => ensureCapabilityToken(current, `#${agent.name}`));
    }

    setShowSuggestions(false);
    setShowContextPicker(false);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }, [props.capabilitySelection?.requestId]);

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

  function chooseStarterPrompt(prompt: string) {
    setText(prompt);
    setShowSuggestions(false);
    setShowContextPicker(false);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
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
                icon="branch"
                title="Release evidence"
                subtitle={releaseEvidenceSummary(props.gitStatus, props.githubActions, props.health)}
                disabled={!props.gitStatus?.isRepo && !props.githubActions && !props.health}
                onClick={() => attachContext(releaseEvidenceAttachment(props.gitStatus, props.githubActions, props.health))}
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
              <div className="context-picker-label">Evidence</div>
              <ContextOption
                icon="panel"
                title="Browser evidence"
                subtitle={browserEvidenceSummary(browserTargets, props.health, browserFeedback)}
                disabled={browserTargets.length === 0 && !props.health && !browserFeedback}
                onClick={() => attachContext(browserEvidenceAttachment(browserTargets, props.health, browserFeedback))}
              />
              <ContextOption
                icon="file"
                title="Artifact evidence"
                subtitle={artifactEvidenceSummary(artifacts, artifactFeedback)}
                disabled={artifacts.length === 0 && !artifactFeedback}
                onClick={() => attachContext(artifactEvidenceAttachment(artifacts, artifactFeedback))}
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
          ref={textareaRef}
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
              <Icon name="plus" size={16} />
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

      {showStarterPrompts ? (
        <div className="composer-starter-prompts" aria-label="Starter prompts">
          {starterPrompts.map((prompt) => (
            <button key={prompt.title} className="starter-prompt" onClick={() => chooseStarterPrompt(prompt.prompt)} disabled={props.disabled}>
              <span className="starter-prompt-icon"><Icon name={prompt.icon} size={14} /></span>
              <span>
                <strong>{prompt.title}</strong>
                <small>{prompt.subtitle}</small>
              </span>
              <Icon name="plus" size={13} />
            </button>
          ))}
        </div>
      ) : null}

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

function ensureCapabilityToken(text: string, token: string): string {
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.includes(token)) return text;
  return text.trim() ? `${token} ${text}` : `${token} `;
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

function releaseEvidenceAttachment(status?: GitStatusSummary, actions?: GitHubActionsSummary, health?: ServerHealth): TurnContextAttachment {
  const hfUrl = health?.huggingFace?.publicUrl ?? (health?.huggingFace?.spaceHost ? `https://${health.huggingFace.spaceHost}` : undefined);
  const runtimeBuild = health?.build?.sha;
  const head = status?.head;
  const upstreamHead = status?.upstreamHead;
  const files = status?.isRepo ? status.files : [];
  const runLines = actions?.runs.length
    ? actions.runs.slice(0, 6).map((run) => `- ${run.name}: ${run.status ?? 'unknown'} / ${run.conclusion ?? 'pending'} · ${run.headSha ? shortSha(run.headSha) : 'unknown sha'}${run.htmlUrl ? ` · ${run.htmlUrl}` : ''}`)
    : ['- no workflow runs loaded'];

  return {
    id: 'releaseEvidence:current',
    kind: 'releaseEvidence',
    title: 'Release evidence',
    subtitle: releaseEvidenceSummary(status, actions, health),
    content: [
      'Release verification evidence:',
      `Branch: ${status?.branch ?? 'unknown'}`,
      `HEAD: ${head ?? 'unknown'}`,
      `Upstream: ${status?.upstream ?? 'unknown'}`,
      `Upstream HEAD: ${upstreamHead ?? 'unknown'}`,
      `Remote: ${status?.remoteUrl ?? 'unknown'}`,
      `Working tree: ${files.length} changed file${files.length === 1 ? '' : 's'}`,
      `GitHub Actions: ${githubActionsLabel(actions)}`,
      `Actions checked SHA: ${actions?.checkedSha ?? actions?.headSha ?? 'unknown'}`,
      `Runtime build SHA: ${runtimeBuild ?? 'unknown'}`,
      `HF enabled: ${health?.huggingFace?.enabled ? 'yes' : 'no'}`,
      `HF target: ${health?.huggingFace?.spaceId ?? health?.huggingFace?.spaceHost ?? 'unknown'}`,
      `HF URL: ${hfUrl ?? 'unknown'}`,
      '',
      'Recent GitHub Actions runs:',
      ...runLines,
      '',
      'Release proof checklist:',
      '- Confirm local review package contains only intended files.',
      '- Confirm GitHub Actions passed for the commit being released.',
      '- Confirm Hugging Face /healthz build.sha matches that GitHub commit.',
      '- Run the Hugging Face smoke script against the Space URL before calling release complete.'
    ].join('\n'),
    metadata: {
      branch: status?.branch ?? '',
      head: head ?? '',
      upstreamHead: upstreamHead ?? '',
      changedFiles: files.length,
      actionsState: actions?.state ?? 'unknown',
      checkedSha: actions?.checkedSha ?? actions?.headSha ?? '',
      runtimeBuild: runtimeBuild ?? '',
      hfEnabled: Boolean(health?.huggingFace?.enabled),
      hfUrl: hfUrl ?? ''
    }
  };
}

function browserEvidenceAttachment(targets: BrowserContextTarget[], health?: ServerHealth, feedback = ''): TurnContextAttachment {
  const active = targets[0];
  const feedbackText = feedback.trim();
  const targetLines = targets.length
    ? targets.slice(0, 8).map((target) => `- ${target.title}: ${target.url} · ${targetKindLabel(target.kind)} · ${target.source}${target.capturedAt ? ` · captured ${formatTime(target.capturedAt)}` : ''}`)
    : ['- no browser preview URL captured'];

  return {
    id: 'browserEvidence:current',
    kind: 'browserEvidence',
    title: 'Browser evidence',
    subtitle: browserEvidenceSummary(targets, health),
    content: [
      'Browser and runtime evidence:',
      `Active target: ${active ? active.url : 'none'}`,
      `Active target kind: ${active ? targetKindLabel(active.kind) : 'none'}`,
      `Runtime: ${health?.appServer ?? 'unknown'}`,
      `Ready: ${health ? (health.ready ? 'yes' : 'no') : 'unknown'}`,
      `Build SHA: ${health?.build?.sha ?? 'unknown'}`,
      `HF enabled: ${health?.huggingFace?.enabled ? 'yes' : 'no'}`,
      `HF target: ${health?.huggingFace?.publicUrl ?? health?.huggingFace?.spaceHost ?? health?.huggingFace?.spaceId ?? 'unknown'}`,
      '',
      'Targets:',
      ...targetLines,
      '',
      'Observed feedback:',
      feedbackText || '- none recorded',
      '',
      'Follow-up instructions:',
      '- Inspect the referenced preview target or runtime evidence before making UI changes.',
      '- Verify the affected view in a browser at desktop and mobile widths.',
      '- If a target is a Hugging Face Space, compare /healthz build.sha with the Git commit before calling the preview current.'
    ].join('\n'),
    metadata: {
      targets: targets.length,
      activeUrl: active?.url ?? '',
      runtime: health?.appServer ?? '',
      ready: Boolean(health?.ready),
      buildSha: health?.build?.sha ?? '',
      hfEnabled: Boolean(health?.huggingFace?.enabled),
      feedbackRecorded: Boolean(feedbackText)
    }
  };
}

function artifactEvidenceAttachment(artifacts: TimelineCard[], feedback = ''): TurnContextAttachment {
  const selected = artifacts[0];
  const feedbackText = feedback.trim();
  const artifactLines = artifacts.slice(0, 10).map((artifact) => `- ${artifact.filePath ?? artifact.title}: ${artifactKind(artifact)} · ${artifactSubtitle(artifact)} · ${formatTime(artifact.createdAt)}`);
  return {
    id: 'artifactEvidence:current',
    kind: 'artifactEvidence',
    title: 'Artifact evidence',
    subtitle: artifacts.length ? `${artifacts.length} thread artifact${artifacts.length === 1 ? '' : 's'}` : 'No artifacts captured',
    content: [
      'Thread artifact evidence:',
      `Selected artifact: ${selected ? selected.filePath ?? selected.title : 'none'}`,
      `Selected kind: ${selected ? artifactKind(selected) : 'none'}`,
      `Artifact count: ${artifacts.length}`,
      '',
      'Artifacts:',
      ...(artifactLines.length ? artifactLines : ['- none']),
      '',
      'Selected artifact excerpt:',
      selected ? artifactExcerpt(selected) : 'No artifact excerpt available.',
      '',
      'Follow-up feedback:',
      feedbackText || '- none recorded',
      '',
      'Follow-up instructions:',
      '- Use the artifact as evidence, not as a replacement for inspecting live source files.',
      '- Preserve relevant diffs, logs, and plan details while scoping the next fix or review.',
      '- Verify the artifact still appears in the Artifacts pane after the next implementation pass.'
    ].join('\n'),
    metadata: {
      artifacts: artifacts.length,
      selectedId: selected?.id ?? '',
      selectedKind: selected ? artifactKind(selected) : '',
      selectedPath: selected?.filePath ?? '',
      feedbackRecorded: Boolean(feedbackText)
    }
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

function releaseEvidenceSummary(status?: GitStatusSummary, actions?: GitHubActionsSummary, health?: ServerHealth): string {
  const head = status?.head ? shortSha(status.head) : 'unknown HEAD';
  const actionsLabel = githubActionsLabel(actions);
  const runtime = health?.build?.sha ? shortSha(health.build.sha) : 'runtime unknown';
  const hf = health?.huggingFace?.enabled ? (health.huggingFace.spaceHost ?? health.huggingFace.spaceId ?? 'HF configured') : 'self-hosted';
  return `${head} · ${actionsLabel} · ${runtime} · ${hf}`;
}

function browserEvidenceSummary(targets: BrowserContextTarget[], health?: ServerHealth, feedback = ''): string {
  const runtime = health ? (health.ready ? 'runtime ready' : health.ok ? 'runtime starting' : 'runtime unhealthy') : 'runtime unknown';
  const target = targets[0]?.url ?? 'no preview target';
  const notes = feedback.trim() ? ' · notes saved' : '';
  return `${targets.length} target${targets.length === 1 ? '' : 's'} · ${runtime} · ${target}${notes}`;
}

function artifactEvidenceSummary(artifacts: TimelineCard[], feedback = ''): string {
  const base = artifacts.length ? `${artifacts.length} thread artifact${artifacts.length === 1 ? '' : 's'} ready for follow-up` : 'No artifacts captured in this thread';
  return feedback.trim() ? `${base} · notes saved` : base;
}

function githubActionsLabel(actions?: GitHubActionsSummary): string {
  if (!actions) return 'Actions loading';
  if (actions.error) return 'Actions unavailable';
  if (actions.state === 'success') return 'Actions passing';
  if (actions.state === 'failure') return 'Actions failing';
  if (actions.state === 'pending') return 'Actions pending';
  return 'Actions unknown';
}

function shortSha(value: string): string {
  return value.slice(0, 12);
}

function contextBrowserTargets(cards: TimelineCard[], health?: ServerHealth): BrowserContextTarget[] {
  const seen = new Set<string>();
  const targets: BrowserContextTarget[] = [];
  const push = (target: BrowserContextTarget) => {
    if (seen.has(target.url)) return;
    seen.add(target.url);
    targets.push(target);
  };

  if (health?.huggingFace?.publicUrl) {
    push({
      id: `hf:${health.huggingFace.publicUrl}`,
      title: 'Hugging Face Space',
      subtitle: health.huggingFace.spaceId ?? health.huggingFace.spaceHost ?? 'configured Space target',
      url: health.huggingFace.publicUrl,
      source: 'runtime health',
      kind: 'space'
    });
  } else if (health?.huggingFace?.spaceHost) {
    const url = `https://${health.huggingFace.spaceHost}`;
    push({
      id: `hf:${url}`,
      title: 'Hugging Face Space',
      subtitle: health.huggingFace.spaceId ?? health.huggingFace.spaceHost,
      url,
      source: 'runtime health',
      kind: 'space'
    });
  }

  for (const card of [...cards].reverse()) {
    if (card.kind !== 'command') continue;
    for (const url of extractUrls([card.command, card.stdout, card.stderr, card.text].filter(Boolean).join('\n'))) {
      push({
        id: `${card.id}:${url}`,
        title: localUrlLabel(url),
        subtitle: card.command ?? card.title,
        url,
        source: `command ${card.id}`,
        cardId: card.id,
        capturedAt: card.createdAt,
        kind: isLocalUrl(url) ? 'local' : 'remote'
      });
    }
  }

  return targets.slice(0, 8);
}

function contextArtifactCards(cards: TimelineCard[]): TimelineCard[] {
  return cards
    .filter((card) => card.kind === 'fileChange' || card.kind === 'agent' || card.kind === 'plan' || (card.kind === 'command' && (card.stdout || card.stderr)))
    .slice(-12)
    .reverse();
}

function extractUrls(value: string): string[] {
  const matches = value.match(/\bhttps?:\/\/[^\s<>"'`]+/g) ?? [];
  return matches.map((url) => url.replace(/[),.;\]]+$/, '')).filter((url, index, all) => all.indexOf(url) === index);
}

function isLocalUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\b/i.test(url);
}

function localUrlLabel(url: string): string {
  if (!isLocalUrl(url)) return new URL(url).hostname;
  const parsed = new URL(url);
  return parsed.port ? `Local preview :${parsed.port}` : 'Local preview';
}

function targetKindLabel(kind: BrowserContextTarget['kind']): string {
  if (kind === 'space') return 'HF Space';
  if (kind === 'local') return 'local';
  return 'remote';
}

function artifactKind(card: TimelineCard): string {
  if (card.kind === 'fileChange') return 'diff';
  if (card.kind === 'command') return 'terminal log';
  if (card.kind === 'plan') return 'plan';
  if (card.kind === 'agent') return 'summary';
  return card.kind;
}

function artifactSubtitle(card: TimelineCard): string {
  if (card.kind === 'fileChange') return diffStats(card.diff).label;
  if (card.kind === 'command') return card.exitCode === null || card.exitCode === undefined ? card.status ?? 'command output' : `exit ${card.exitCode}`;
  return card.status ?? card.kind;
}

function artifactExcerpt(card: TimelineCard): string {
  const value = card.diff || card.stdout || card.stderr || card.text || safeJson(card.payload ?? card);
  return compactText(value, 1800);
}

function diffStats(diff?: string): { added: number; removed: number; label: string } {
  let added = 0;
  let removed = 0;
  for (const line of (diff ?? '').split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added += 1;
    if (line.startsWith('-')) removed += 1;
  }
  return { added, removed, label: `+${added} -${removed}` };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({ error: 'Unable to serialize payload.' }, null, 2);
  }
}

function compactText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function formatTime(value?: number): string {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    case 'releaseEvidence':
      return 'branch';
    case 'browserEvidence':
      return 'panel';
    case 'artifactEvidence':
      return 'file';
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

const starterPrompts: Array<{ title: string; subtitle: string; prompt: string; icon: IconName }> = [
  {
    title: 'Review current changes',
    subtitle: 'Inspect Git status, diffs, and commit readiness.',
    prompt: 'Review the current working tree, summarize the risky changes, and tell me what is ready to commit.',
    icon: 'check'
  },
  {
    title: 'Plan next UI pass',
    subtitle: 'Prioritize visual and workflow improvements.',
    prompt: 'Audit this command center UI and propose the next focused OpenAI Codex-style improvement pass.',
    icon: 'panel'
  },
  {
    title: 'Inspect Skills and Agents',
    subtitle: 'Check available capabilities and diagnostics.',
    prompt: 'Inspect the available Skills and Agents for this workspace and summarize what can be used next.',
    icon: 'agent'
  },
  {
    title: 'Verify deployment',
    subtitle: 'Compare GitHub Actions, source commit, and HF runtime.',
    prompt: 'Verify the GitHub and Hugging Face deployment chain for this project and report any mismatch.',
    icon: 'branch'
  }
];
