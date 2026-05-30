import type { ApprovalRequest, ThreadSummary, TimelineCard } from '../../shared/types.js';

export type SupervisionState = 'idle' | 'running' | 'waiting_approval' | 'failed' | 'review' | 'complete';

export type SupervisionSummary = {
  state: SupervisionState;
  label: string;
  current: string;
  detail: string;
  nextAction: string;
  turnId?: string;
  itemId?: string;
  updatedAt?: number;
  counts: {
    commands: number;
    files: number;
    approvals: number;
    failed: number;
  };
};

export function deriveSupervisionSummary(input: {
  thread?: ThreadSummary;
  cards: TimelineCard[];
  approvals: ApprovalRequest[];
}): SupervisionSummary {
  const cards = [...input.cards].sort((a, b) => (a.updatedAt ?? a.createdAt) - (b.updatedAt ?? b.createdAt));
  const approvals = input.approvals.filter((approval) => !input.thread?.id || !approval.threadId || approval.threadId === input.thread.id);
  const commands = cards.filter((card) => card.kind === 'command');
  const files = cards.filter((card) => card.kind === 'fileChange');
  const failed = cards.filter(isFailedCard);
  const threadRunning = isRunningThread(input.thread?.status);
  const activeCard = threadRunning ? [...cards].reverse().find(isActiveCard) : undefined;
  const latestCard = cards.at(-1);
  const current = activeCard ?? latestCard;
  const pendingApproval = approvals[0];

  const counts = {
    commands: commands.length,
    files: files.length,
    approvals: approvals.length,
    failed: failed.length
  };

  if (pendingApproval) {
    return {
      state: 'waiting_approval',
      label: 'Waiting approval',
      current: pendingApproval.title,
      detail: pendingApproval.command ?? pendingApproval.reason ?? `${pendingApproval.kind} approval requested`,
      nextAction: 'Review and decide the pending approval.',
      turnId: pendingApproval.turnId,
      itemId: pendingApproval.itemId,
      updatedAt: pendingApproval.createdAt,
      counts
    };
  }

  if (activeCard || threadRunning) {
    return {
      state: 'running',
      label: 'Running',
      current: cardTitle(current) ?? 'Codex is working',
      detail: cardDetail(current) ?? 'Waiting for the next runtime event.',
      nextAction: 'Watch the focused event or open Terminal/Raw for details.',
      turnId: current?.turnId,
      itemId: current?.id,
      updatedAt: current?.updatedAt ?? current?.createdAt,
      counts
    };
  }

  if (files.length > 0) {
    const lastFile = files.at(-1);
    return {
      state: 'review',
      label: 'Review changes',
      current: cardTitle(lastFile) ?? `${files.length} file change${files.length === 1 ? '' : 's'}`,
      detail: failed.length > 0 ? `${failed.length} failed command${failed.length === 1 ? '' : 's'} before patch; ${cardDetail(lastFile) ?? 'file changes are ready.'}` : cardDetail(lastFile) ?? 'File changes are ready for diff review.',
      nextAction: failed.length > 0 ? 'Review the diff, rerun focused verification, then stage or revise.' : 'Open Diff or Git to review, stage, and commit.',
      turnId: lastFile?.turnId,
      itemId: lastFile?.id,
      updatedAt: lastFile?.updatedAt ?? lastFile?.createdAt,
      counts
    };
  }

  if (failed.length > 0) {
    const lastFailed = failed.at(-1);
    return {
      state: 'failed',
      label: 'Needs attention',
      current: cardTitle(lastFailed) ?? 'Last run failed',
      detail: cardDetail(lastFailed) ?? 'A command or agent step reported failure.',
      nextAction: 'Inspect the failed item before continuing.',
      turnId: lastFailed?.turnId,
      itemId: lastFailed?.id,
      updatedAt: lastFailed?.updatedAt ?? lastFailed?.createdAt,
      counts
    };
  }

  if (current) {
    return {
      state: 'complete',
      label: 'Idle',
      current: cardTitle(current) ?? 'Thread is idle',
      detail: cardDetail(current) ?? 'No active runtime work.',
      nextAction: 'Add context and start the next turn when ready.',
      turnId: current.turnId,
      itemId: current.id,
      updatedAt: current.updatedAt ?? current.createdAt,
      counts
    };
  }

  return {
    state: 'idle',
    label: 'Ready',
    current: input.thread?.name ?? input.thread?.preview ?? 'No active work',
    detail: 'Start a turn to create execution events.',
    nextAction: 'Attach context, choose an agent or skill, then send a task.',
    updatedAt: input.thread?.updatedAt ?? input.thread?.createdAt,
    counts
  };
}

export function supervisionStateClass(state: SupervisionState): string {
  if (state === 'waiting_approval') return 'waiting_approval';
  return state;
}

function isRunningThread(status?: string): boolean {
  const value = String(status ?? '').toLowerCase();
  return value.includes('running') || value.includes('active') || value.includes('progress') || value.includes('approval');
}

function isActiveCard(card: TimelineCard): boolean {
  const value = String(card.status ?? '').toLowerCase();
  return value.includes('running') || value.includes('progress') || value.includes('approval');
}

function isFailedCard(card: TimelineCard): boolean {
  const status = String(card.status ?? '').toLowerCase();
  return status.includes('fail') || status.includes('error') || (card.exitCode !== undefined && card.exitCode !== null && card.exitCode !== 0);
}

function cardTitle(card?: TimelineCard): string | undefined {
  if (!card) return undefined;
  if (card.kind === 'command') return card.command ?? card.title;
  if (card.kind === 'fileChange') return card.filePath ?? card.title;
  return card.title;
}

function cardDetail(card?: TimelineCard): string | undefined {
  if (!card) return undefined;
  if (card.kind === 'command') {
    if (card.exitCode !== undefined && card.exitCode !== null) return `exit ${card.exitCode} · ${card.status ?? 'command'}`;
    return card.cwd ? `${card.status ?? 'command'} · ${card.cwd}` : card.status ?? 'command';
  }
  if (card.kind === 'fileChange') return card.filePath ? `changed file · ${card.filePath}` : 'file change';
  if (card.kind === 'agent' && card.text) return compact(card.text);
  if (card.kind === 'plan' && card.text) return compact(card.text);
  return card.status ?? card.kind;
}

function compact(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}
