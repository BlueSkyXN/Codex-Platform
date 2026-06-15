import type express from 'express';
import type { UiEvent } from '../../../shared/types.js';
import type { PersistentStore } from '../../store/PersistentStore.js';

// Server-Sent Events stream for the public API. Preferred over WebSocket for
// external consumers (proxy/firewall friendly, one-directional, easy in CI).
// See local/refactor-2026/03-API-对外与内部.md §2.5.

function eventThreadId(event: UiEvent): string | undefined {
  switch (event.type) {
    case 'card.upserted':
      return event.card.threadId;
    case 'card.delta':
      return event.threadId;
    case 'approval.requested':
      return event.approval.threadId;
    case 'turn.started':
    case 'turn.completed':
    case 'thread.status':
    case 'thread.selected':
      return event.threadId;
    case 'thread.upserted':
      return event.thread.id;
    default:
      return undefined;
  }
}

// Whether an event is relevant to a given thread subscription. Thread-scoped
// events must match; approval resolutions and errors are always forwarded so the
// consumer can observe lifecycle completion.
function relevantToThread(event: UiEvent, threadId: string): boolean {
  const eventThread = eventThreadId(event);
  if (eventThread) return eventThread === threadId;
  return event.type === 'approval.resolved' || event.type === 'error';
}

export function streamThreadEvents(
  store: PersistentStore,
  threadId: string,
  req: express.Request,
  res: express.Response
): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (nginx)
  res.flushHeaders?.();

  let seq = 0;
  res.write(`event: connected\nid: ${seq++}\ndata: ${JSON.stringify({ threadId })}\n\n`);

  const onEvent = (event: UiEvent) => {
    if (!relevantToThread(event, threadId)) return;
    res.write(`event: ${event.type}\nid: ${seq++}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  store.on('event', onEvent);

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 15_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    store.off('event', onEvent);
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
}
