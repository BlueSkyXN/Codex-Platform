import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { assertSafeRuntimeConfig, config } from './config.js';
import { ProjectRegistry } from './api/projectRegistry.js';
import { listCustomAgents } from './api/agentRegistry.js';
import { PersistentStore } from './store/PersistentStore.js';
import { createRateLimiter } from './security/rateLimit.js';
import { isAuthorizedToken, loginRoute, logoutRoute, requireAuth, tokenFromUpgrade } from './security/auth.js';
import type { ApprovalDecision, CreateThreadRequest, ServerHealth, StartTurnRequest, UiEvent, CodexWebConfig } from '../shared/types.js';
import type { CodexBridge } from './codex/Bridge.js';
import { DemoCodexBridge } from './codex/DemoCodexBridge.js';
import { RealCodexBridge } from './codex/RealCodexBridge.js';
import { readProjectFile, readProjectTree } from './workspace/files.js';
import { readGitStatus } from './workspace/git.js';

assertSafeRuntimeConfig();
if (config.huggingFace.autoCreateWorkspace || config.demoMode) {
  fs.mkdirSync(config.workspaceRoot, { recursive: true });
  for (const root of config.allowedWorkspaceRoots) fs.mkdirSync(root, { recursive: true });
}
fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.codex.home, { recursive: true });

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: config.limits.bodyLimit }));
app.use(createRateLimiter(config.limits.rateLimitWindowMs, config.limits.rateLimitMax));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const startedAt = Date.now();
const registry = new ProjectRegistry(config.workspaceRoot, config.allowedWorkspaceRoots, config.persistence.projectsFile);
const store = new PersistentStore({
  demoMode: config.demoMode,
  snapshotFile: config.persistence.snapshotFile,
  eventLogFile: config.persistence.eventLogFile,
  maxCards: config.limits.maxCards,
  maxErrors: config.limits.maxErrors,
  maxEventLogBytes: config.limits.maxEventLogBytes
});
const bridge: (CodexBridge & NodeJS.EventEmitter) = config.demoMode ? new DemoCodexBridge() : new RealCodexBridge();

function bridgeStatus(): ServerHealth['appServer'] {
  if (config.demoMode) return 'demo';
  return bridge.status ?? 'stopped';
}

function broadcast(event: UiEvent): void {
  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

bridge.on('uiEvent', (event: UiEvent) => store.dispatch(event));
store.on('event', (event: UiEvent) => broadcast(event));

for (const project of registry.all()) store.dispatch({ type: 'project.upserted', project });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname !== '/events') {
    socket.destroy();
    return;
  }
  if (wss.clients.size >= config.limits.maxWsClients) {
    socket.write('HTTP/1.1 503 Too many websocket clients\r\n\r\n');
    socket.destroy();
    return;
  }
  if (!isAuthorizedToken(tokenFromUpgrade(req, url))) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (socket: WebSocket) => {
  socket.send(JSON.stringify({ type: 'connected', serverTime: Date.now(), demoMode: config.demoMode } satisfies UiEvent));
  socket.send(JSON.stringify({ type: 'raw', method: 'snapshot', params: store.snapshot() } satisfies UiEvent));
  const heartbeat = setInterval(() => {
    if (socket.readyState === socket.OPEN) socket.ping();
  }, 30_000);
  socket.on('close', () => clearInterval(heartbeat));
});

function asyncRoute(fn: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function health(): ServerHealth {
  const appServer = bridgeStatus();
  return {
    ok: appServer !== 'error',
    ready: config.demoMode || appServer === 'ready',
    demoMode: config.demoMode,
    authRequired: config.auth.required,
    workspaceRoot: config.workspaceRoot,
    allowedWorkspaceRoots: config.allowedWorkspaceRoots,
    dataDir: config.dataDir,
    appServer,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    huggingFace: config.huggingFace,
    codexHome: config.codex.home
  };
}

app.get('/api/health', (_req, res) => res.json(health()));
app.get('/healthz', (_req, res) => res.status(health().ok ? 200 : 503).json(health()));
app.get('/_ops/health', (_req, res) => res.status(health().ok ? 200 : 503).json(health()));
app.get('/api/config', (_req, res) => {
  const payload: CodexWebConfig = {
    authRequired: config.auth.required,
    demoMode: config.demoMode,
    defaultApprovalPolicy: config.codex.approvalPolicy,
    defaultSandbox: config.codex.sandbox,
    defaultModel: config.codex.defaultModel,
    defaultEffort: config.codex.effort,
    defaultSummary: config.codex.summary
  };
  res.json(payload);
});
app.post('/api/login', loginRoute);
app.post('/api/logout', logoutRoute);

app.use('/api', requireAuth);

app.get('/api/state', (_req, res) => res.json(store.snapshot()));
app.get('/api/projects', (_req, res) => res.json({ data: registry.all() }));

app.post('/api/projects', asyncRoute(async (req, res) => {
  let project;
  try {
    project = registry.add({ name: req.body?.name, cwd: req.body?.cwd });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: message });
  }
  store.dispatch({ type: 'project.upserted', project });
  res.json({ project });
}));

