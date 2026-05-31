import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type express from 'express';
import { config } from './config.js';
import type { CodexBridge } from './codex/Bridge.js';
import type { PersistentStore } from './store/PersistentStore.js';
import type { AppStateSnapshot, ServerHealth } from '../shared/types.js';

type ControlPlaneContext = {
  health: () => ServerHealth;
  store: PersistentStore;
  bridge: CodexBridge;
  startedAt: number;
  buildSha?: string;
};

type AuthContext = {
  kind: 'header' | 'query' | 'cookie';
  csrfToken?: string;
};

type AdminAction = {
  id: string;
  label: string;
  description: string;
  confirmLabel: string;
};

const adminActions: AdminAction[] = [
  {
    id: 'run-health-checks',
    label: 'Run health checks',
    description: 'Read current health, readiness, and runtime status without changing service state.',
    confirmLabel: 'Run checks'
  },
  {
    id: 'flush-store',
    label: 'Flush persistent snapshot',
    description: 'Force the in-memory snapshot to be written to CODEX_PLATFORM_DATA_DIR.',
    confirmLabel: 'Flush store'
  },
  {
    id: 'restart-codex',
    label: 'Restart Codex bridge',
    description: 'Stop and start the codex app-server bridge. Demo mode treats this as a no-op restart.',
    confirmLabel: 'Restart bridge'
  }
];

export function registerControlPlaneRoutes(app: express.Express, ctx: ControlPlaneContext): void {
  registerPublicReadiness(app, ctx);
  registerOpsRoutes(app, ctx);
  registerAdminRoutes(app, ctx);
}

function registerPublicReadiness(app: express.Express, ctx: ControlPlaneContext): void {
  app.get('/readyz', (_req, res) => {
    const payload = ctx.health();
    res.status(payload.ready ? 200 : 503).json(payload);
  });
}

function registerOpsRoutes(app: express.Express, ctx: ControlPlaneContext): void {
  app.get(/^\/_ops\/?$/, (req, res, next) => {
    if (req.path === '/_ops') {
      res.redirect(308, `/_ops/${querySuffix(req)}`);
      return;
    }
    next();
  });

  app.get('/_ops/', (req, res) => {
    const lockReason = opsLockReason();
    if (lockReason) {
      res.status(503).type('html').send(opsLoginHtml({ locked: true, message: lockReason }));
      return;
    }
    if (opsQueryAuth(req)) {
      setSignedCookie(res, config.ops.cookieName, config.ops.token ?? '', 'ops', config.ops.sessionTtlSeconds, '/_ops/', secureCookie(req, config.ops.cookieSecure));
      res.redirect(303, '/_ops/');
      return;
    }
    if (!opsAuth(req)) {
      res.status(200).type('html').send(opsLoginHtml({ locked: false }));
      return;
    }
    res.type('html').send(opsDashboardHtml());
  });

  app.post('/_ops/login', (req, res) => {
    const lockReason = opsLockReason();
    if (lockReason) {
      res.status(503).json({ ok: false, error: 'ops disabled', reason: lockReason });
      return;
    }
    const token = String(req.body?.token ?? '');
    if (!tokenMatches(token, config.ops.token)) {
      res.status(401).json({ ok: false, error: 'invalid token' });
      return;
    }
    setSignedCookie(res, config.ops.cookieName, config.ops.token ?? '', 'ops', config.ops.sessionTtlSeconds, '/_ops/', secureCookie(req, config.ops.cookieSecure));
    res.json({ ok: true });
  });

  app.post('/_ops/logout', (_req, res) => {
    clearCookie(res, config.ops.cookieName, '/_ops/');
    res.json({ ok: true });
  });

  app.get('/_ops/health', requireOpsAuth, (_req, res) => {
    const payload = opsHealthPayload(ctx);
    res.status(payload.ok ? 200 : 503).json(payload);
  });
  app.get('/_ops/readyz', requireOpsAuth, (_req, res) => {
    const payload = ctx.health();
    res.status(payload.ready ? 200 : 503).json({ ok: payload.ready, ready: payload.ready, health: payload });
  });
  app.get('/_ops/status', requireOpsAuth, (_req, res) => res.json(opsStatusPayload(ctx)));
  app.get('/_ops/system', requireOpsAuth, (_req, res) => res.json(systemPayload(ctx)));
  app.get('/_ops/config', requireOpsAuth, (_req, res) => res.json(configSummary()));
  app.get('/_ops/version', requireOpsAuth, (_req, res) => res.json(versionPayload(ctx)));
  app.get('/_ops/errors', requireOpsAuth, (_req, res) => res.json(errorsPayload(ctx.store.snapshot())));
  app.get('/_ops/metrics', requireOpsAuth, (req, res) => {
    res.type('text/plain').send(metricsPayload(ctx, req));
  });
}

