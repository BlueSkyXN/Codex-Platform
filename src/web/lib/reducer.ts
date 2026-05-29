import type { AppStateSnapshot, ApprovalRequest, Project, ThreadSummary, TimelineCard, UiEvent } from '../../shared/types.js';

export type ClientState = {
  connected: boolean;
  connectionMessage?: string;
  demoMode: boolean;
  projects: Project[];
  threads: ThreadSummary[];
  cards: TimelineCard[];
  approvals: ApprovalRequest[];
  selectedProjectId?: string;
  selectedThreadId?: string;
  focusedCardId?: string;
  errors: string[];
};

export const initialState: ClientState = {
  connected: false,
  demoMode: false,
  projects: [],
  threads: [],
  cards: [],
  approvals: [],
  errors: []
};

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((x) => x.id === item.id);
  if (index === -1) return [...items, item];
  const next = [...items];
  next[index] = { ...next[index], ...item };
  return next;
}

function mergeCard(existing: TimelineCard | undefined, incoming: TimelineCard): TimelineCard {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    text: incoming.text || existing.text,
    stdout: incoming.stdout || existing.stdout,
    stderr: incoming.stderr || existing.stderr,
    diff: incoming.diff || existing.diff,
    command: incoming.command || existing.command,
    cwd: incoming.cwd || existing.cwd,
    filePath: incoming.filePath || existing.filePath,
    updatedAt: incoming.updatedAt ?? Date.now()
  };
}

function upsertCard(items: TimelineCard[], item: TimelineCard): TimelineCard[] {
  const index = items.findIndex((x) => x.id === item.id);
  if (index === -1) return [...items, item];
  const next = [...items];
  next[index] = mergeCard(next[index], item);
  return next;
}

function upsertThread(items: ThreadSummary[], item: ThreadSummary): ThreadSummary[] {
  const index = items.findIndex((x) => x.id === item.id);
  if (index === -1) return [item, ...items];
  const next = [...items];
  const previous = next[index];
  next[index] = {
    ...previous,
    ...item,
    projectId: item.projectId === 'default' ? previous.projectId : item.projectId,
    updatedAt: item.updatedAt ?? Date.now()
  };
  return next;
}

function applySnapshot(state: ClientState, snapshot: AppStateSnapshot): ClientState {
  const selectedProjectId = state.selectedProjectId ?? snapshot.projects[0]?.id;
  const firstThreadForProject = snapshot.threads.find((thread) => !selectedProjectId || thread.projectId === selectedProjectId || thread.projectId === 'default');
  return {
    ...state,
    demoMode: snapshot.demoMode,
    projects: snapshot.projects,
    threads: snapshot.threads,
    cards: snapshot.cards,
    approvals: snapshot.approvals,
    selectedThreadId: snapshot.selectedThreadId ?? state.selectedThreadId ?? firstThreadForProject?.id,
    selectedProjectId,
    errors: snapshot.errors ?? state.errors
  };
}

function updateThreadStatus(threads: ThreadSummary[], threadId: string, status: string): ThreadSummary[] {
  return threads.map((thread) => (thread.id === threadId ? { ...thread, status, updatedAt: Date.now() } : thread));
}

export function reduce(state: ClientState, event: UiEvent): ClientState {
  switch (event.type) {
    case 'connected':
      return { ...state, connected: true, connectionMessage: undefined, demoMode: event.demoMode };
    case 'connection.status':
      return { ...state, connected: event.connected, connectionMessage: event.message };
    case 'raw':
      if (event.method === 'snapshot') return applySnapshot(state, event.params as AppStateSnapshot);
      if (event.method === 'connectionClosed') return { ...state, connected: false };
      if (event.method === 'selectProject') {
        const params = event.params as { projectId?: string };
        const firstThread = state.threads.find((thread) => !params.projectId || thread.projectId === params.projectId || thread.projectId === 'default');
        const firstCard = firstThread ? state.cards.find((card) => card.threadId === firstThread.id) : undefined;
        return { ...state, selectedProjectId: params.projectId, selectedThreadId: firstThread?.id, focusedCardId: firstCard?.id };
      }
      if (event.method === 'focus') {
        const params = event.params as { cardId?: string };
        return { ...state, focusedCardId: params.cardId };
      }
      return state;
    case 'project.upserted':
      return {
        ...state,
        projects: upsertById(state.projects, event.project),
        selectedProjectId: state.selectedProjectId ?? event.project.id
      };
    case 'thread.upserted':
      return {
        ...state,
        threads: upsertThread(state.threads, event.thread),
        selectedThreadId: state.selectedThreadId ?? event.thread.id,
        selectedProjectId: state.selectedProjectId ?? event.thread.projectId
      };
    case 'thread.selected':
      return { ...state, selectedThreadId: event.threadId, focusedCardId: state.cards.find((c) => c.threadId === event.threadId)?.id };
    case 'thread.status':
      return { ...state, threads: updateThreadStatus(state.threads, event.threadId, event.status) };
    case 'turn.started':
      return { ...state, threads: updateThreadStatus(state.threads, event.threadId, 'running') };
    case 'turn.completed':
      return { ...state, threads: updateThreadStatus(state.threads, event.threadId, event.status && event.status !== 'completed' ? event.status : 'idle') };
    case 'card.upserted': {
      const cards = upsertCard(state.cards, event.card).sort((a, b) => a.createdAt - b.createdAt);
      return { ...state, cards, focusedCardId: event.card.id };
    }
    case 'card.delta': {
      const existing = state.cards.some((card) => card.id === event.cardId);
      const patch = existing
        ? state.cards.map((card) => {
            if (card.id !== event.cardId) return card;
            const current = String((card as Record<string, unknown>)[event.field] ?? '');
            return { ...card, [event.field]: current + event.delta, updatedAt: Date.now() };
          })
        : [
            ...state.cards,
            {
              id: event.cardId,
              threadId: event.threadId,
              kind: event.field === 'text' ? 'agent' : 'command',
              title: event.field === 'text' ? 'Codex' : 'Command output',
              [event.field]: event.delta,
              status: 'inProgress',
              createdAt: Date.now(),
              updatedAt: Date.now()
            } as TimelineCard
          ];
      return { ...state, cards: patch.sort((a, b) => a.createdAt - b.createdAt), focusedCardId: event.cardId };
    }
    case 'approval.requested':
      return { ...state, approvals: upsertApproval(state.approvals, event.approval), focusedCardId: event.approval.itemId ?? state.focusedCardId };
    case 'approval.resolved':
      return { ...state, approvals: state.approvals.filter((a) => String(a.requestId) !== String(event.requestId)) };
    case 'error':
      return { ...state, errors: [event.message, ...state.errors].slice(0, 6) };
    default:
      return state;
  }
}

function upsertApproval(items: ApprovalRequest[], item: ApprovalRequest): ApprovalRequest[] {
  const index = items.findIndex((x) => String(x.requestId) === String(item.requestId));
  if (index === -1) return [...items, item];
  const next = [...items];
  next[index] = item;
  return next;
}
