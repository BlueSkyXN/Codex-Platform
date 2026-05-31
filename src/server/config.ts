import fs from 'node:fs';
import path from 'node:path';

function loadDotEnvFile(file: string): void {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    process.env[key] = value;
  }
}

loadDotEnvFile(path.resolve(process.cwd(), '.env'));
loadDotEnvFile(path.resolve(process.cwd(), '.env.local'));

const env = process.env;

function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

function boolAny(names: string[], fallback = false): boolean {
  const value = firstEnv(...names);
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function intAny(names: string[], fallback: number): number {
  const value = Number(firstEnv(...names));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boundedIntAny(names: string[], fallback: number, minimum: number, maximum: number): number {
  const value = intAny(names, fallback);
  return Math.max(minimum, Math.min(maximum, value));
}

function csvAny(names: string[], fallback: string[]): string[] {
  const value = firstEnv(...names);
  if (!value) return fallback;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function exists(file: string): boolean {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

const isHuggingFaceSpace = boolAny(
  ['CODEX_PLATFORM_HF_SPACE', 'CODEX_WEB_HF_SPACE'],
  Boolean(env.SPACE_ID || env.SPACE_HOST || env.HUGGINGFACE_SPACE_ID)
);
const defaultPort = isHuggingFaceSpace ? 7860 : 8787;
const host = firstEnv('HOST') ?? (isHuggingFaceSpace ? '0.0.0.0' : '127.0.0.1');
const hfStorageRoot = path.resolve(firstEnv('CODEX_PLATFORM_HF_STORAGE_ROOT', 'CODEX_WEB_HF_STORAGE_ROOT') ?? '/data');
const defaultWorkspaceRoot = isHuggingFaceSpace ? path.join(hfStorageRoot, 'workspace') : process.cwd();
const workspaceRoot = path.resolve(firstEnv('WORKSPACE_ROOT') ?? defaultWorkspaceRoot);
const defaultDataDir = isHuggingFaceSpace ? path.join(hfStorageRoot, 'codex-platform') : path.join(workspaceRoot, '.codex-platform');
const dataDir = path.resolve(firstEnv('CODEX_PLATFORM_DATA_DIR', 'CODEX_WEB_DATA_DIR') ?? defaultDataDir);
const codexHome = path.resolve(firstEnv('CODEX_HOME') ?? (isHuggingFaceSpace ? path.join(hfStorageRoot, 'codex-home') : path.join(env.HOME ?? process.cwd(), '.codex')));
const authToken = firstEnv('CODEX_PLATFORM_AUTH_TOKEN', 'CODEX_WEB_AUTH_TOKEN');
const opsToken = firstEnv('CODEX_PLATFORM_OPS_TOKEN');
const adminEnabled = boolAny(['CODEX_PLATFORM_ADMIN_ENABLED'], false);
const adminToken = firstEnv('CODEX_PLATFORM_ADMIN_TOKEN');
const codeBin = firstEnv('CODEX_BIN') ?? 'codex';

function resolveDemoMode(): boolean {
  const raw = firstEnv('DEMO_MODE');
  if (raw && raw.toLowerCase() !== 'auto') return boolAny(['DEMO_MODE'], false);
  if (!isHuggingFaceSpace) return false;
  if (boolAny(['CODEX_FORCE_REAL'], false)) return false;
  const hasLikelyCodexAuth = Boolean(
    env.OPENAI_API_KEY ||
    env.CODEX_AUTH_TOKEN ||
    env.OPENAI_API_TOKEN ||
    exists(path.join(codexHome, 'auth.json'))
  );
  return !hasLikelyCodexAuth;
}

const demoMode = resolveDemoMode();
const loopbackHost = host === '127.0.0.1' || host === 'localhost' || host === '::1';
const allowUnauthenticated = boolAny(
  ['CODEX_PLATFORM_ALLOW_UNAUTHENTICATED', 'CODEX_WEB_ALLOW_UNAUTHENTICATED'],
  loopbackHost || (isHuggingFaceSpace && demoMode && !authToken)
);
const spaceHost = env.SPACE_HOST || undefined;
const publicUrl = firstEnv('PUBLIC_URL') || (spaceHost ? `https://${spaceHost}` : undefined);

export const config = {
  appName: 'Codex-Platform',
  port: intAny(['PORT'], defaultPort),
  host,
  workspaceRoot,
  allowedWorkspaceRoots: csvAny(['WORKSPACE_ROOTS'], [workspaceRoot]).map((root) => path.resolve(root)),
  dataDir,
  demoMode,
  huggingFace: {
    enabled: isHuggingFaceSpace,
    spaceId: env.SPACE_ID || env.HUGGINGFACE_SPACE_ID || undefined,
    spaceHost,
    publicUrl,
    storageRoot: hfStorageRoot,
    autoCreateWorkspace: boolAny(['CODEX_PLATFORM_AUTO_CREATE_WORKSPACE', 'CODEX_WEB_AUTO_CREATE_WORKSPACE'], isHuggingFaceSpace)
  },
  auth: {
    token: authToken,
    required: Boolean(authToken),
    allowUnauthenticated,
    cookieName: firstEnv('CODEX_PLATFORM_AUTH_COOKIE', 'CODEX_WEB_AUTH_COOKIE') ?? 'codex_platform_auth',
    headerName: firstEnv('CODEX_PLATFORM_AUTH_HEADER', 'CODEX_WEB_AUTH_HEADER') ?? 'x-codex-platform-token'
  },
  ops: {
    token: opsToken,
    enabled: Boolean(opsToken),
    cookieName: firstEnv('CODEX_PLATFORM_OPS_COOKIE') ?? 'codex_platform_ops',
    headerName: firstEnv('CODEX_PLATFORM_OPS_HEADER') ?? 'x-codex-platform-ops-token',
    sessionTtlSeconds: boundedIntAny(['CODEX_PLATFORM_OPS_SESSION_TTL_SECONDS'], 3600, 60, 86_400),
    cookieSecure: firstEnv('CODEX_PLATFORM_OPS_COOKIE_SECURE') ?? 'auto'
  },
  admin: {
    enabled: adminEnabled,
    token: adminToken,
    cookieName: firstEnv('CODEX_PLATFORM_ADMIN_COOKIE') ?? 'codex_platform_admin',
    headerName: firstEnv('CODEX_PLATFORM_ADMIN_HEADER') ?? 'x-codex-platform-admin-token',
    csrfHeaderName: firstEnv('CODEX_PLATFORM_ADMIN_CSRF_HEADER') ?? 'x-codex-platform-admin-csrf',
    csrfKey: firstEnv('CODEX_PLATFORM_ADMIN_CSRF_KEY'),
    sessionTtlSeconds: boundedIntAny(['CODEX_PLATFORM_ADMIN_SESSION_TTL_SECONDS'], 3600, 60, 86_400),
    cookieSecure: firstEnv('CODEX_PLATFORM_ADMIN_COOKIE_SECURE') ?? 'auto',
    auditLogFile: path.resolve(firstEnv('CODEX_PLATFORM_ADMIN_AUDIT_LOG') ?? path.join(dataDir, 'admin-audit.jsonl'))
  },
  limits: {
    bodyLimit: firstEnv('CODEX_PLATFORM_BODY_LIMIT', 'CODEX_WEB_BODY_LIMIT') ?? '2mb',
    rateLimitWindowMs: intAny(['CODEX_PLATFORM_RATE_LIMIT_WINDOW_MS', 'CODEX_WEB_RATE_LIMIT_WINDOW_MS'], 60_000),
    rateLimitMax: intAny(['CODEX_PLATFORM_RATE_LIMIT_MAX', 'CODEX_WEB_RATE_LIMIT_MAX'], 240),
    maxWsClients: intAny(['CODEX_PLATFORM_MAX_WS_CLIENTS', 'CODEX_WEB_MAX_WS_CLIENTS'], 32),
    maxCards: intAny(['CODEX_PLATFORM_MAX_CARDS', 'CODEX_WEB_MAX_CARDS'], 5000),
    maxErrors: intAny(['CODEX_PLATFORM_MAX_ERRORS', 'CODEX_WEB_MAX_ERRORS'], 50),
    maxEventLogBytes: intAny(['CODEX_PLATFORM_MAX_EVENT_LOG_BYTES', 'CODEX_WEB_MAX_EVENT_LOG_BYTES'], 25 * 1024 * 1024),
    rpcDefaultTimeoutMs: intAny(['CODEX_PLATFORM_RPC_TIMEOUT_MS', 'CODEX_WEB_RPC_TIMEOUT_MS'], 120_000),
    maxFileTreeEntries: intAny(['CODEX_PLATFORM_MAX_FILE_TREE_ENTRIES', 'CODEX_WEB_MAX_FILE_TREE_ENTRIES'], 600),
    maxFileReadBytes: intAny(['CODEX_PLATFORM_MAX_FILE_READ_BYTES', 'CODEX_WEB_MAX_FILE_READ_BYTES'], 256 * 1024),
    gitCommandTimeoutMs: intAny(['CODEX_PLATFORM_GIT_TIMEOUT_MS', 'CODEX_WEB_GIT_TIMEOUT_MS'], 8_000)
  },
  github: {
    token: firstEnv('GITHUB_TOKEN', 'GH_TOKEN'),
    actionsTimeoutMs: intAny(['CODEX_PLATFORM_GITHUB_ACTIONS_TIMEOUT_MS'], 8_000)
  },
  persistence: {
    projectsFile: path.join(dataDir, 'projects.json'),
    snapshotFile: path.join(dataDir, 'snapshot.json'),
    eventLogFile: path.join(dataDir, 'events.jsonl')
  },
  codex: {
    bin: codeBin,
    args: (firstEnv('CODEX_ARGS') ?? 'app-server').split(/\s+/).filter(Boolean),
    home: codexHome,
    clientName: firstEnv('CODEX_CLIENT_NAME') ?? 'codex_platform',
    clientTitle: firstEnv('CODEX_CLIENT_TITLE') ?? 'Codex-Platform',
    clientVersion: firstEnv('CODEX_CLIENT_VERSION') ?? '0.1.0',
    defaultModel: firstEnv('CODEX_MODEL'),
    approvalPolicy: firstEnv('CODEX_APPROVAL_POLICY') ?? 'unlessTrusted',
    sandbox: firstEnv('CODEX_SANDBOX') ?? 'workspaceWrite',
    effort: firstEnv('CODEX_EFFORT') ?? 'medium',
    summary: firstEnv('CODEX_SUMMARY') ?? 'concise',
    approvalResultShape: (firstEnv('APPROVAL_RESULT_SHAPE') ?? 'string') as 'string' | 'object',
    scanUserAgents: boolAny(['CODEX_PLATFORM_SCAN_USER_AGENTS', 'CODEX_WEB_SCAN_USER_AGENTS'], true),
    projectRootMarkers: csvAny(['CODEX_PLATFORM_PROJECT_ROOT_MARKERS', 'CODEX_WEB_PROJECT_ROOT_MARKERS'], ['.git'])
  }
};

export function assertSafeRuntimeConfig(): void {
  if (!config.auth.required && !config.auth.allowUnauthenticated) {
    throw new Error(
      'Refusing to start without CODEX_PLATFORM_AUTH_TOKEN on a non-loopback host. ' +
      'Set CODEX_PLATFORM_AUTH_TOKEN or explicitly set CODEX_PLATFORM_ALLOW_UNAUTHENTICATED=true for a trusted demo network only.'
    );
  }
  if (!config.demoMode && config.huggingFace.enabled && !config.auth.required) {
    throw new Error('Real Codex mode on Hugging Face Spaces requires CODEX_PLATFORM_AUTH_TOKEN. Set it as a Space Secret.');
  }
}
