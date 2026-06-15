import type express from 'express';
import { ErrorCodes, sendErr } from '../envelope.js';
import type { ApiKeyRecord, ApiKeyStore, Scope } from './keys.js';

// Auth middleware for the public /v1 API. Independent of the browser session and
// the ops/admin tokens. See local/refactor-2026/03-API-对外与内部.md §2.1.

export type V1AuthDeps = {
  enabled: boolean;
  store: ApiKeyStore;
};

function authHeaderToken(req: express.Request): string | undefined {
  const header = req.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return undefined;
}

export function getRequestKey(res: express.Response): ApiKeyRecord | undefined {
  return res.locals.apiKey as ApiKeyRecord | undefined;
}

// Gate the whole surface: when the public API is disabled it must be invisible
// (404), never a 401 that hints the surface exists.
export function makePublicApiGate(deps: V1AuthDeps): express.RequestHandler {
  return (_req, res, next) => {
    if (!deps.enabled) {
      sendErr(res, 404, ErrorCodes.notFound, 'Not found');
      return;
    }
    next();
  };
}

// Require a valid API key (any scope). Attaches the record to res.locals.apiKey.
export function makeApiKeyAuth(deps: V1AuthDeps): express.RequestHandler {
  return (req, res, next) => {
    const token = authHeaderToken(req);
    if (!token) {
      sendErr(res, 401, ErrorCodes.unauthorized, 'Missing API key. Use Authorization: Bearer <key>.');
      return;
    }
    const record = deps.store.verify(token);
    if (!record) {
      sendErr(res, 401, ErrorCodes.invalidApiKey, 'Invalid or revoked API key.');
      return;
    }
    res.locals.apiKey = record;
    next();
  };
}

// Require a specific scope on the authenticated key.
export function requireScope(scope: Scope): express.RequestHandler {
  return (_req, res, next) => {
    const key = getRequestKey(res);
    if (!key) {
      sendErr(res, 401, ErrorCodes.unauthorized, 'API key required.');
      return;
    }
    if (!key.scopes.has(scope)) {
      sendErr(res, 403, ErrorCodes.scopeInsufficient, `This key is missing the required scope: ${scope}.`);
      return;
    }
    next();
  };
}

// Enforce a key's optional project allowlist.
export function keyAllowsProject(res: express.Response, projectId: string): boolean {
  const key = getRequestKey(res);
  if (!key) return false;
  if (!key.projectIds) return true;
  return key.projectIds.has(projectId);
}
