import type express from 'express';
import type { IncomingMessage } from 'node:http';
import { config } from '../config.js';

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function tokenFromRequest(req: express.Request): string | undefined {
  const auth = req.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const headerToken = req.get(config.auth.headerName);
  if (headerToken) return headerToken.trim();
  const legacyHeaderToken = req.get('x-codex-web-token');
  if (legacyHeaderToken) return legacyHeaderToken.trim();
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  if (queryToken) return queryToken;
  const cookies = parseCookies(req.get('cookie'));
  return cookies[config.auth.cookieName];
}

export function tokenFromUpgrade(req: IncomingMessage, url: URL): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const header = req.headers[config.auth.headerName.toLowerCase()];
  if (typeof header === 'string') return header;
  const legacyHeader = req.headers['x-codex-web-token'];
  if (typeof legacyHeader === 'string') return legacyHeader;
  const queryToken = url.searchParams.get('token') ?? undefined;
  if (queryToken) return queryToken;
  const cookies = parseCookies(req.headers.cookie);
  return cookies[config.auth.cookieName];
}

export function isAuthorizedToken(token: string | undefined): boolean {
  if (!config.auth.required) return true;
  return Boolean(token && token === config.auth.token);
}

export function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (isAuthorizedToken(tokenFromRequest(req))) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

export function loginRoute(req: express.Request, res: express.Response): void {
  const token = String(req.body?.token ?? '');
  if (!isAuthorizedToken(token)) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  res.cookie(config.auth.cookieName, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
  res.json({ ok: true });
}


export function logoutRoute(req: express.Request, res: express.Response): void {
  res.clearCookie(config.auth.cookieName, {
    sameSite: 'strict',
    secure: req.secure,
    path: '/'
  });
  res.json({ ok: true });
}
