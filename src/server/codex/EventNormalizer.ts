import type { ApprovalRequest, ThreadSummary, TimelineCard, UiEvent } from '../../shared/types.js';

function now(): number {
  return Date.now();
}

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function getStatus(value: unknown, fallback = 'unknown'): string {
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  return getString(record.type) || getString(record.status) || fallback;
}

function toMillis(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  // App-server examples use epoch seconds. Accept already-millisecond values too.
  return value < 10_000_000_000 ? value * 1000 : value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function inferThreadId(params: Record<string, unknown>, item?: Record<string, unknown>): string {
  return getString(params.threadId) || getString(item?.threadId) || 'unknown_thread';
}

function inferTurnId(params: Record<string, unknown>, item?: Record<string, unknown>): string | undefined {
  return getString(params.turnId) || getString(item?.turnId) || undefined;
}

function renderContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        const p = asRecord(part);
        return getString(p.text) || getString(p.output_text) || getString(p.content) || JSON.stringify(part);
      })
      .join('');
  }
  if (content === undefined || content === null) return '';
  return JSON.stringify(content, null, 2);
}

function renderCommand(command: unknown): string {
  if (typeof command === 'string') return command;
  if (Array.isArray(command)) return command.map(String).join(' ');
  if (command && typeof command === 'object') {
    const r = asRecord(command);
    if (Array.isArray(r.argv)) return r.argv.map(String).join(' ');
    return JSON.stringify(command);
  }
  return '';
}

function filePathFromChange(item: Record<string, unknown>): string | undefined {
  const path = getString(item.path) || getString(item.filePath) || getString(item.relativePath);
  if (path) return path;
  const changes = item.changes;
  if (Array.isArray(changes) && changes.length > 0) {
    const first = asRecord(changes[0]);
    return getString(first.path) || getString(first.filePath) || getString(first.relativePath) || undefined;
  }
  return undefined;
}

function diffFromChange(item: Record<string, unknown>): string | undefined {
  if (typeof item.diff === 'string') return item.diff;
  if (typeof item.patch === 'string') return item.patch;
  const changes = item.changes;
  if (Array.isArray(changes)) {
    return changes
      .map((change) => {
        const c = asRecord(change);
        return getString(c.diff) || getString(c.patch) || JSON.stringify(change, null, 2);
      })
      .join('\n\n');
  }
  return undefined;
}

