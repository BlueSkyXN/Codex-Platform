import crypto from 'node:crypto';
import type express from 'express';

// Unified response envelope shared by the public /v1 API. See
// local/refactor-2026/03-API-对外与内部.md §1.1.

export type PageMeta = {
  cursor: string | null;
  limit: number;
  total?: number;
};

export type ResponseMeta = {
  requestId: string;
  ts: number;
  page?: PageMeta;
};

export type OkEnvelope<T> = { ok: true; data: T; meta: ResponseMeta };
export type ErrEnvelope = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  meta: ResponseMeta;
};

export function newRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

function baseMeta(): ResponseMeta {
  return { requestId: newRequestId(), ts: Date.now() };
}

export function sendOk<T>(res: express.Response, data: T, page?: PageMeta): void {
  const meta = baseMeta();
  if (page) meta.page = page;
  const body: OkEnvelope<T> = { ok: true, data, meta };
  res.json(body);
}

export function sendErr(
  res: express.Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
): void {
  const body: ErrEnvelope = { ok: false, error: { code, message, details }, meta: baseMeta() };
  res.status(status).json(body);
}

// Stable error codes used across the public API.
export const ErrorCodes = {
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  invalidApiKey: 'invalid_api_key',
  scopeInsufficient: 'scope_insufficient',
  rateLimited: 'rate_limited',
  quotaExceeded: 'quota_exceeded',
  notFound: 'not_found',
  projectNotFound: 'project_not_found',
  pathOutsideWorkspace: 'path_outside_workspace',
  threadBusy: 'thread_busy',
  bridgeUnavailable: 'bridge_unavailable',
  validationFailed: 'validation_failed',
  idempotencyConflict: 'idempotency_conflict',
  publicApiDisabled: 'public_api_disabled',
  internal: 'internal_error'
} as const;
