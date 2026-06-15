import express from 'express';
import type { ProjectRegistry } from '../projectRegistry.js';
import type { PersistentStore } from '../../store/PersistentStore.js';
import type { CodexBridge } from '../../codex/Bridge.js';
import type {
  ApprovalDecision,
  CreateThreadRequest,
  GitActionResult,
  GitOperationKind,
  GitOperationRecord,
  Project,
  StartTurnRequest
} from '../../../shared/types.js';
import { ErrorCodes, sendErr, sendOk } from '../envelope.js';
import type { ApiKeyStore } from './keys.js';
import { getRequestKey, keyAllowsProject, makeApiKeyAuth, makePublicApiGate, requireScope } from './auth.js';
import { streamThreadEvents } from './sse.js';
import { buildOpenApiDocument } from './openapi.js';
import { readProjectFile, readProjectTree } from '../../workspace/files.js';
import { commitGitChanges, readGitDiff, readGitStatus, stageGitPaths, unstageGitPaths } from '../../workspace/git.js';
import { readGitHubActionsSummary } from '../githubActions.js';
import { readGitHubPullRequestSummary } from '../githubPullRequests.js';
import { listCustomAgents } from '../agentRegistry.js';

export type V1Limits = {
  maxFileTreeEntries: number;
  maxFileReadBytes: number;
  gitCommandTimeoutMs: number;
  githubTimeoutMs: number;
};

export type GitOperationDetail = {
  paths?: string[];
  message?: string;
  result?: GitActionResult;
  error?: string;
};

export type V1Context = {
  enabled: boolean;
  keyStore: ApiKeyStore;
  registry: ProjectRegistry;
  store: PersistentStore;
  bridge: CodexBridge;
  limits: V1Limits;
  githubToken?: string;
  publicUrl?: string;
  allowedOrigins: string[];
  makeGitOperation: (
    projectId: string,
    kind: GitOperationKind,
    status: GitOperationRecord['status'],
    detail: GitOperationDetail
  ) => GitOperationRecord;
};

function asyncRoute(fn: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// 24h idempotency cache keyed by (key id, method, path, Idempotency-Key header).
class IdempotencyCache {
  private readonly store = new Map<string, { ts: number; data: unknown }>();
  private readonly ttlMs = 24 * 60 * 60 * 1000;

  get(key: string): unknown | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.ts > this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    return hit.data;
  }

  set(key: string, data: unknown): void {
    this.store.set(key, { ts: Date.now(), data });
    if (this.store.size > 2000) {
      const cutoff = Date.now() - this.ttlMs;
      for (const [k, v] of this.store) if (v.ts < cutoff) this.store.delete(k);
    }
  }
}