export function normalizeNotification(method: string, paramsUnknown: unknown): UiEvent[] {
  const params = asRecord(paramsUnknown);
  const out: UiEvent[] = [];

  switch (method) {
    case 'thread/started': {
      const thread = asRecord(params.thread);
      const id = getString(thread.id) || getString(params.threadId);
      if (id) {
        out.push({
          type: 'thread.upserted',
          thread: {
            id,
            projectId: 'default',
            name: (thread.name as string | null | undefined) ?? null,
            preview: (thread.preview as string | null | undefined) ?? null,
            status: 'loaded',
            createdAt: toMillis(thread.createdAt) ?? now(),
            raw: thread
          }
        });
        out.push({ type: 'thread.selected', threadId: id });
      }
      break;
    }
    case 'thread/name/updated': {
      const id = getString(params.threadId);
      if (id) {
        out.push({ type: 'thread.upserted', thread: { id, projectId: 'default', name: getString(params.name), updatedAt: now(), raw: params } });
      }
      break;
    }
    case 'thread/status/changed': {
      const threadId = getString(params.threadId);
      if (threadId) out.push({ type: 'thread.status', threadId, status: getStatus(params.status), payload: params });
      break;
    }
    case 'turn/started': {
      const threadId = getString(params.threadId) || getString(asRecord(params.turn).threadId);
      const turnId = getString(params.turnId) || getString(asRecord(params.turn).id);
      if (threadId && turnId) out.push({ type: 'turn.started', threadId, turnId, payload: params });
      break;
    }
    case 'turn/completed':
    case 'turn/failed':
    case 'turn/interrupted': {
      const threadId = getString(params.threadId) || getString(asRecord(params.turn).threadId);
      const turnId = getString(params.turnId) || getString(asRecord(params.turn).id);
      const turn = asRecord(params.turn);
      const status = getString(params.status) || getString(turn.status) || method.split('/')[1];
      if (threadId) out.push({ type: 'turn.completed', threadId, turnId, status, payload: params });
      break;
    }
    case 'turn/plan/updated': {
      const threadId = getString(params.threadId);
      const turnId = getString(params.turnId);
      const text = renderContent(params.plan ?? params.items ?? params);
      out.push({
        type: 'card.upserted',
        card: {
          id: `${turnId || threadId || 'unknown'}_plan`,
          threadId: threadId || 'unknown_thread',
          turnId,
          kind: 'plan',
          title: 'Plan',
          text,
          status: 'updated',
          payload: params,
          createdAt: now(),
          updatedAt: now()
        }
      });
      break;
    }
    case 'turn/diff/updated': {
      const threadId = getString(params.threadId);
      const turnId = getString(params.turnId);
      out.push({
        type: 'card.upserted',
        card: {
          id: `${turnId || threadId || 'unknown'}_diff_summary`,
          threadId: threadId || 'unknown_thread',
          turnId,
          kind: 'fileChange',
          title: 'Diff updated',
          diff: renderContent(params.diff ?? params),
          status: 'updated',
          payload: params,
          createdAt: now(),
          updatedAt: now()
        }
      });
      break;
    }
    case 'item/started':
    case 'item/completed': {
      const item = asRecord(params.item);
      const itemType = getString(item.type, 'unknown');
      const card = cardFromItem(item, params, method.endsWith('/completed') ? 'completed' : getString(item.status, 'inProgress'));
      if (card) out.push({ type: 'card.upserted', card });
      if (itemType === 'userMessage' && !card) {
        const content = renderContent(item.content);
        if (content) {
          const id = getString(item.id) || getString(params.itemId) || `userMessage_${Date.now()}`;
          out.push({ type: 'card.upserted', card: { id, threadId: inferThreadId(params, item), turnId: inferTurnId(params, item), kind: 'user', title: 'You', text: content, status: 'completed', payload: item, createdAt: now(), updatedAt: now() } });
        }
      }
      break;
    }
    case 'item/agentMessage/delta': {
      const item = asRecord(params.item);
      const threadId = getString(params.threadId) || getString(item.threadId) || 'unknown_thread';
      const itemId = getString(params.itemId) || getString(params.id) || getString(item.id) || `${threadId}_agent`;
      const delta = getString(params.delta) || getString(params.text) || renderContent(params.content ?? item.content);
      out.push({ type: 'card.delta', threadId, cardId: itemId, field: 'text', delta });
      break;
    }
    case 'command/exec/outputDelta':
    case 'item/commandExecution/outputDelta': {
      const threadId = getString(params.threadId) || 'unknown_thread';
      const itemId = getString(params.itemId) || getString(params.commandId) || getString(params.execId) || `${threadId}_command`;
      const stream = getString(params.stream) === 'stderr' ? 'stderr' : 'stdout';
      let delta = getString(params.delta) || getString(params.text) || getString(params.chunk);
      const encoded = getString(params.deltaBase64) || getString(params.bytes) || getString(params.data);
      if (!delta && encoded) {
        try { delta = Buffer.from(encoded, 'base64').toString('utf8'); } catch { delta = encoded; }
      }
      out.push({ type: 'card.delta', threadId, cardId: itemId, field: stream, delta });
      break;
    }
    case 'serverRequest/resolved': {
      const requestId = (params.requestId as string | number | undefined) ?? getString(params.id);
      if (requestId !== undefined) out.push({ type: 'approval.resolved', requestId, payload: params });
      break;
    }
    case 'error': {
      out.push({ type: 'error', message: getString(asRecord(params.error).message, 'Codex app-server error'), payload: params });
      break;
    }
    default:
      out.push({ type: 'raw', method, params });
  }

  return out;
}