function registerAdminRoutes(app: express.Express, ctx: ControlPlaneContext): void {
  app.use('/_admin', (req, res, next) => {
    if (!config.admin.enabled) {
      res.status(404).json({ error: 'admin disabled' });
      return;
    }
    next();
  });

  app.get(/^\/_admin\/?$/, (req, res, next) => {
    if (req.path === '/_admin') {
      res.redirect(308, `/_admin/${querySuffix(req)}`);
      return;
    }
    next();
  });

  app.get('/_admin/', (_req, res) => {
    if (!config.admin.token) {
      res.status(503).type('html').send(adminDisabledHtml('CODEX_PLATFORM_ADMIN_TOKEN must be set before enabling the admin control plane.'));
      return;
    }
    res.type('html').send(adminDashboardHtml());
  });

  app.post('/_admin/api/login', (req, res) => {
    if (!config.admin.token) {
      res.status(503).json({ ok: false, error: 'CODEX_PLATFORM_ADMIN_TOKEN must be set before enabling admin' });
      return;
    }
    const token = String(req.body?.token ?? '');
    if (!tokenMatches(token, config.admin.token)) {
      appendAudit('login', false, 'cookie', 'login', { reason: 'invalid-token', remoteAddr: remoteAddr(req) });
      res.status(401).json({ ok: false, error: 'invalid token' });
      return;
    }
    const session = makeSignedSession(config.admin.token, 'admin', config.admin.sessionTtlSeconds);
    const csrfToken = csrfForSession(session.expiresAt, session.nonce);
    setCookie(res, config.admin.cookieName, session.value, '/_admin/', config.admin.sessionTtlSeconds, secureCookie(req, config.admin.cookieSecure));
    appendAudit('login', true, 'cookie', 'login', { remoteAddr: remoteAddr(req) });
    res.json({ ok: true, csrfToken, expiresAt: session.expiresAt });
  });

  app.post('/_admin/api/logout', (req, res) => {
    clearCookie(res, config.admin.cookieName, '/_admin/');
    appendAudit('logout', true, authFromLocals(res)?.kind ?? 'cookie', 'logout', { remoteAddr: remoteAddr(req) });
    res.json({ ok: true });
  });

  app.get('/_admin/api/status', requireAdminAuth, (_req, res) => {
    res.json(adminStatusPayload(ctx, authFromLocals(res)));
  });
  app.get('/_admin/api/actions', requireAdminAuth, (_req, res) => res.json({ ok: true, actions: adminActions }));
  app.get('/_admin/api/audit', requireAdminAuth, (req, res) => {
    const limit = boundedNumber(Number(req.query.limit), 100, 1, 500);
    res.json(readAudit(limit));
  });
  app.post('/_admin/api/actions/:actionId', requireAdminAuth, requireAdminCsrf, asyncRoute(async (req, res) => {
    const actionId = String(req.params.actionId ?? '');
    if (!adminActions.some((action) => action.id === actionId)) {
      res.status(404).json({ ok: false, error: `unknown admin action: ${actionId}` });
      return;
    }
    if (req.body?.confirm !== true) {
      res.status(400).json({ ok: false, error: 'confirm=true is required' });
      return;
    }
    const auth = authFromLocals(res);
    const startedAt = Date.now();
    try {
      const result = await runAdminAction(actionId, ctx);
      appendAudit(actionId, true, auth?.kind ?? 'unknown', actionId, {
        durationMs: Date.now() - startedAt,
        remoteAddr: remoteAddr(req)
      });
      res.json({ ok: true, actionId, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendAudit(actionId, false, auth?.kind ?? 'unknown', actionId, {
        durationMs: Date.now() - startedAt,
        error: message,
        remoteAddr: remoteAddr(req)
      });
      res.status(500).json({ ok: false, error: message });
    }
  }));
}

function requireOpsAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const lockReason = opsLockReason();
  if (lockReason) {
    res.status(503).json({ ok: false, error: 'ops disabled', reason: lockReason });
    return;
  }
  if (opsAuth(req)) return next();
  res.status(401).json({ ok: false, error: 'unauthorized', hint: `send ${config.ops.headerName}, X-Ops-Token, Authorization: Bearer <token>, or sign in at /_ops/` });
}

function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const auth = adminAuth(req);
  if (!auth) {
    res.status(401).json({ ok: false, error: 'unauthorized', hint: `send ${config.admin.headerName}, X-Admin-Token, Authorization: Bearer <token>, or sign in at /_admin/` });
    return;
  }
  res.locals.adminAuth = auth;
  next();
}