app.delete('/api/projects/:projectId', asyncRoute(async (req, res) => {
  const removed = registry.remove(String(req.params.projectId));
  res.json({ ok: removed });
}));

app.get('/api/threads', asyncRoute(async (req, res) => {
  const projectId = String(req.query.projectId ?? registry.all()[0]?.id ?? '');
  const project = registry.get(projectId);
  if (!project) return res.status(404).json({ error: `Unknown project: ${projectId}` });
  const threads = await bridge.listThreads(project.id, project.cwd);
  for (const thread of threads) store.dispatch({ type: 'thread.upserted', thread });
  res.json({ data: threads });
}));

app.post('/api/threads', asyncRoute(async (req, res) => {
  const body = req.body as CreateThreadRequest;
  const project = registry.get(body.projectId);
  if (!project) return res.status(404).json({ error: `Unknown project: ${body.projectId}` });
  const thread = await bridge.startThread(project.id, project.cwd, body);
  store.dispatch({ type: 'thread.upserted', thread });
  store.dispatch({ type: 'thread.selected', threadId: thread.id });
  res.json({ thread });
}));

app.post('/api/threads/:threadId/resume', asyncRoute(async (req, res) => {
  const projectId = String(req.body?.projectId ?? registry.all()[0]?.id ?? '');
  const project = registry.get(projectId);
  if (!project) return res.status(404).json({ error: `Unknown project: ${projectId}` });
  const thread = await bridge.resumeThread(project.id, String(req.params.threadId), req.body ?? {});
  store.dispatch({ type: 'thread.upserted', thread });
  store.dispatch({ type: 'thread.selected', threadId: thread.id });
  res.json({ thread });
}));

app.get('/api/threads/:threadId', asyncRoute(async (req, res) => {
  const projectId = String(req.query.projectId ?? registry.all()[0]?.id ?? '');
  const project = registry.get(projectId);
  if (!project) return res.status(404).json({ error: `Unknown project: ${projectId}` });
  const thread = await bridge.readThread(project.id, String(req.params.threadId), true);
  res.json({ thread });
}));

app.post('/api/threads/:threadId/turns', asyncRoute(async (req, res) => {
  const body = req.body as StartTurnRequest;
  if (!body.text?.trim()) return res.status(400).json({ error: 'text is required' });
  const result = await bridge.startTurn(String(req.params.threadId), body);
  res.json({ result });
}));

app.post('/api/threads/:threadId/steer', asyncRoute(async (req, res) => {
  const turnId = String(req.body?.turnId ?? '');
  const text = String(req.body?.text ?? '');
  if (!turnId || !text) return res.status(400).json({ error: 'turnId and text are required' });
  const result = await bridge.steerTurn(String(req.params.threadId), turnId, text);
  res.json({ result });
}));

app.post('/api/threads/:threadId/interrupt', asyncRoute(async (req, res) => {
  const result = await bridge.interruptTurn(String(req.params.threadId), req.body?.turnId);
  res.json({ result });
}));

app.post('/api/approvals/:requestId', asyncRoute(async (req, res) => {
  const decision = (req.body?.decision ?? 'decline') as ApprovalDecision;
  if (!['accept', 'acceptForSession', 'decline', 'cancel'].includes(decision)) {
    return res.status(400).json({ error: `Unsupported decision: ${decision}` });
  }
  await bridge.respondToApproval(String(req.params.requestId), decision);
  store.dispatch({ type: 'approval.resolved', requestId: String(req.params.requestId), payload: { decision } });
  res.json({ ok: true });
}));

