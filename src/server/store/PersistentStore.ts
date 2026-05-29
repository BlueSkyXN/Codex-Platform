import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { ApprovalRequest, AppStateSnapshot, Project, ThreadSummary, TimelineCard, UiEvent } from '../../shared/types.js';

type StoreOptions = {
  demoMode: boolean;
  snapshotFile: string;
  eventLogFile: string;
  maxCards: number;
  maxErrors: number;
  maxEventLogBytes: number;
};

function ensureDir(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function safeReadJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function atomicWriteJson(file: string, value: unknown): void {
  ensureDir(file);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redact(item, depth + 1));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && value.length > 20_000) return `${value.slice(0, 20_000)}\n[truncated]`;
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (/token|secret|password|authorization|api[-_]?key|cookie/i.test(key)) out[key] = '[redacted]';
    else out[key] = redact(entry, depth + 1);
  }
  return out;
}

export class PersistentStore extends EventEmitter {
  private projects = new Map<string, Project>();
  private threads = new Map<string, ThreadSummary>();
  private cards = new Map<string, TimelineCard>();
  private approvals = new Map<string | number, ApprovalRequest>();
  private selectedThreadId?: string;
  private readonly demoMode: boolean;
  private readonly snapshotFile: string;
  private readonly eventLogFile: string;
  private readonly maxCards: number;
  private readonly maxErrors: number;
  private readonly maxEventLogBytes: number;
  private errors: string[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(options: StoreOptions) {
    super();
    this.demoMode = options.demoMode;
    this.snapshotFile = options.snapshotFile;
    this.eventLogFile = options.eventLogFile;
    this.maxCards = options.maxCards;
    this.maxErrors = options.maxErrors;
    this.maxEventLogBytes = options.maxEventLogBytes;
    this.restore();
    this.rotateEventLogIfNeeded();
  }

  snapshot(): AppStateSnapshot {
    return {
      projects: [...this.projects.values()].sort((a, b) => a.createdAt - b.createdAt),
      threads: [...this.threads.values()].sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0)),
      cards: [...this.cards.values()].sort((a, b) => a.createdAt - b.createdAt),
      approvals: [...this.approvals.values()].sort((a, b) => a.createdAt - b.createdAt),
      selectedThreadId: this.selectedThreadId,
      demoMode: this.demoMode,
      errors: this.errors
    };
  }

  dispatch(event: UiEvent): void {
    this.apply(event);
    this.appendEvent(event);
    this.scheduleFlush();
    this.emit('event', event);
  }

  flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    atomicWriteJson(this.snapshotFile, this.snapshot());
  }

  private restore(): void {
    const snapshot = safeReadJson<AppStateSnapshot & { errors?: string[] }>(this.snapshotFile);
    if (!snapshot) return;
    for (const project of snapshot.projects ?? []) this.projects.set(project.id, project);
    for (const thread of snapshot.threads ?? []) this.threads.set(thread.id, thread);
    for (const card of snapshot.cards ?? []) this.cards.set(card.id, card);
    for (const approval of snapshot.approvals ?? []) this.approvals.set(approval.requestId, approval);
    this.selectedThreadId = snapshot.selectedThreadId;
    this.errors = Array.isArray(snapshot.errors) ? snapshot.errors.slice(0, this.maxErrors) : [];
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), 250);
  }

  private appendEvent(event: UiEvent): void {
    try {
      ensureDir(this.eventLogFile);
      fs.appendFileSync(this.eventLogFile, `${JSON.stringify({ ts: Date.now(), event: redact(event) })}\n`, 'utf8');
    } catch {
      // Snapshot persistence is authoritative for runtime recovery. Event-log write errors are intentionally non-fatal.
    }
  }

  private rotateEventLogIfNeeded(): void {
    try {
      const stat = fs.statSync(this.eventLogFile);
      if (stat.size <= this.maxEventLogBytes) return;
      const rotated = `${this.eventLogFile}.${new Date().toISOString().replace(/[:.]/g, '-')}`;
      fs.renameSync(this.eventLogFile, rotated);
    } catch {
      // Missing event log is normal on first boot.
    }
  }

  private apply(event: UiEvent): void {
    switch (event.type) {
      case 'project.upserted':
        this.projects.set(event.project.id, event.project);
        break;
      case 'thread.upserted': {
        const existing = this.threads.get(event.thread.id);
        this.threads.set(event.thread.id, existing ? { ...existing, ...event.thread, projectId: event.thread.projectId === 'default' ? existing.projectId : event.thread.projectId } : event.thread);
        break;
      }
      case 'thread.selected':
        this.selectedThreadId = event.threadId;
        break;
      case 'thread.status': {
        const existing = this.threads.get(event.threadId);
        if (existing) this.threads.set(event.threadId, { ...existing, status: event.status, updatedAt: Date.now() });
        break;
      }
      case 'turn.started': {
        const existing = this.threads.get(event.threadId);
        if (existing) this.threads.set(event.threadId, { ...existing, status: 'running', updatedAt: Date.now() });
        break;
      }
      case 'turn.completed': {
        const existing = this.threads.get(event.threadId);
        if (existing) this.threads.set(event.threadId, { ...existing, status: event.status && event.status !== 'completed' ? event.status : 'idle', updatedAt: Date.now() });
        break;
      }
      case 'card.upserted':
        this.cards.set(event.card.id, mergeCard(this.cards.get(event.card.id), event.card));
        this.pruneCards();
        break;
      case 'card.delta': {
        const existing = this.cards.get(event.cardId);
        if (existing) {
          const current = String((existing as Record<string, unknown>)[event.field] ?? '');
          this.cards.set(event.cardId, { ...existing, [event.field]: current + event.delta, updatedAt: Date.now() });
        } else {
          this.cards.set(event.cardId, {
            id: event.cardId,
            threadId: event.threadId,
            kind: event.field === 'text' ? 'agent' : 'command',
            title: event.field === 'text' ? 'Codex' : 'Command output',
            [event.field]: event.delta,
            status: 'inProgress',
            createdAt: Date.now(),
            updatedAt: Date.now()
          } as TimelineCard);
          this.pruneCards();
        }
        break;
      }
      case 'approval.requested':
        this.approvals.set(event.approval.requestId, event.approval);
        break;
      case 'approval.resolved':
        this.approvals.delete(event.requestId);
        break;
      case 'error':
        this.errors = [event.message, ...this.errors].slice(0, this.maxErrors);
        break;
    }
  }

  private pruneCards(): void {
    if (this.cards.size <= this.maxCards) return;
    const sorted = [...this.cards.values()].sort((a, b) => a.createdAt - b.createdAt);
    for (const card of sorted.slice(0, this.cards.size - this.maxCards)) this.cards.delete(card.id);
  }
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
    createdAt: existing.createdAt ?? incoming.createdAt,
    updatedAt: incoming.updatedAt ?? Date.now()
  };
}
