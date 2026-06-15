import crypto from 'node:crypto';

// Public API key store. Keys are configured via env and stored only as SHA-256
// hashes in memory; the plaintext token never persists. See
// local/refactor-2026/03-API-对外与内部.md §2.1.

export const ALL_SCOPES = [
  'projects:read',
  'projects:write',
  'threads:read',
  'threads:write',
  'approvals:write',
  'git:read',
  'git:write',
  'review:read',
  'capabilities:read',
  'webhooks:manage'
] as const;

export type Scope = (typeof ALL_SCOPES)[number];

const READ_SCOPES: Scope[] = ALL_SCOPES.filter((s) => s.endsWith(':read'));

export type ApiKeyRecord = {
  id: string; // short, non-secret label for logs/audit
  name: string;
  hash: string; // sha256 hex of the plaintext token
  scopes: Set<Scope>;
  projectIds: Set<string> | null; // null = all projects
  createdAt: number;
  lastUsedAt?: number;
  useCount: number;
};

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function expandScopes(raw: string[]): Set<Scope> {
  const out = new Set<Scope>();
  for (const token of raw) {
    const scope = token.trim();
    if (!scope) continue;
    if (scope === '*' || scope === 'all') {
      for (const s of ALL_SCOPES) out.add(s);
    } else if (scope === 'read' || scope === '*:read') {
      for (const s of READ_SCOPES) out.add(s);
    } else if ((ALL_SCOPES as readonly string[]).includes(scope)) {
      out.add(scope as Scope);
    }
  }
  return out;
}

function shortId(token: string): string {
  // A non-secret, stable label derived from the hash (not the token itself).
  return `key_${sha256Hex(token).slice(0, 10)}`;
}

/**
 * Parse the CODEX_PLATFORM_PUBLIC_API_KEYS env spec.
 *
 * Format: semicolon-separated entries, each `token|scope1,scope2[,projects=p1 p2]`.
 *   cpk_live_demo|threads:read,projects:read
 *   cpk_live_ci|*|projects=proj_a
 * Scope shorthands: `*`/`all` = every scope, `read`/`*:read` = every :read scope.
 * Optional `projects=` segment (space-separated ids) restricts the key to those
 * projects; omit for all-projects access.
 */
export function parseApiKeySpec(spec: string): ApiKeyRecord[] {
  const records: ApiKeyRecord[] = [];
  for (const rawEntry of spec.split(';')) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const segments = entry.split('|').map((s) => s.trim());
    const token = segments[0];
    if (!token) continue;
    let scopeText = segments[1] ?? '';
    let projectIds: Set<string> | null = null;
    let name = shortId(token);
    for (const extra of segments.slice(2)) {
      if (extra.startsWith('projects=')) {
        const ids = extra.slice('projects='.length).split(/\s+/).map((s) => s.trim()).filter(Boolean);
        projectIds = ids.length ? new Set(ids) : null;
      } else if (extra.startsWith('name=')) {
        name = extra.slice('name='.length).trim() || name;
      }
    }
    // also allow a `projects=` token to appear in the scope segment
    if (scopeText.includes('projects=')) {
      const parts = scopeText.split(',').map((s) => s.trim());
      const kept: string[] = [];
      for (const part of parts) {
        if (part.startsWith('projects=')) {
          const ids = part.slice('projects='.length).split(/\s+/).filter(Boolean);
          projectIds = ids.length ? new Set(ids) : null;
        } else {
          kept.push(part);
        }
      }
      scopeText = kept.join(',');
    }
    const scopes = expandScopes(scopeText.split(','));
    if (scopes.size === 0) continue; // a key with no scopes is useless; skip it
    records.push({
      id: shortId(token),
      name,
      hash: sha256Hex(token),
      scopes,
      projectIds,
      createdAt: Date.now(),
      useCount: 0
    });
  }
  return records;
}

export class ApiKeyStore {
  private readonly byHash = new Map<string, ApiKeyRecord>();

  constructor(records: ApiKeyRecord[] = []) {
    for (const record of records) this.byHash.set(record.hash, record);
  }

  static fromEnvSpec(spec: string): ApiKeyStore {
    return new ApiKeyStore(parseApiKeySpec(spec));
  }

  get size(): number {
    return this.byHash.size;
  }

  list(): Array<Omit<ApiKeyRecord, 'hash'>> {
    return [...this.byHash.values()].map(({ hash: _hash, ...rest }) => rest);
  }

  verify(token: string | undefined): ApiKeyRecord | undefined {
    if (!token) return undefined;
    const hash = sha256Hex(token);
    const record = this.byHash.get(hash);
    if (!record) return undefined;
    // constant-time compare on the hashes to avoid timing leaks
    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(record.hash))) return undefined;
    record.lastUsedAt = Date.now();
    record.useCount += 1;
    return record;
  }
}