app.get('/api/skills', asyncRoute(async (req, res) => {
  const projectId = String(req.query.projectId ?? registry.all()[0]?.id ?? '');
  const project = registry.get(projectId);
  if (!project) return res.status(404).json({ error: `Unknown project: ${projectId}` });
  const result = await bridge.listSkills(project.cwd, req.query.forceReload === 'true');
  res.json(result);
}));

app.get('/api/account', asyncRoute(async (_req, res) => {
  const result = await bridge.readAccount();
  res.json(result);
}));

app.post('/api/threads/:threadId/review', asyncRoute(async (req, res) => {
  if (!bridge.startReview) return res.status(501).json({ error: 'review/start is not supported by this bridge' });
  const result = await bridge.startReview(String(req.params.threadId), req.body?.baseBranch ? String(req.body.baseBranch) : undefined);
  res.json({ result });
}));

app.get('/api/projects/:projectId/files/tree', asyncRoute(async (req, res) => {
  const project = registry.get(String(req.params.projectId));
  if (!project) return res.status(404).json({ error: `Unknown project: ${req.params.projectId}` });
  const depth = Math.max(1, Math.min(Number(req.query.depth ?? 3) || 3, 6));
  const relativePath = String(req.query.path ?? '');
  try {
    const tree = await readProjectTree(project.cwd, relativePath, {
      maxDepth: depth,
      maxEntries: config.limits.maxFileTreeEntries
    });
    res.json({ tree });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
}));

app.get('/api/projects/:projectId/files/read', asyncRoute(async (req, res) => {
  const project = registry.get(String(req.params.projectId));
  if (!project) return res.status(404).json({ error: `Unknown project: ${req.params.projectId}` });
  const relativePath = String(req.query.path ?? '');
  try {
    const file = await readProjectFile(project.cwd, relativePath, config.limits.maxFileReadBytes);
    res.json(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
}));

app.get('/api/projects/:projectId/git/status', asyncRoute(async (req, res) => {
  const project = registry.get(String(req.params.projectId));
  if (!project) return res.status(404).json({ error: `Unknown project: ${req.params.projectId}` });
  const status = await readGitStatus(project.cwd, config.limits.gitCommandTimeoutMs);
  res.json(status);
}));


app.get('/api/agents', asyncRoute(async (req, res) => {
  const projectId = String(req.query.projectId ?? registry.all()[0]?.id ?? '');
  const project = registry.get(projectId);
  if (!project) return res.status(404).json({ error: `Unknown project: ${projectId}` });
  res.json({ data: listCustomAgents(project.cwd) });
}));

const distWebRoot = path.resolve(process.cwd(), 'dist/web');
if (fs.existsSync(distWebRoot)) {
  app.use(express.static(distWebRoot, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/|\/events).*/, (_req, res) => {
    res.sendFile(path.join(distWebRoot, 'index.html'));
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  store.dispatch({ type: 'error', message, payload: error instanceof Error ? { stack: error.stack } : error });
  res.status(500).json({ error: message });
});

server.listen(config.port, config.host, async () => {
  console.log(`Codex-Platform server listening on http://${config.host}:${config.port}`);
  console.log(`mode=${config.demoMode ? 'demo' : 'real app-server'} workspaceRoot=${config.workspaceRoot} dataDir=${config.dataDir}`);
  if (config.huggingFace.enabled) console.log(`huggingface=enabled spaceHost=${config.huggingFace.spaceHost ?? 'unknown'} publicUrl=${config.huggingFace.publicUrl ?? 'unknown'} storageRoot=${config.huggingFace.storageRoot}`);
  console.log(`auth=${config.auth.required ? 'required' : 'not-required'} allowedRoots=${config.allowedWorkspaceRoots.join(',')}`);
  if (!config.demoMode) {
    try {
      await bridge.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to start codex app-server: ${message}`);
      store.dispatch({ type: 'error', message: `Failed to start codex app-server: ${message}`, payload: error });
    }
  }
});

function shutdown(signal: string): void {
  console.log(`received ${signal}; shutting down`);
  store.flush();
  bridge.stop();
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
