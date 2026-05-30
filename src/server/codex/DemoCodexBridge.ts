import { EventEmitter } from 'node:events';
import type { ApprovalDecision, ApprovalRequest, StartTurnRequest, ThreadSummary, UiEvent } from '../../shared/types.js';
import type { CodexBridge } from './Bridge.js';
import { renderTurnText } from './turnContext.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DemoCodexBridge extends EventEmitter implements CodexBridge {
  readonly status = 'demo' as const;
  private threads = new Map<string, ThreadSummary>();
  private turnCounter = 0;
  private threadCounter = 0;
  private approvals = new Map<string | number, { resolve: (decision: ApprovalDecision | unknown) => void }>();

  async start(): Promise<void> {}
  stop(): void {}

  async listThreads(projectId: string): Promise<ThreadSummary[]> {
    return [...this.threads.values()].filter((t) => t.projectId === projectId);
  }

  async startThread(projectId: string): Promise<ThreadSummary> {
    const id = `thr_demo_${++this.threadCounter}`;
    const thread: ThreadSummary = {
      id,
      projectId,
      name: `Demo thread ${this.threadCounter}`,
      preview: 'Codex-Platform demo session',
      status: 'loaded',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      raw: { demo: true }
    };
    this.threads.set(id, thread);
    this.emitUi({ type: 'thread.upserted', thread });
    this.emitUi({ type: 'thread.selected', threadId: id });
    return thread;
  }

  async resumeThread(_projectId: string, threadId: string): Promise<ThreadSummary> {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Unknown demo thread: ${threadId}`);
    this.emitUi({ type: 'thread.selected', threadId });
    return thread;
  }

  async readThread(_projectId: string, threadId: string): Promise<ThreadSummary | undefined> {
    return this.threads.get(threadId);
  }

  async startTurn(threadId: string, request: StartTurnRequest): Promise<unknown> {
    const turnId = `turn_demo_${++this.turnCounter}`;
    void this.playDemoTurn(threadId, turnId, renderTurnText(request));
    return { turn: { id: turnId, status: 'inProgress', items: [] } };
  }

  async steerTurn(threadId: string, turnId: string, text: string): Promise<unknown> {
    this.emitUi({
      type: 'card.upserted',
      card: {
        id: `steer_${Date.now()}`,
        threadId,
        turnId,
        kind: 'user',
        title: 'Steer',
        text,
        createdAt: Date.now()
      }
    });
    return { turnId };
  }

  async interruptTurn(threadId: string, turnId?: string): Promise<unknown> {
    this.emitUi({ type: 'turn.completed', threadId, turnId, status: 'interrupted' });
    return {};
  }

  async startReview(threadId: string): Promise<unknown> {
    this.emitUi({
      type: 'card.upserted',
      card: {
        id: `review_${Date.now()}`,
        threadId,
        kind: 'system',
        title: 'Review mode',
        text: 'Demo review mode started. Inspect the Git and Diff panes, then ask Codex to address specific comments.',
        status: 'entered',
        createdAt: Date.now()
      }
    });
    return { ok: true };
  }

  async respondToApproval(requestId: string | number, decision: ApprovalDecision | unknown): Promise<void> {
    const pending = this.approvals.get(requestId);
    if (!pending) return;
    pending.resolve(decision);
    this.approvals.delete(requestId);
    this.emitUi({ type: 'approval.resolved', requestId, payload: { decision } });
  }

  async listSkills(cwd: string): Promise<unknown> {
    return {
      data: [
        {
          cwd,
          skills: [
            {
              name: 'skill-creator',
              description: 'Create or improve Codex skills.',
              path: `${cwd}/.agents/skills/skill-creator/SKILL.md`,
              enabled: true
            },
            {
              name: 'repo-triage',
              description: 'Triage repository health, tests, and high-risk changes.',
              path: `${cwd}/.agents/skills/repo-triage/SKILL.md`,
              enabled: true
            }
          ]
        }
      ]
    };
  }

  async readAccount(): Promise<unknown> {
    return { mode: 'demo', authenticated: false };
  }

  private async playDemoTurn(threadId: string, turnId: string, text: string): Promise<void> {
    this.emitUi({ type: 'thread.status', threadId, status: 'active', payload: { demo: true } });
    this.emitUi({ type: 'turn.started', threadId, turnId, payload: { demo: true } });
    this.emitUi({
      type: 'card.upserted',
      card: {
        id: `${turnId}_user`,
        threadId,
        turnId,
        kind: 'user',
        title: 'You',
        text,
        createdAt: Date.now()
      }
    });

    await delay(250);
    const agentId = `${turnId}_agent_1`;
    this.emitUi({
      type: 'card.upserted',
      card: {
        id: agentId,
        threadId,
        turnId,
        kind: 'agent',
        title: 'Codex',
        status: 'inProgress',
        text: '',
        createdAt: Date.now()
      }
    });
    for (const chunk of ['我会先检查项目结构，', '再运行测试，', '最后给出一个最小修改方案。']) {
      await delay(180);
      this.emitUi({ type: 'card.delta', threadId, cardId: agentId, field: 'text', delta: chunk });
    }

    await delay(300);
    this.emitUi({
      type: 'card.upserted',
      card: {
        id: `${turnId}_plan`,
        threadId,
        turnId,
        kind: 'plan',
        title: 'Plan',
        text: '1. Inspect package scripts\n2. Run focused tests\n3. Patch the failing component\n4. Re-run verification',
        status: 'updated',
        createdAt: Date.now()
      }
    });

    const commandId = `${turnId}_cmd_1`;
    await delay(300);
    this.emitUi({
      type: 'card.upserted',
      card: {
        id: commandId,
        threadId,
        turnId,
        kind: 'command',
        title: 'Command',
        command: 'npm test -- --runInBand',
        cwd: '/workspace/project',
        status: 'waiting_approval',
        stdout: '',
        stderr: '',
        createdAt: Date.now()
      }
    });

    const requestId = `approval_${turnId}`;
    const approval: ApprovalRequest = {
      requestId,
      method: 'item/commandExecution/requestApproval',
      threadId,
      turnId,
      itemId: commandId,
      kind: 'command',
      title: 'Command approval required',
      reason: 'Run project tests before changing code.',
      command: 'npm test -- --runInBand',
      cwd: '/workspace/project',
      availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
      payload: { demo: true },
      createdAt: Date.now()
    };
    this.emitUi({ type: 'approval.requested', approval });
    const decision = await new Promise<ApprovalDecision | unknown>((resolve) => this.approvals.set(requestId, { resolve }));

    if (decision === 'decline' || decision === 'cancel') {
      this.emitUi({
        type: 'card.upserted',
        card: {
          id: commandId,
          threadId,
          turnId,
          kind: 'command',
          title: 'Command',
          command: 'npm test -- --runInBand',
          cwd: '/workspace/project',
          status: 'declined',
          stdout: '',
          stderr: 'Command was not approved.',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      });
      this.emitUi({ type: 'turn.completed', threadId, turnId, status: 'declined' });
      this.emitUi({ type: 'thread.status', threadId, status: 'idle' });
      return;
    }

    this.emitUi({
      type: 'card.upserted',
      card: {
        id: commandId,
        threadId,
        turnId,
        kind: 'command',
        title: 'Command',
        command: 'npm test -- --runInBand',
        cwd: '/workspace/project',
        status: 'running',
        stdout: '',
        stderr: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    });
    for (const chunk of ['> project@0.1.0 test\n', 'FAIL src/auth/session.test.ts\n', 'Expected token refresh to preserve expiry.\n']) {
      await delay(200);
      this.emitUi({ type: 'card.delta', threadId, cardId: commandId, field: 'stdout', delta: chunk });
    }
    await delay(250);
    this.emitUi({
      type: 'card.upserted',
      card: {
        id: commandId,
        threadId,
        turnId,
        kind: 'command',
        title: 'Command',
        command: 'npm test -- --runInBand',
        cwd: '/workspace/project',
        status: 'failed',
        stdout: '> project@0.1.0 test\nFAIL src/auth/session.test.ts\nExpected token refresh to preserve expiry.\n',
        stderr: '',
        exitCode: 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    });

    await delay(300);
    this.emitUi({
      type: 'card.upserted',
      card: {
        id: `${turnId}_file_1`,
        threadId,
        turnId,
        kind: 'fileChange',
        title: 'Changed src/auth/session.ts',
        filePath: 'src/auth/session.ts',
        diff: `diff --git a/src/auth/session.ts b/src/auth/session.ts\n@@\n-  expiresAt: Date.now() + ttl,\n+  expiresAt: previous.expiresAt ?? Date.now() + ttl,\n`,
        status: 'completed',
        createdAt: Date.now()
      }
    });

    await delay(250);
    this.emitUi({
      type: 'card.upserted',
      card: {
        id: `${turnId}_summary`,
        threadId,
        turnId,
        kind: 'agent',
        title: 'Codex',
        text: '已定位失败点并给出最小补丁。下一步建议运行 focused test，再决定是否提交。',
        status: 'completed',
        createdAt: Date.now()
      }
    });
    this.emitUi({ type: 'turn.completed', threadId, turnId, status: 'completed' });
    this.emitUi({ type: 'thread.status', threadId, status: 'idle' });
  }

  private emitUi(event: UiEvent): void {
    this.emit('uiEvent', event);
  }
}
