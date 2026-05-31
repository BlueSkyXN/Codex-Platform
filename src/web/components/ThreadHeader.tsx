import type { ApprovalRequest, GitStatusSummary, Project, ServerHealth, ThreadSummary, TimelineCard } from '../../shared/types.js';
import { deriveSupervisionSummary, supervisionStateClass } from '../lib/supervision.js';
import { Icon, type IconName } from './Icon.js';

function statusLabel(status?: string): string {
  if (!status || status === 'loaded') return 'Ready';
  if (status === 'waiting_approval') return 'Waiting approval';
  if (status === 'inProgress') return 'Running';
  return status.replace(/_/g, ' ');
}

function countByKind(cards: TimelineCard[], kind: TimelineCard['kind']): number {
  return cards.filter((card) => card.kind === kind).length;
}

function isRunning(status?: string): boolean {
  const s = String(status ?? '').toLowerCase();
  return s.includes('active') || s.includes('running') || s.includes('progress') || s.includes('approval');
}

function branchFromThread(thread?: ThreadSummary): string {
  const raw = thread?.raw;
  if (raw && typeof raw === 'object' && 'branch' in raw && typeof (raw as { branch?: unknown }).branch === 'string') return (raw as { branch: string }).branch;
  return 'main';
}

export function ThreadHeader(props: {
  project?: Project;
  thread?: ThreadSummary;
  cards: TimelineCard[];
  approvals: ApprovalRequest[];
  gitStatus?: GitStatusSummary;
  health?: ServerHealth;
  busy: boolean;
  onInterrupt: () => void;
}) {
  if (!props.thread || (props.cards.length === 0 && props.approvals.length === 0)) return null;

  const fileChanges = countByKind(props.cards, 'fileChange');
  const commands = countByKind(props.cards, 'command');
  const pendingApprovals = props.approvals.filter((a) => !props.thread?.id || !a.threadId || a.threadId === props.thread.id).length;
  const running = isRunning(props.thread?.status);
  const title = props.thread?.name || props.thread?.preview || props.thread?.id || 'No thread selected';
  const visibleStatus = pendingApprovals > 0 ? 'Approval' : statusLabel(props.thread?.status);
  const visibleStatusClass = pendingApprovals > 0 ? 'waiting_approval' : props.thread?.status ?? 'idle';
  const supervision = deriveSupervisionSummary({ thread: props.thread, cards: props.cards, approvals: props.approvals });
  const signals = workbenchSignals(props.cards, props.gitStatus, props.health);

  return (
    <div className="thread-header codex-thread-header">
      <div className="thread-header-main">
        <div className="thread-title-line">
          <h1>{title}</h1>
          <span className={`status-pill dot-status ${visibleStatusClass}`}>{visibleStatus}</span>
        </div>
        <div className="thread-context codex-thread-context">
          <span>Local</span>
          <span className="dot" />
          <span>{props.project?.name ?? 'No project'}</span>
          <span className="dot" />
          <code title={props.project?.cwd}>{props.project?.cwd ?? '—'}</code>
        </div>
        <div className={`agent-supervision-strip ${supervisionStateClass(supervision.state)}`} aria-label="Agent execution supervision">
          <span className="agent-supervision-icon"><Icon name={supervision.state === 'waiting_approval' ? 'clock' : supervision.state === 'failed' ? 'close' : 'agent'} size={14} /></span>
          <span className="agent-supervision-state">{supervision.label}</span>
          <strong title={supervision.current}>{supervision.current}</strong>
          <span title={supervision.detail}>{supervision.detail}</span>
          {supervision.turnId ? <code title={supervision.turnId}>{compactTurnId(supervision.turnId)}</code> : null}
        </div>
        <div className="thread-workbench-signals" aria-label="Workbench evidence signals">
          {signals.map((signal) => (
            <span key={signal.label} className={`thread-workbench-signal ${signal.tone ?? ''}`} title={signal.detail}>
              <Icon name={signal.icon} size={12} />
              <span>{signal.label}</span>
              <strong>{signal.value}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="thread-metrics codex-thread-actions">
        <span className="metric branch-metric"><Icon name="branch" size={13} /> {branchFromThread(props.thread)}</span>
        <span className="metric">{props.cards.length} items</span>
        <span className="metric">{commands} commands</span>
        <span className="metric">{fileChanges} files</span>
        {pendingApprovals > 0 ? <span className="metric attention">{pendingApprovals} approvals</span> : null}
        <button className="compact-action thread-stop-action stop-action" onClick={props.onInterrupt} disabled={!props.thread || props.busy || !running} title="Interrupt the current turn" aria-label="Interrupt the current turn">
          <Icon name="stop" size={13} />
        </button>
      </div>
    </div>
  );
}

function compactTurnId(id: string): string {
  return id.replace(/^turn_/, '').slice(-10);
}

type WorkbenchSignal = {
  label: string;
  value: string;
  detail: string;
  icon: IconName;
  tone?: 'ok' | 'warn';
};

function workbenchSignals(cards: TimelineCard[], gitStatus?: GitStatusSummary, health?: ServerHealth): WorkbenchSignal[] {
  const changedFiles = gitStatus?.isRepo ? gitStatus.files.length : countByKind(cards, 'fileChange');
  const artifactCount = artifactSignalCount(cards);
  const previewCount = browserTargetCount(cards, health);
  const release = releaseSignal(gitStatus, health);
  return [
    {
      label: 'Review',
      value: !gitStatus ? 'loading' : gitStatus.isRepo ? (changedFiles === 0 ? 'clean' : `${changedFiles} changed`) : 'no repo',
      detail: gitStatus?.isRepo ? `${changedFiles} changed file${changedFiles === 1 ? '' : 's'} in the current project.` : 'Git status is not available for this project.',
      icon: 'check',
      tone: changedFiles > 0 ? 'warn' : gitStatus?.isRepo ? 'ok' : undefined
    },
    {
      label: 'Preview',
      value: previewCount === 0 ? 'none' : `${previewCount} target${previewCount === 1 ? '' : 's'}`,
      detail: previewCount === 0 ? 'No local, remote, or Hugging Face browser target is visible for this thread.' : 'Browser targets are available for visual verification.',
      icon: 'panel',
      tone: previewCount > 0 ? 'ok' : undefined
    },
    {
      label: 'Artifacts',
      value: artifactCount === 0 ? 'none' : `${artifactCount} item${artifactCount === 1 ? '' : 's'}`,
      detail: artifactCount === 0 ? 'No thread artifacts have been captured yet.' : 'Thread artifacts are available for review or follow-up.',
      icon: 'paperclip',
      tone: artifactCount > 0 ? 'ok' : undefined
    },
    {
      label: 'Release',
      value: release.value,
      detail: release.detail,
      icon: 'branch',
      tone: release.tone
    }
  ];
}

function artifactSignalCount(cards: TimelineCard[]): number {
  return cards.filter((card) => (
    card.kind === 'fileChange'
    || card.kind === 'agent'
    || card.kind === 'plan'
    || card.kind === 'error'
    || (card.kind === 'command' && (card.stdout || card.stderr))
  )).length;
}

function browserTargetCount(cards: TimelineCard[], health?: ServerHealth): number {
  const urls = new Set<string>();
  if (health?.huggingFace?.publicUrl) urls.add(health.huggingFace.publicUrl);
  if (health?.huggingFace?.spaceHost) urls.add(`https://${health.huggingFace.spaceHost}`);
  for (const card of cards) {
    const output = [card.text, card.stdout, card.stderr].filter(Boolean).join('\n');
    for (const match of output.matchAll(/https?:\/\/[^\s)"'<>]+/g)) {
      const url = match[0].replace(/[.,;]+$/, '');
      if (/localhost|127\.0\.0\.1|hf\.space|huggingface\.co\/spaces/i.test(url)) urls.add(url);
    }
  }
  return urls.size;
}

function releaseSignal(gitStatus?: GitStatusSummary, health?: ServerHealth): { value: string; detail: string; tone?: 'ok' | 'warn' } {
  if (!gitStatus) return { value: 'loading', detail: 'Git and release evidence are still loading.' };
  if (!gitStatus.isRepo) return { value: 'no repo', detail: gitStatus.error ?? 'The current project is not a Git repository.' };
  if (gitStatus.files.length > 0) return { value: 'review', detail: 'Review and commit local changes before release readback.', tone: 'warn' };
  const buildSha = health?.build?.sha;
  if (buildSha && gitStatus.head && buildSha === gitStatus.head) {
    return { value: 'verified', detail: 'Runtime build SHA matches local Git HEAD.', tone: 'ok' };
  }
  if (health?.huggingFace?.enabled) {
    return { value: 'readback', detail: 'Hugging Face release target is visible; compare /healthz build.sha after push.' };
  }
  return { value: 'ready', detail: 'Git package is clean; no Hugging Face runtime evidence is visible.' };
}
