import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import type { ApprovalDecision, StartTurnRequest, ThreadSummary, UiEvent } from '../../shared/types.js';
import { JsonRpcLineClient, type JsonRpcMessage } from './JsonRpcLineClient.js';
import type { CodexBridge } from './Bridge.js';
import { approvalFromServerRequest, normalizeNotification, threadFromCodex } from './EventNormalizer.js';
import { renderTurnText } from './turnContext.js';

function resultThread(result: unknown): unknown {
  if (result && typeof result === 'object' && 'thread' in result) return (result as { thread: unknown }).thread;
  return result;
}


function sandboxPolicyFrom(value: unknown, cwd?: string): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  const type = String(value);
  if (!type) return undefined;
  const policy: Record<string, unknown> = { type };
  if (type === 'workspaceWrite' && cwd) policy.writableRoots = [cwd];
  return policy;
}

function reviewTargetFrom(baseBranch?: string): Record<string, unknown> {
  const branch = baseBranch?.trim();
  return branch ? { type: 'baseBranch', branch } : { type: 'uncommittedChanges' };
}

function asArrayData(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && Array.isArray((result as { data?: unknown[] }).data)) return (result as { data: unknown[] }).data;
  if (result && typeof result === 'object' && Array.isArray((result as { threads?: unknown[] }).threads)) return (result as { threads: unknown[] }).threads;
  return [];
}

export class RealCodexBridge extends EventEmitter implements CodexBridge {
  private rpc: JsonRpcLineClient;
  private initialized = false;
  private failedError?: string;

  constructor() {
    super();
    this.rpc = new JsonRpcLineClient(config.codex.bin, config.codex.args, config.workspaceRoot, config.limits.rpcDefaultTimeoutMs);
    this.rpc.on('notification', (message: JsonRpcMessage) => this.onNotification(message));
    this.rpc.on('serverRequest', (message: JsonRpcMessage) => this.onServerRequest(message));
    this.rpc.on('stderr', (text: string) => this.emitUi({ type: 'raw', method: 'appServer/stderr', params: { text } }));
    this.rpc.on('protocolError', (payload) => this.emitUi({ type: 'error', message: 'Failed to parse app-server JSONL output', payload }));
    this.rpc.on('error', (error) => this.emitUi({ type: 'error', message: error instanceof Error ? error.message : String(error), payload: error }));
    this.rpc.on('exit', (payload) => { this.initialized = false; this.failedError = 'codex app-server exited'; this.emitUi({ type: 'error', message: 'codex app-server exited', payload }); });
  }

  get status(): 'starting' | 'ready' | 'error' | 'stopped' {
    if (this.initialized) return 'ready';
    if (this.failedError) return 'error';
    return this.rpc.running ? 'starting' : 'stopped';
  }

  async start(): Promise<void> {
    if (this.initialized) return;
    this.rpc.start();
    this.failedError = undefined;
    await this.rpc.request('initialize', {
      clientInfo: {
        name: config.codex.clientName,
        title: config.codex.clientTitle,
        version: config.codex.clientVersion
      },
      capabilities: {
        experimentalApi: true
      }
    });
    this.rpc.notify('initialized', {});
    this.initialized = true;
    this.failedError = undefined;
  }

  stop(): void {
    this.rpc.stop();
    this.initialized = false;
    this.failedError = undefined;
  }

  async listThreads(projectId: string, cwd: string): Promise<ThreadSummary[]> {
    await this.start();
    const result = await this.rpc.request('thread/list', { cwd, limit: 50 });
    return asArrayData(result).map((raw) => threadFromCodex(projectId, raw)).filter(Boolean) as ThreadSummary[];
  }

  async startThread(projectId: string, cwd: string, opts: Record<string, unknown> = {}): Promise<ThreadSummary> {
    await this.start();
    const params = {
      cwd,
      approvalPolicy: opts.approvalPolicy ?? config.codex.approvalPolicy,
      sandbox: opts.sandbox ?? config.codex.sandbox,
      serviceName: config.codex.clientName,
      ...(config.codex.defaultModel ? { model: opts.model ?? config.codex.defaultModel } : {}),
      ...(opts.personality ? { personality: opts.personality } : {})
    };
    const result = await this.rpc.request('thread/start', params);
    const thread = threadFromCodex(projectId, resultThread(result));
    if (!thread) throw new Error('thread/start did not return a thread id');
    return thread;
  }

  async resumeThread(projectId: string, threadId: string, opts: Record<string, unknown> = {}): Promise<ThreadSummary> {
    await this.start();
    const result = await this.rpc.request('thread/resume', { threadId, ...opts });
    const thread = threadFromCodex(projectId, resultThread(result));
    if (!thread) throw new Error('thread/resume did not return a thread id');
    return thread;
  }

  async readThread(projectId: string, threadId: string, includeTurns = true): Promise<ThreadSummary | undefined> {
    await this.start();
    const result = await this.rpc.request('thread/read', { threadId, includeTurns });
    return threadFromCodex(projectId, resultThread(result));
  }

  async startTurn(threadId: string, request: StartTurnRequest): Promise<unknown> {
    await this.start();
    const text = renderTurnText(request);
    const input: unknown[] = [{ type: 'text', text }];
    if (request.skill) input.push({ type: 'skill', name: request.skill.name, path: request.skill.path });
    const params: Record<string, unknown> = {
      threadId,
      input,
      ...(request.cwd ? { cwd: request.cwd } : {}),
      ...(request.model || config.codex.defaultModel ? { model: request.model ?? config.codex.defaultModel } : {}),
      approvalPolicy: request.approvalPolicy ?? config.codex.approvalPolicy,
      sandboxPolicy: sandboxPolicyFrom(request.sandbox ?? config.codex.sandbox, request.cwd),
      effort: request.effort ?? config.codex.effort,
      summary: request.summary ?? config.codex.summary
    };
    return await this.rpc.request('turn/start', params);
  }

  async steerTurn(threadId: string, turnId: string, text: string): Promise<unknown> {
    await this.start();
    return await this.rpc.request('turn/steer', {
      threadId,
      expectedTurnId: turnId,
      input: [{ type: 'text', text }]
    });
  }

  async interruptTurn(threadId: string, turnId?: string): Promise<unknown> {
    await this.start();
    return await this.rpc.request('turn/interrupt', { threadId, ...(turnId ? { turnId } : {}) });
  }

  async startReview(threadId: string, baseBranch?: string): Promise<unknown> {
    await this.start();
    return await this.rpc.request('review/start', {
      threadId,
      delivery: 'inline',
      target: reviewTargetFrom(baseBranch)
    });
  }

  async respondToApproval(requestId: string | number, decision: ApprovalDecision | unknown): Promise<void> {
    const result = config.codex.approvalResultShape === 'object' ? { decision } : decision;
    this.rpc.respond(requestId, result);
  }

  async listSkills(cwd: string, forceReload = false): Promise<unknown> {
    await this.start();
    return await this.rpc.request('skills/list', { cwds: [cwd], forceReload });
  }

  async readAccount(): Promise<unknown> {
    await this.start();
    return await this.rpc.request('account/read', {});
  }

  private onNotification(message: JsonRpcMessage): void {
    if (!message.method) return;
    for (const event of normalizeNotification(message.method, message.params)) {
      this.emitUi(event);
    }
  }

  private onServerRequest(message: JsonRpcMessage): void {
    if (message.id === undefined || !message.method) return;
    const approval = approvalFromServerRequest(message.id, message.method, message.params);
    this.emitUi({ type: 'approval.requested', approval });
  }

  private emitUi(event: UiEvent): void {
    this.emit('uiEvent', event);
  }
}
