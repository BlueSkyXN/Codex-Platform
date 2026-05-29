import type { ApprovalDecision, StartTurnRequest, ThreadSummary } from '../../shared/types.js';

export type BridgeEvents = {
  uiEvent: unknown;
};

export interface CodexBridge {
  readonly status?: 'demo' | 'starting' | 'ready' | 'error' | 'stopped';
  start(): Promise<void>;
  stop(): void;
  listThreads(projectId: string, cwd: string): Promise<ThreadSummary[]>;
  startThread(projectId: string, cwd: string, opts?: Record<string, unknown>): Promise<ThreadSummary>;
  resumeThread(projectId: string, threadId: string, opts?: Record<string, unknown>): Promise<ThreadSummary>;
  readThread(projectId: string, threadId: string, includeTurns?: boolean): Promise<ThreadSummary | undefined>;
  startTurn(threadId: string, request: StartTurnRequest): Promise<unknown>;
  steerTurn(threadId: string, turnId: string, text: string): Promise<unknown>;
  interruptTurn(threadId: string, turnId?: string): Promise<unknown>;
  startReview?(threadId: string, baseBranch?: string): Promise<unknown>;
  respondToApproval(requestId: string | number, decision: ApprovalDecision | unknown): Promise<void>;
  listSkills(cwd: string, forceReload?: boolean): Promise<unknown>;
  readAccount(): Promise<unknown>;
}