function cardFromItem(item: Record<string, unknown>, params: Record<string, unknown>, status: string): TimelineCard | undefined {
  const itemType = getString(item.type, 'unknown');
  const id = getString(item.id) || getString(params.itemId) || `${itemType}_${Date.now()}`;
  const threadId = inferThreadId(params, item);
  const turnId = inferTurnId(params, item);

  if (itemType === 'agentMessage') {
    return {
      id,
      threadId,
      turnId,
      kind: 'agent',
      title: 'Codex',
      text: renderContent(item.content ?? item.text),
      status,
      payload: item,
      createdAt: now(),
      updatedAt: now()
    };
  }

  if (itemType === 'reasoning') {
    return {
      id,
      threadId,
      turnId,
      kind: 'reasoning',
      title: 'Reasoning',
      text: renderContent(item.summary ?? item.content ?? item.text),
      status,
      payload: item,
      createdAt: now(),
      updatedAt: now()
    };
  }

  if (itemType === 'commandExecution') {
    return {
      id,
      threadId,
      turnId,
      kind: 'command',
      title: 'Command',
      command: renderCommand(item.command),
      cwd: getString(item.cwd),
      stdout: getString(item.stdout),
      stderr: getString(item.stderr),
      exitCode: typeof item.exitCode === 'number' ? item.exitCode : null,
      status,
      payload: item,
      createdAt: now(),
      updatedAt: now()
    };
  }

  if (itemType === 'fileChange') {
    const filePath = filePathFromChange(item);
    return {
      id,
      threadId,
      turnId,
      kind: 'fileChange',
      title: filePath ? `Changed ${filePath}` : 'File change',
      filePath,
      diff: diffFromChange(item),
      status,
      payload: item,
      createdAt: now(),
      updatedAt: now()
    };
  }

  if (itemType === 'mcpToolCall' || itemType === 'dynamicToolCall' || itemType === 'webSearch' || itemType === 'imageView') {
    return {
      id,
      threadId,
      turnId,
      kind: 'tool',
      title: itemType,
      text: renderContent(item.content ?? item.result ?? item.arguments ?? item.query ?? item),
      status,
      payload: item,
      createdAt: now(),
      updatedAt: now()
    };
  }

  if (itemType === 'userMessage') {
    return {
      id,
      threadId,
      turnId,
      kind: 'user',
      title: 'You',
      text: renderContent(item.content ?? item.text),
      status,
      payload: item,
      createdAt: now(),
      updatedAt: now()
    };
  }

  if (itemType === 'enteredReviewMode' || itemType === 'exitedReviewMode' || itemType === 'contextCompaction') {
    return {
      id,
      threadId,
      turnId,
      kind: 'system',
      title: itemType,
      text: renderContent(item.review ?? item.content ?? item),
      status,
      payload: item,
      createdAt: now(),
      updatedAt: now()
    };
  }

  return {
    id,
    threadId,
    turnId,
    kind: 'unknown',
    title: itemType,
    text: renderContent(item),
    status,
    payload: item,
    createdAt: now(),
    updatedAt: now()
  };
}

export function approvalFromServerRequest(id: string | number, method: string, paramsUnknown: unknown): ApprovalRequest {
  const params = asRecord(paramsUnknown);
  const kind = method.includes('commandExecution') ? 'command' : method.includes('fileChange') ? 'fileChange' : method.includes('tool') ? 'tool' : 'unknown';
  const available = Array.isArray(params.availableDecisions)
    ? (params.availableDecisions.filter((d) => typeof d === 'string') as ApprovalRequest['availableDecisions'])
    : undefined;
  const command = renderCommand(params.command);
  const title =
    kind === 'command'
      ? 'Command approval required'
      : kind === 'fileChange'
        ? 'File change approval required'
        : kind === 'tool'
          ? 'Tool approval required'
          : 'Approval required';

  return {
    requestId: id,
    method,
    threadId: getString(params.threadId) || undefined,
    turnId: getString(params.turnId) || undefined,
    itemId: getString(params.itemId) || undefined,
    kind,
    title,
    reason: getString(params.reason) || undefined,
    command: command || undefined,
    cwd: getString(params.cwd) || undefined,
    grantRoot: getString(params.grantRoot) || undefined,
    availableDecisions: available,
    payload: params,
    createdAt: now()
  };
}

export function threadFromCodex(projectId: string, raw: unknown): ThreadSummary | undefined {
  const thread = asRecord(raw);
  const id = getString(thread.id);
  if (!id) return undefined;
  return {
    id,
    projectId,
    name: (thread.name as string | null | undefined) ?? null,
    preview: (thread.preview as string | null | undefined) ?? null,
    status: thread.status === undefined ? undefined : getStatus(thread.status, ''),
    createdAt: toMillis(thread.createdAt),
    updatedAt: toMillis(thread.updatedAt),
    raw: thread
  };
}