function requireAdminCsrf(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const auth = authFromLocals(res);
  if (!auth) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  if (auth.kind === 'header') return next();
  const provided = req.get(config.admin.csrfHeaderName) ?? '';
  if (auth.csrfToken && tokenMatches(provided, auth.csrfToken)) return next();
  res.status(403).json({ ok: false, error: 'csrf token required' });
}

function asyncRoute(fn: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function runAdminAction(actionId: string, ctx: ControlPlaneContext): Promise<unknown> {
  if (actionId === 'run-health-checks') {
    return opsHealthPayload(ctx);
  }
  if (actionId === 'flush-store') {
    ctx.store.flush();
    return { flushed: true, snapshotFile: config.persistence.snapshotFile };
  }
  if (actionId === 'restart-codex') {
    ctx.bridge.stop();
    if (!config.demoMode) await ctx.bridge.start();
    return { restarted: true, appServer: ctx.health().appServer, demoMode: config.demoMode };
  }
  throw new Error(`unsupported admin action: ${actionId}`);
}

function opsLockReason(): string {
  if (!config.ops.token) return 'CODEX_PLATFORM_OPS_TOKEN is not set';
  return '';
}

function opsQueryAuth(req: express.Request): boolean {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  return tokenMatches(token, config.ops.token);
}

function opsAuth(req: express.Request): AuthContext | undefined {
  const headerToken = req.get(config.ops.headerName) ?? req.get('x-ops-token') ?? bearerToken(req);
  if (tokenMatches(headerToken, config.ops.token)) return { kind: 'header' };
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  if (tokenMatches(queryToken, config.ops.token)) return { kind: 'query' };
  const cookie = parseCookies(req.get('cookie'))[config.ops.cookieName];
  if (cookie && verifySignedSession(config.ops.token ?? '', 'ops', cookie)) return { kind: 'cookie' };
  return undefined;
}

function adminAuth(req: express.Request): AuthContext | undefined {
  if (!config.admin.token) return undefined;
  const headerToken = req.get(config.admin.headerName) ?? req.get('x-admin-token') ?? bearerToken(req);
  if (tokenMatches(headerToken, config.admin.token)) return { kind: 'header', csrfToken: '1' };
  const cookie = parseCookies(req.get('cookie'))[config.admin.cookieName];
  const session = cookie ? parseSignedSession(config.admin.token, 'admin', cookie) : undefined;
  if (!session) return undefined;
  return { kind: 'cookie', csrfToken: csrfForSession(session.expiresAt, session.nonce) };
}

function authFromLocals(res: express.Response): AuthContext | undefined {
  return res.locals.adminAuth as AuthContext | undefined;
}

function bearerToken(req: express.Request): string | undefined {
  const auth = req.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return undefined;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function makeSignedSession(secret: string, scope: string, ttlSeconds: number): { value: string; expiresAt: number; nonce: string } {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const nonce = crypto.randomBytes(24).toString('base64url');
  const signature = sign(secret, scope, String(expiresAt), nonce);
  return { value: `${expiresAt}.${nonce}.${signature}`, expiresAt, nonce };
}

function parseSignedSession(secret: string, scope: string, value: string): { expiresAt: number; nonce: string } | undefined {
  const [expiresRaw, nonce, signature] = value.split('.', 3);
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !nonce || !signature) return undefined;
  const expected = sign(secret, scope, expiresRaw, nonce);
  return tokenMatches(signature, expected) ? { expiresAt, nonce } : undefined;
}

function verifySignedSession(secret: string, scope: string, value: string): boolean {
  return Boolean(parseSignedSession(secret, scope, value));
}

function csrfForSession(expiresAt: number, nonce: string): string {
  const key = config.admin.csrfKey || config.admin.token || '';
  return sign(key, 'csrf', String(expiresAt), nonce);
}

function sign(secret: string, ...parts: string[]): string {
  return crypto.createHmac('sha256', secret).update(parts.join('\0')).digest('base64url');
}

function tokenMatches(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function setSignedCookie(res: express.Response, name: string, secret: string, scope: string, ttlSeconds: number, cookiePath: string, secure: boolean): void {
  const session = makeSignedSession(secret, scope, ttlSeconds);
  setCookie(res, name, session.value, cookiePath, ttlSeconds, secure);
}

function setCookie(res: express.Response, name: string, value: string, cookiePath: string, ttlSeconds: number, secure: boolean): void {
  const securePart = secure ? '; Secure' : '';
  res.setHeader('set-cookie', `${name}=${encodeURIComponent(value)}; Path=${cookiePath}; Max-Age=${ttlSeconds}; HttpOnly; SameSite=Lax${securePart}`);
}

function clearCookie(res: express.Response, name: string, cookiePath: string): void {
  res.setHeader('set-cookie', [
    `${name}=; Path=${cookiePath}; Max-Age=0; HttpOnly; SameSite=Lax`,
    `${name}=; Path=${cookiePath.replace(/\/$/, '')}; Max-Age=0; HttpOnly; SameSite=Lax`
  ]);
}

function secureCookie(req: express.Request, mode: string): boolean {
  const normalized = mode.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return req.secure || String(req.get('x-forwarded-proto') ?? '').split(',')[0].trim().toLowerCase() === 'https';
}

function querySuffix(req: express.Request): string {
  const index = req.originalUrl.indexOf('?');
  return index === -1 ? '' : req.originalUrl.slice(index);
}

function opsHealthPayload(ctx: ControlPlaneContext) {
  const health = ctx.health();
  const checks = [
    { name: 'app-health', ok: health.ok, detail: health.appServer },
    { name: 'app-ready', ok: health.ready, detail: health.ready ? 'ready' : 'not ready' },
    { name: 'data-dir', ok: pathExists(config.dataDir), detail: config.dataDir },
    { name: 'workspace-root', ok: pathExists(config.workspaceRoot), detail: config.workspaceRoot }
  ];
  return {
    service: 'codex-platform-ops',
    ok: health.ok && checks.every((check) => check.ok),
    ready: health.ready,
    checkedAt: new Date().toISOString(),
    checks,
    health
  };
}

function opsStatusPayload(ctx: ControlPlaneContext) {
  const snapshot = ctx.store.snapshot();
  return {
    ok: true,
    service: 'codex-platform',
    appServer: ctx.health().appServer,
    demoMode: config.demoMode,
    pid: process.pid,
    uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
    counts: {
      projects: snapshot.projects.length,
      threads: snapshot.threads.length,
      cards: snapshot.cards.length,
      approvals: snapshot.approvals.length,
      approvalHistory: snapshot.approvalHistory?.length ?? 0,
      gitOperations: snapshot.gitOperations?.length ?? 0,
      errors: snapshot.errors?.length ?? 0
    }
  };
}

function systemPayload(ctx: ControlPlaneContext) {
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    process: {
      pid: process.pid,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSeconds: Math.round(process.uptime()),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    },
    host: {
      hostname: os.hostname(),
      loadAverage: os.loadavg(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpus: os.cpus().length
    },
    paths: {
      workspaceRoot: pathSummary(config.workspaceRoot),
      dataDir: pathSummary(config.dataDir),
      codexHome: pathSummary(config.codex.home)
    },
    disk: diskSummary(config.dataDir),
    status: opsStatusPayload(ctx)
  };
}

function configSummary() {
  return {
    ok: true,
    appName: config.appName,
    demoMode: config.demoMode,
    host: config.host,
    port: config.port,
    paths: {
      workspaceRoot: config.workspaceRoot,
      allowedWorkspaceRoots: config.allowedWorkspaceRoots,
      dataDir: config.dataDir,
      codexHome: config.codex.home
    },
    auth: {
      required: config.auth.required,
      allowUnauthenticated: config.auth.allowUnauthenticated,
      cookieName: config.auth.cookieName,
      headerName: config.auth.headerName
    },
    ops: {
      enabled: config.ops.enabled,
      cookieName: config.ops.cookieName,
      headerName: config.ops.headerName,
      sessionTtlSeconds: config.ops.sessionTtlSeconds,
      tokenConfigured: Boolean(config.ops.token)
    },
    admin: {
      enabled: config.admin.enabled,
      cookieName: config.admin.cookieName,
      headerName: config.admin.headerName,
      csrfHeaderName: config.admin.csrfHeaderName,
      sessionTtlSeconds: config.admin.sessionTtlSeconds,
      tokenConfigured: Boolean(config.admin.token),
      auditLogFile: config.admin.auditLogFile
    },
    huggingFace: config.huggingFace,
    limits: config.limits,
    codex: {
      bin: config.codex.bin,
      args: config.codex.args,
      clientName: config.codex.clientName,
      defaultModel: config.codex.defaultModel,
      approvalPolicy: config.codex.approvalPolicy,
      sandbox: config.codex.sandbox,
      effort: config.codex.effort,
      summary: config.codex.summary
    }
  };
}

function versionPayload(ctx: ControlPlaneContext) {
  return {
    ok: true,
    service: 'codex-platform',
    version: packageVersion(),
    build: ctx.buildSha ? { sha: ctx.buildSha } : undefined,
    source: readBuildSource(),
    runtime: {
      node: process.version,
      pid: process.pid,
      startedAt: new Date(ctx.startedAt).toISOString()
    },
    huggingFace: config.huggingFace
  };
}

function errorsPayload(snapshot: AppStateSnapshot) {
  const errors = (snapshot.errors ?? []).slice(0, 20);
  return {
    ok: errors.length === 0,
    count: errors.length,
    errors
  };
}

function metricsPayload(ctx: ControlPlaneContext, req: express.Request): string {
  const health = ctx.health();
  const snapshot = ctx.store.snapshot();
  const mem = process.memoryUsage();
  const system = diskSummary(config.dataDir);
  const lines = [
    '# HELP codex_platform_ops_up Whether the ops route is serving.',
    '# TYPE codex_platform_ops_up gauge',
    'codex_platform_ops_up 1',
    '# HELP codex_platform_health_ok Whether Codex-Platform reports ok.',
    '# TYPE codex_platform_health_ok gauge',
    `codex_platform_health_ok ${health.ok ? 1 : 0}`,
    '# HELP codex_platform_ready Whether Codex-Platform reports ready.',
    '# TYPE codex_platform_ready gauge',
    `codex_platform_ready ${health.ready ? 1 : 0}`,
    '# HELP codex_platform_uptime_seconds Process uptime in seconds.',
    '# TYPE codex_platform_uptime_seconds gauge',
    `codex_platform_uptime_seconds ${Math.round((Date.now() - ctx.startedAt) / 1000)}`,
    '# HELP codex_platform_memory_bytes Node process memory usage.',
    '# TYPE codex_platform_memory_bytes gauge',
    `codex_platform_memory_bytes{kind="rss"} ${mem.rss}`,
    `codex_platform_memory_bytes{kind="heap_used"} ${mem.heapUsed}`,
    `codex_platform_memory_bytes{kind="heap_total"} ${mem.heapTotal}`,
    '# HELP codex_platform_entities Current in-memory entity counts.',
    '# TYPE codex_platform_entities gauge',
    `codex_platform_entities{kind="projects"} ${snapshot.projects.length}`,
    `codex_platform_entities{kind="threads"} ${snapshot.threads.length}`,
    `codex_platform_entities{kind="cards"} ${snapshot.cards.length}`,
    `codex_platform_entities{kind="approvals"} ${snapshot.approvals.length}`,
    `codex_platform_entities{kind="errors"} ${snapshot.errors?.length ?? 0}`,
    '# HELP codex_platform_disk_bytes Filesystem bytes for CODEX_PLATFORM_DATA_DIR.',
    '# TYPE codex_platform_disk_bytes gauge',
    `codex_platform_disk_bytes{kind="total"} ${system.totalBytes ?? 0}`,
    `codex_platform_disk_bytes{kind="free"} ${system.freeBytes ?? 0}`,
    `# source=${escapeMetricComment(req.protocol)}`
  ];
  return `${lines.join('\n')}\n`;
}

function adminStatusPayload(ctx: ControlPlaneContext, auth: AuthContext | undefined) {
  return {
    ok: true,
    service: 'codex-platform-admin',
    auth: {
      kind: auth?.kind,
      csrfToken: auth?.kind === 'cookie' ? auth.csrfToken : undefined
    },
    health: ctx.health(),
    admin: {
      enabled: config.admin.enabled,
      auditLogFile: config.admin.auditLogFile
    },
    actions: adminActions
  };
}

function appendAudit(action: string, ok: boolean, actor: string, target: string, details: Record<string, unknown>): void {
  try {
    fs.mkdirSync(path.dirname(config.admin.auditLogFile), { recursive: true });
    const event = {
      time: new Date().toISOString(),
      action,
      ok,
      actor,
      target,
      details: redact(details)
    };
    fs.appendFileSync(config.admin.auditLogFile, `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // Audit write failures should not take down the app, but action responses still include their own result.
  }
}

function readAudit(limit: number) {
  try {
    const text = fs.readFileSync(config.admin.auditLogFile, 'utf8');
    const lines = text.trim() ? text.trim().split(/\r?\n/) : [];
    const events = lines.slice(-limit).reverse().map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        return { malformed: true, line };
      }
    });
    return { ok: true, exists: true, returned: events.length, events };
  } catch {
    return { ok: true, exists: false, returned: 0, events: [] };
  }
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (/token|secret|password|authorization|api[-_]?key|cookie|csrf/i.test(key)) out[key] = '[redacted]';
    else out[key] = redact(entry, depth + 1);
  }
  return out;
}

function pathExists(value: string): boolean {
  try {
    return fs.existsSync(value);
  } catch {
    return false;
  }
}

function pathSummary(value: string) {
  try {
    const stat = fs.statSync(value);
    return {
      path: value,
      exists: true,
      type: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other',
      mode: stat.mode & 0o777,
      size: stat.size,
      mtime: stat.mtime.toISOString()
    };
  } catch {
    return { path: value, exists: false };
  }
}

function diskSummary(value: string): { path: string; totalBytes?: number; freeBytes?: number; availableBytes?: number; error?: string } {
  const target = nearestExistingPath(value);
  try {
    const stat = fs.statfsSync(target);
    return {
      path: target,
      totalBytes: stat.blocks * stat.bsize,
      freeBytes: stat.bfree * stat.bsize,
      availableBytes: stat.bavail * stat.bsize
    };
  } catch (error) {
    return { path: target, error: error instanceof Error ? error.message : String(error) };
  }
}

function nearestExistingPath(value: string): string {
  let current = path.resolve(value);
  while (!pathExists(current)) {
    const next = path.dirname(current);
    if (next === current) return current;
    current = next;
  }
  return current;
}

function packageVersion(): string | undefined {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
    return packageJson.version;
  } catch {
    return undefined;
  }
}

function readBuildSource(): Record<string, string> | undefined {
  try {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'BUILD_SOURCE.txt'), 'utf8');
    const out: Record<string, string> = {};
    for (const line of content.split(/\r?\n/)) {
      const index = line.indexOf('=');
      if (index > 0) out[line.slice(0, index)] = line.slice(index + 1);
    }
    return out;
  } catch {
    return undefined;
  }
}

function boundedNumber(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function remoteAddr(req: express.Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function escapeMetricComment(value: string): string {
  return value.replace(/[\r\n]/g, ' ');
}

function adminDisabledHtml(message: string): string {
  return htmlPage('Codex Admin Disabled', `<main class="panel"><h1>Codex Admin</h1><p>${escapeHtml(message)}</p></main>`, '');
}

function opsLoginHtml(input: { locked: boolean; message?: string }): string {
  const body = `
    <main class="panel">
      <div class="kicker">Codex-Platform</div>
      <h1>Ops</h1>
      <p>${input.locked ? escapeHtml(input.message ?? 'Ops is disabled.') : 'Sign in with CODEX_PLATFORM_OPS_TOKEN.'}</p>
      ${input.locked ? '' : `
        <form id="loginForm" class="stack">
          <input id="token" type="password" autocomplete="current-password" placeholder="CODEX_PLATFORM_OPS_TOKEN" />
          <button type="submit">Open ops</button>
        </form>
        <p id="error" class="error"></p>
      `}
    </main>`;
  const script = input.locked ? '' : `
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const token = document.getElementById('token').value;
      const response = await fetch('/_ops/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({token})
      });
      if (response.ok) location.href = '/_ops/';
      else document.getElementById('error').textContent = await response.text();
    });
  `;
  return htmlPage('Codex Ops', body, script);
}

function opsDashboardHtml(): string {
  const body = `
    <main class="shell">
      <header>
        <div>
          <div class="kicker">Codex-Platform</div>
          <h1>Ops</h1>
        </div>
        <div class="actions">
          <button id="refresh">Refresh</button>
          <button id="logout">Logout</button>
        </div>
      </header>
      <section class="grid">
        <article class="card"><h2>Health</h2><pre id="health">loading...</pre></article>
        <article class="card"><h2>Status</h2><pre id="status">loading...</pre></article>
        <article class="card"><h2>System</h2><pre id="system">loading...</pre></article>
        <article class="card"><h2>Errors</h2><pre id="errors">loading...</pre></article>
      </section>
      <section class="card"><h2>Config</h2><pre id="config">loading...</pre></section>
    </main>`;
  const script = `
    async function loadJson(path) {
      const response = await fetch(path, {credentials: 'same-origin'});
      const text = await response.text();
      if (!response.ok) throw new Error(text || response.statusText);
      return JSON.parse(text);
    }
    function show(id, value) {
      document.getElementById(id).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    }
    async function refresh() {
      const entries = [['health','/_ops/health'], ['status','/_ops/status'], ['system','/_ops/system'], ['errors','/_ops/errors'], ['config','/_ops/config']];
      for (const [id, path] of entries) {
        try { show(id, await loadJson(path)); }
        catch (error) { show(id, String(error)); }
      }
    }
    document.getElementById('refresh').addEventListener('click', refresh);
    document.getElementById('logout').addEventListener('click', async () => {
      await fetch('/_ops/logout', {method: 'POST', credentials: 'same-origin'});
      location.reload();
    });
    refresh();
    setInterval(refresh, 30000);
  `;
  return htmlPage('Codex Ops', body, script);
}

function adminDashboardHtml(): string {
  const body = `
    <main class="shell">
      <header>
        <div>
          <div class="kicker">Codex-Platform</div>
          <h1>Admin</h1>
        </div>
        <div class="actions">
          <button id="refresh">Refresh</button>
          <button id="logout">Logout</button>
        </div>
      </header>
      <section id="loginPanel" class="panel">
        <h2>Sign in</h2>
        <form id="loginForm" class="stack">
          <input id="token" type="password" autocomplete="current-password" placeholder="CODEX_PLATFORM_ADMIN_TOKEN" />
          <button type="submit">Open admin</button>
        </form>
        <p id="loginError" class="error"></p>
      </section>
      <section id="dashboard" class="hidden">
        <section class="grid">
          <article class="card"><h2>Status</h2><pre id="status">loading...</pre></article>
          <article class="card"><h2>Audit</h2><pre id="audit">loading...</pre></article>
        </section>
        <section class="card"><h2>Actions</h2><div id="actions" class="action-list"></div></section>
      </section>
    </main>`;
  const script = `
    let csrfToken = '';
    async function api(path, options = {}) {
      const response = await fetch('/_admin/' + path.replace(/^\\//, ''), {
        credentials: 'same-origin',
        headers: {'content-type': 'application/json', ...(csrfToken ? {'${config.admin.csrfHeaderName}': csrfToken} : {})},
        ...options
      });
      const text = await response.text();
      let payload;
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = {error: text}; }
      if (!response.ok) throw new Error(payload.error || text || response.statusText);
      return payload;
    }
    function show(id, value) {
      document.getElementById(id).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    }
    async function login(event) {
      event.preventDefault();
      try {
        const token = document.getElementById('token').value;
        const payload = await api('api/login', {method: 'POST', body: JSON.stringify({token})});
        csrfToken = payload.csrfToken || '';
        await refresh();
      } catch (error) {
        document.getElementById('loginError').textContent = String(error);
      }
    }
    async function refresh() {
      const status = await api('api/status');
      csrfToken = status.auth?.csrfToken || csrfToken;
      document.getElementById('loginPanel').classList.add('hidden');
      document.getElementById('dashboard').classList.remove('hidden');
      show('status', status);
      const actions = await api('api/actions');
      renderActions(actions.actions || []);
      show('audit', await api('api/audit?limit=30'));
    }
    function renderActions(actions) {
      const root = document.getElementById('actions');
      root.innerHTML = '';
      for (const action of actions) {
        const row = document.createElement('div');
        row.className = 'action-row';
        row.innerHTML = '<div><strong></strong><p></p></div><button></button>';
        row.querySelector('strong').textContent = action.label;
        row.querySelector('p').textContent = action.description;
        const button = row.querySelector('button');
        button.textContent = action.confirmLabel || action.label;
        button.addEventListener('click', async () => {
          if (!confirm(action.confirmLabel || action.label)) return;
          try {
            const result = await api('api/actions/' + encodeURIComponent(action.id), {method: 'POST', body: JSON.stringify({confirm: true})});
            alert(JSON.stringify(result, null, 2));
            await refresh();
          } catch (error) {
            alert(String(error));
          }
        });
        root.appendChild(row);
      }
    }
    document.getElementById('loginForm').addEventListener('submit', login);
    document.getElementById('refresh').addEventListener('click', () => refresh().catch((error) => show('status', String(error))));
    document.getElementById('logout').addEventListener('click', async () => {
      await api('api/logout', {method: 'POST', body: JSON.stringify({})}).catch(() => undefined);
      location.reload();
    });
    refresh().catch(() => undefined);
  `;
  return htmlPage('Codex Admin', body, script);
}

function htmlPage(title: string, body: string, script: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; --bg:#f7f7f8; --panel:#fff; --panel2:#f4f4f5; --text:#171717; --muted:#666970; --border:#e2e2e4; --accent:#0a84ff; --danger:#dc2626; }
    @media (prefers-color-scheme: dark) { :root { --bg:#101012; --panel:#1a1a1c; --panel2:#242427; --text:#ededed; --muted:#9a9aa0; --border:#313136; --accent:#3b9dff; --danger:#f87171; } }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
    button,input { font:inherit; }
    button { border:1px solid var(--border); border-radius:8px; background:var(--panel); color:var(--text); padding:8px 10px; cursor:pointer; }
    button:hover { background:var(--panel2); }
    input { border:1px solid var(--border); border-radius:8px; background:var(--panel); color:var(--text); padding:10px 12px; min-width:min(360px,100%); }
    h1,h2,p { margin:0; }
    h1 { font-size:24px; letter-spacing:0; }
    h2 { font-size:15px; margin-bottom:10px; }
    pre { margin:0; max-height:44vh; overflow:auto; white-space:pre-wrap; word-break:break-word; background:var(--panel2); border:1px solid var(--border); border-radius:8px; padding:10px; font-size:12px; }
    .shell { min-height:100vh; padding:24px; display:grid; gap:16px; align-content:start; }
    header { display:flex; align-items:center; justify-content:space-between; gap:16px; }
    .panel,.card { border:1px solid var(--border); background:var(--panel); border-radius:8px; padding:16px; }
    .panel { width:min(480px,calc(100vw - 32px)); margin:12vh auto 0; display:grid; gap:14px; }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
    .kicker { color:var(--muted); font-size:12px; margin-bottom:4px; }
    .actions,.stack { display:flex; gap:8px; align-items:center; }
    .stack { flex-wrap:wrap; }
    .error { color:var(--danger); }
    .hidden { display:none !important; }
    .action-list { display:grid; gap:10px; }
    .action-row { display:flex; align-items:center; justify-content:space-between; gap:16px; border:1px solid var(--border); border-radius:8px; padding:12px; }
    .action-row p { color:var(--muted); margin-top:4px; }
    @media (max-width: 760px) { .grid { grid-template-columns:1fr; } header,.action-row { align-items:flex-start; flex-direction:column; } .shell { padding:16px; } }
  </style>
</head>
<body>
${body}
<script>
${script}
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