export function createV1Router(ctx: V1Context): express.Router {
  const router = express.Router();
  const idempotency = new IdempotencyCache();

  // —— gate: invisible (404) when the public API is disabled (before anything else) ——
  router.use(makePublicApiGate({ enabled: ctx.enabled, store: ctx.keyStore }));

  // —— CORS (per configured origin allowlist; default deny) ——
  router.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && (ctx.allowedOrigins.includes('*') || ctx.allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', ctx.allowedOrigins.includes('*') ? '*' : origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, idempotency-key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // —— spec is reachable without a key (still gated by the enable flag) ——
  router.get('/openapi.json', (_req, res) => {
    res.json(buildOpenApiDocument(ctx.publicUrl));
  });

  // —— everything below requires a valid API key ——
  router.use(makeApiKeyAuth({ enabled: ctx.enabled, store: ctx.keyStore }));

  router.get('/whoami', (_req, res) => {
    const key = getRequestKey(res)!;
    sendOk(res, {
      id: key.id,
      name: key.name,
      scopes: [...key.scopes],
      projectIds: key.projectIds ? [...key.projectIds] : null,
      lastUsedAt: key.lastUsedAt,
      useCount: key.useCount
    });
  });

  // Resolve a project from :id and enforce the key's project allowlist.
  function resolveProject(req: express.Request, res: express.Response): Project | undefined {
    const project = ctx.registry.get(String(req.params.id));
    if (!project) {
      sendErr(res, 404, ErrorCodes.projectNotFound, `Unknown project: ${req.params.id}`);
      return undefined;
    }
    if (!keyAllowsProject(res, project.id)) {
      sendErr(res, 403, ErrorCodes.forbidden, 'This key is not allowed to access this project.');
      return undefined;
    }
    return project;
  }

  function idempotencyKey(req: express.Request, res: express.Response): string | undefined {
    const header = req.get('idempotency-key');
    if (!header) return undefined;
    const key = getRequestKey(res)!;
    return `${key.id}:${req.method}:${req.originalUrl.split('?')[0]}:${header}`;
  }

  // ——————————————————————— Projects ———————————————————————
  router.get('/projects', requireScope('projects:read'), (_req, res) => {
    const key = getRequestKey(res)!;
    const projects = ctx.registry.all().filter((p) => !key.projectIds || key.projectIds.has(p.id));
    sendOk(res, projects, { cursor: null, limit: projects.length, total: projects.length });
  });

  router.post('/projects', requireScope('projects:write'), asyncRoute(async (req, res) => {
    let project: Project;
    try {
      project = ctx.registry.add({ name: req.body?.name, cwd: req.body?.cwd });
    } catch (error) {
      return sendErr(res, 400, ErrorCodes.validationFailed, errorMessage(error));
    }
    ctx.store.dispatch({ type: 'project.upserted', project });
    sendOk(res, project);
  }));

  router.get('/projects/:id', requireScope('projects:read'), (req, res) => {
    const project = resolveProject(req, res);
    if (project) sendOk(res, project);
  });

  router.delete('/projects/:id', requireScope('projects:write'), (req, res) => {
    const project = resolveProject(req, res);
    if (!project) return;
    const removed = ctx.registry.remove(project.id);
    sendOk(res, { removed });
  });

  router.get('/projects/:id/files', requireScope('projects:read'), asyncRoute(async (req, res) => {
    const project = resolveProject(req, res);
    if (!project) return;
    const depth = Math.max(1, Math.min(Number(req.query.depth ?? 3) || 3, 6));
    try {
      const tree = await readProjectTree(project.cwd, String(req.query.path ?? ''), {
        maxDepth: depth,
        maxEntries: ctx.limits.maxFileTreeEntries
      });
      sendOk(res, tree);
    } catch (error) {
      sendErr(res, 400, ErrorCodes.pathOutsideWorkspace, errorMessage(error));
    }
  }));

  router.get('/projects/:id/files/content', requireScope('projects:read'), asyncRoute(async (req, res) => {
    const project = resolveProject(req, res);
    if (!project) return;
    try {
      const file = await readProjectFile(project.cwd, String(req.query.path ?? ''), ctx.limits.maxFileReadBytes);
      sendOk(res, file);
    } catch (error) {
      sendErr(res, 400, ErrorCodes.pathOutsideWorkspace, errorMessage(error));
    }
  }));

  // ——————————————————————— Git ———————————————————————
  router.get('/projects/:id/git', requireScope('git:read'), asyncRoute(async (req, res) => {
    const project = resolveProject(req, res);
    if (!project) return;
    sendOk(res, await readGitStatus(project.cwd, ctx.limits.gitCommandTimeoutMs));
  }));

  router.get('/projects/:id/git/diff', requireScope('git:read'), asyncRoute(async (req, res) => {
    const project = resolveProject(req, res);
    if (!project) return;
    const filePath = typeof req.query.path === 'string' && req.query.path ? req.query.path : undefined;
    const cached = String(req.query.cached ?? '').toLowerCase() === 'true';
    try {
      sendOk(res, await readGitDiff(project.cwd, { filePath, cached }, ctx.limits.gitCommandTimeoutMs));
    } catch (error) {
      sendErr(res, 400, ErrorCodes.validationFailed, errorMessage(error));
    }
  }));

  function gitPaths(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.map((entry) => String(entry)).filter(Boolean).slice(0, 50);
  }

  router.post('/projects/:id/git/stage', requireScope('git:write'), asyncRoute(async (req, res) => {
    const project = resolveProject(req, res);
    if (!project) return;
    const paths = gitPaths(req.body?.paths);
    try {
      const result = await stageGitPaths(project.cwd, req.body?.paths, ctx.limits.gitCommandTimeoutMs);
      ctx.store.dispatch({ type: 'git.operation.recorded', operation: ctx.makeGitOperation(project.id, 'stage', 'completed', { paths, result }) });
      sendOk(res, result);
    } catch (error) {
      const message = errorMessage(error);
      ctx.store.dispatch({ type: 'git.operation.recorded', operation: ctx.makeGitOperation(project.id, 'stage', 'failed', { paths, error: message }) });
      sendErr(res, 400, ErrorCodes.validationFailed, message);
    }
  }));

  router.post('/projects/:id/git/unstage', requireScope('git:write'), asyncRoute(async (req, res) => {
    const project = resolveProject(req, res);
    if (!project) return;
    const paths = gitPaths(req.body?.paths);
    try {
      const result = await unstageGitPaths(project.cwd, req.body?.paths, ctx.limits.gitCommandTimeoutMs);
      ctx.store.dispatch({ type: 'git.operation.recorded', operation: ctx.makeGitOperation(project.id, 'unstage', 'completed', { paths, result }) });
      sendOk(res, result);
    } catch (error) {
      const message = errorMessage(error);
      ctx.store.dispatch({ type: 'git.operation.recorded', operation: ctx.makeGitOperation(project.id, 'unstage', 'failed', { paths, error: message }) });
      sendErr(res, 400, ErrorCodes.validationFailed, message);
    }
  }));

  router.post('/projects/:id/git/commit', requireScope('git:write'), asyncRoute(async (req, res) => {
    const project = resolveProject(req, res);
    if (!project) return;
    const idemKey = idempotencyKey(req, res);
    if (idemKey) {
      const cached = idempotency.get(idemKey);
      if (cached !== undefined) return sendOk(res, cached);
    }
    const messageText = String(req.body?.message ?? '');
    const paths = gitPaths(req.body?.paths);
    try {
      const result = await commitGitChanges(project.cwd, messageText, ctx.limits.gitCommandTimeoutMs);
      ctx.store.dispatch({ type: 'git.operation.recorded', operation: ctx.makeGitOperation(project.id, 'commit', 'completed', { paths, message: messageText, result }) });
      if (idemKey) idempotency.set(idemKey, result);
      sendOk(res, result);
    } catch (error) {
      const message = errorMessage(error);
      ctx.store.dispatch({ type: 'git.operation.recorded', operation: ctx.makeGitOperation(project.id, 'commit', 'failed', { paths, message: messageText, error: message }) });
      sendErr(res, 400, ErrorCodes.validationFailed, message);
    }
  }));

  // ——————————————————————— Review (GitHub) ———————————————————————
  router.get('/projects/:id/github/actions', requireScope('review:read'), asyncRoute(async (req, res) => {
    const project = resolveProject(req, res);
    if (!project) return;
    const status = await readGitStatus(project.cwd, ctx.limits.gitCommandTimeoutMs);
    sendOk(res, await readGitHubActionsSummary(status, ctx.limits.githubTimeoutMs, ctx.githubToken));
  }));

  router.get('/projects/:id/github/pulls', requireScope('review:read'), asyncRoute(async (req, res) => {
    const project = resolveProject(req, res);
    if (!project) return;
    const status = await readGitStatus(project.cwd, ctx.limits.gitCommandTimeoutMs);
    sendOk(res, await readGitHubPullRequestSummary(status, ctx.limits.githubTimeoutMs, ctx.githubToken));
  }));

  // ——————————————————————— Threads / Turns ———————————————————————
  router.get('/threads', requireScope('threads:read'), asyncRoute(async (req, res) => {
    const projectId = String(req.query.projectId ?? ctx.registry.all()[0]?.id ?? '');
    const project = ctx.registry.get(projectId);
    if (!project) return sendErr(res, 404, ErrorCodes.projectNotFound, `Unknown project: ${projectId}`);
    if (!keyAllowsProject(res, project.id)) return sendErr(res, 403, ErrorCodes.forbidden, 'This key is not allowed to access this project.');
    const threads = await ctx.bridge.listThreads(project.id, project.cwd);
    for (const thread of threads) ctx.store.dispatch({ type: 'thread.upserted', thread });
    sendOk(res, threads, { cursor: null, limit: threads.length, total: threads.length });
  }));

  router.post('/threads', requireScope('threads:write'), asyncRoute(async (req, res) => {
    const body = req.body as CreateThreadRequest;
    const project = ctx.registry.get(body?.projectId);
    if (!project) return sendErr(res, 404, ErrorCodes.projectNotFound, `Unknown project: ${body?.projectId}`);
    if (!keyAllowsProject(res, project.id)) return sendErr(res, 403, ErrorCodes.forbidden, 'This key is not allowed to access this project.');
    const idemKey = idempotencyKey(req, res);
    if (idemKey) {
      const cached = idempotency.get(idemKey);
      if (cached !== undefined) return sendOk(res, cached);
    }
    const thread = await ctx.bridge.startThread(project.id, project.cwd, body);
    ctx.store.dispatch({ type: 'thread.upserted', thread });
    ctx.store.dispatch({ type: 'thread.selected', threadId: thread.id });
    if (idemKey) idempotency.set(idemKey, thread);
    sendOk(res, thread);
  }));

  router.get('/threads/:id', requireScope('threads:read'), asyncRoute(async (req, res) => {
    const projectId = String(req.query.projectId ?? ctx.registry.all()[0]?.id ?? '');
    const project = ctx.registry.get(projectId);
    if (!project) return sendErr(res, 404, ErrorCodes.projectNotFound, `Unknown project: ${projectId}`);
    const thread = await ctx.bridge.readThread(project.id, String(req.params.id), true);
    if (!thread) return sendErr(res, 404, ErrorCodes.notFound, `Unknown thread: ${req.params.id}`);
    sendOk(res, thread);
  }));

  router.post('/threads/:id/turns', requireScope('threads:write'), asyncRoute(async (req, res) => {
    const body = req.body as StartTurnRequest;
    if (!body?.text?.trim()) return sendErr(res, 422, ErrorCodes.validationFailed, 'text is required');
    const wantsStream = body.stream === true || (req.get('accept') ?? '').includes('text/event-stream');
    const threadId = String(req.params.id);
    if (wantsStream) {
      streamThreadEvents(ctx.store, threadId, req, res);
      try {
        await ctx.bridge.startTurn(threadId, body);
      } catch (error) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: errorMessage(error) })}\n\n`);
      }
      return;
    }
    const idemKey = idempotencyKey(req, res);
    if (idemKey) {
      const cached = idempotency.get(idemKey);
      if (cached !== undefined) return sendOk(res, cached);
    }
    const result = await ctx.bridge.startTurn(threadId, body);
    const data = { threadId, status: 'running', result };
    if (idemKey) idempotency.set(idemKey, data);
    sendOk(res, data);
  }));

  router.post('/threads/:id/interrupt', requireScope('threads:write'), asyncRoute(async (req, res) => {
    const result = await ctx.bridge.interruptTurn(String(req.params.id), req.body?.turnId);
    sendOk(res, { result });
  }));

  router.post('/threads/:id/review', requireScope('review:read'), asyncRoute(async (req, res) => {
    if (!ctx.bridge.startReview) return sendErr(res, 501, ErrorCodes.bridgeUnavailable, 'review/start is not supported by this bridge');
    const result = await ctx.bridge.startReview(String(req.params.id), req.body?.baseBranch ? String(req.body.baseBranch) : undefined);
    sendOk(res, { result });
  }));

  router.get('/threads/:id/events', requireScope('threads:read'), (req, res) => {
    streamThreadEvents(ctx.store, String(req.params.id), req, res);
  });

  // ——————————————————————— Approvals ———————————————————————
  router.get('/approvals', requireScope('threads:read'), (req, res) => {
    const snapshot = ctx.store.snapshot();
    const threadId = typeof req.query.threadId === 'string' ? req.query.threadId : undefined;
    const wantStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
    const pending = snapshot.approvals.filter((a) => !threadId || a.threadId === threadId);
    const history = (snapshot.approvalHistory ?? []).filter((a) => !threadId || a.threadId === threadId);
    const data = wantStatus === 'resolved' ? history : wantStatus === 'pending' ? pending : { pending, history };
    sendOk(res, data);
  });

  router.post('/approvals/:requestId', requireScope('approvals:write'), asyncRoute(async (req, res) => {
    const decision = (req.body?.decision ?? 'decline') as ApprovalDecision;
    if (!['accept', 'acceptForSession', 'decline', 'cancel'].includes(decision)) {
      return sendErr(res, 422, ErrorCodes.validationFailed, `Unsupported decision: ${decision}`);
    }
    await ctx.bridge.respondToApproval(String(req.params.requestId), decision);
    ctx.store.dispatch({ type: 'approval.resolved', requestId: String(req.params.requestId), payload: { decision } });
    sendOk(res, { resolved: true, decision });
  }));

  // ——————————————————————— Capabilities ———————————————————————
  router.get('/skills', requireScope('capabilities:read'), asyncRoute(async (req, res) => {
    const projectId = String(req.query.projectId ?? ctx.registry.all()[0]?.id ?? '');
    const project = ctx.registry.get(projectId);
    if (!project) return sendErr(res, 404, ErrorCodes.projectNotFound, `Unknown project: ${projectId}`);
    sendOk(res, await ctx.bridge.listSkills(project.cwd, req.query.forceReload === 'true'));
  }));

  router.get('/agents', requireScope('capabilities:read'), (req, res) => {
    const projectId = String(req.query.projectId ?? ctx.registry.all()[0]?.id ?? '');
    const project = ctx.registry.get(projectId);
    if (!project) return sendErr(res, 404, ErrorCodes.projectNotFound, `Unknown project: ${projectId}`);
    sendOk(res, listCustomAgents(project.cwd));
  });

  // —— unmatched /v1 path: explicit 404 envelope so it never falls through to the SPA ——
  router.use((_req, res) => {
    sendErr(res, 404, ErrorCodes.notFound, 'Not found');
  });

  // —— error handler: format thrown errors as the standard envelope ——
  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    sendErr(res, 500, ErrorCodes.internal, errorMessage(error));
  });

  return router;
}
