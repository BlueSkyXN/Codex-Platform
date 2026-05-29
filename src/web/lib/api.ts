import type {
  AgentSummary,
  ApprovalDecision,
  AppStateSnapshot,
  CreateThreadRequest,
  FileReadResult,
  FileTreeNode,
  GitStatusSummary,
  Project,
  ServerHealth,
  SkillSummary,
  StartTurnRequest,
  ThreadSummary,
  CodexWebConfig
} from '../../shared/types.js';
import { normalizeSkills } from './normalize.js';

const TOKEN_KEY = 'codex-platform-token';

export function getStoredToken(): string {
  return window.localStorage.getItem(TOKEN_KEY) ?? '';
}

export function setStoredToken(token: string): void {
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function eventStreamUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Use the same-origin session cookie set by /api/login. Avoid putting the
  // Codex-Platform token into the WebSocket URL, where proxies and access logs can capture it.
  return `${protocol}//${window.location.host}/events`;
}

async function request<T>(url: string, init?: RequestInit & { skipAuth?: boolean }): Promise<T> {
  const token = init?.skipAuth ? '' : getStoredToken();
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-codex-platform-token': token } : {}),
      ...(init?.headers ?? {})
    },
    ...init
  });
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(text || response.statusText) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return (await response.json()) as T;
}

export const api = {
  config: () => request<CodexWebConfig>('/api/config', { skipAuth: true }),
  login: async (token: string) => {
    await request<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ token }), skipAuth: true });
    setStoredToken(token);
  },
  logout: async () => {
    try {
      await request<{ ok: true }>('/api/logout', { method: 'POST', body: JSON.stringify({}), skipAuth: true });
    } finally {
      setStoredToken('');
    }
  },
  health: () => request<ServerHealth>('/api/health', { skipAuth: true }),
  state: () => request<AppStateSnapshot>('/api/state'),
  projects: () => request<{ data: Project[] }>('/api/projects'),
  addProject: (body: { name?: string; cwd: string }) => request<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
  deleteProject: (projectId: string) => request<{ ok: boolean }>(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' }),
  threads: (projectId: string) => request<{ data: ThreadSummary[] }>(`/api/threads?projectId=${encodeURIComponent(projectId)}`),
  createThread: (body: CreateThreadRequest) => request<{ thread: ThreadSummary }>('/api/threads', { method: 'POST', body: JSON.stringify(body) }),
  resumeThread: (threadId: string, projectId: string) => request<{ thread: ThreadSummary }>(`/api/threads/${threadId}/resume`, { method: 'POST', body: JSON.stringify({ projectId }) }),
  startTurn: (threadId: string, body: StartTurnRequest) => request<{ result: unknown }>(`/api/threads/${threadId}/turns`, { method: 'POST', body: JSON.stringify(body) }),
  interruptTurn: (threadId: string, turnId?: string) => request<{ result: unknown }>(`/api/threads/${threadId}/interrupt`, { method: 'POST', body: JSON.stringify({ turnId }) }),
  startReview: (threadId: string, baseBranch?: string) => request<{ result: unknown }>(`/api/threads/${threadId}/review`, { method: 'POST', body: JSON.stringify({ baseBranch }) }),
  approval: (requestId: string | number, decision: ApprovalDecision) => request<{ ok: true }>(`/api/approvals/${encodeURIComponent(String(requestId))}`, { method: 'POST', body: JSON.stringify({ decision }) }),
  skills: async (projectId: string, forceReload = false): Promise<SkillSummary[]> => normalizeSkills(await request<unknown>(`/api/skills?projectId=${encodeURIComponent(projectId)}&forceReload=${forceReload ? 'true' : 'false'}`)),
  agents: (projectId: string) => request<{ data: AgentSummary[] }>(`/api/agents?projectId=${encodeURIComponent(projectId)}`),
  account: () => request<unknown>('/api/account'),
  fileTree: (projectId: string, path = '', depth = 3) => request<{ tree: FileTreeNode }>(`/api/projects/${encodeURIComponent(projectId)}/files/tree?path=${encodeURIComponent(path)}&depth=${depth}`),
  fileRead: (projectId: string, path: string) => request<FileReadResult>(`/api/projects/${encodeURIComponent(projectId)}/files/read?path=${encodeURIComponent(path)}`),
  gitStatus: (projectId: string) => request<GitStatusSummary>(`/api/projects/${encodeURIComponent(projectId)}/git/status`)
};
