import { ALL_SCOPES } from './keys.js';

// Minimal hand-authored OpenAPI 3.1 document for the public API. Kept concise
// and valid; can be replaced by a type-driven generator later (roadmap P2.4).

export function buildOpenApiDocument(publicUrl?: string): Record<string, unknown> {
  const envelopeOk = {
    type: 'object',
    required: ['ok', 'data', 'meta'],
    properties: {
      ok: { type: 'boolean', enum: [true] },
      data: {},
      meta: { $ref: '#/components/schemas/Meta' }
    }
  };
  const envelopeErr = {
    type: 'object',
    required: ['ok', 'error', 'meta'],
    properties: {
      ok: { type: 'boolean', enum: [false] },
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          details: {}
        }
      },
      meta: { $ref: '#/components/schemas/Meta' }
    }
  };

  const okResponse = { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/OkEnvelope' } } } };
  const errResponse = { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrEnvelope' } } } };
  const standardResponses = { '200': okResponse, '401': errResponse, '403': errResponse, '404': errResponse, '429': errResponse };

  function op(summary: string, scope: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { summary, security: [{ ApiKeyAuth: [] }], 'x-required-scope': scope, responses: standardResponses, ...extra };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Codex-Platform Public API',
      version: '1.0.0',
      description:
        'Programmatic control of Codex-Platform: projects, threads, turns, approvals, git, review and capabilities. ' +
        'Authenticate with an API key (Authorization: Bearer <key>). Disabled by default; enable with CODEX_PLATFORM_PUBLIC_API_ENABLED=true.'
    },
    servers: [{ url: `${publicUrl ?? ''}/v1` }],
    tags: [
      { name: 'meta' }, { name: 'projects' }, { name: 'threads' },
      { name: 'approvals' }, { name: 'git' }, { name: 'capabilities' }
    ],
    paths: {
      '/whoami': { get: { summary: 'Echo the calling key scopes and project allowlist', security: [{ ApiKeyAuth: [] }], tags: ['meta'], responses: standardResponses } },
      '/projects': {
        get: { ...op('List projects', 'projects:read'), tags: ['projects'] },
        post: { ...op('Add a project', 'projects:write'), tags: ['projects'] }
      },
      '/projects/{id}': {
        get: { ...op('Get a project', 'projects:read'), tags: ['projects'] },
        delete: { ...op('Remove a project (registration only)', 'projects:write'), tags: ['projects'] }
      },
      '/projects/{id}/files': { get: { ...op('Browse the project file tree', 'projects:read'), tags: ['projects'] } },
      '/projects/{id}/files/content': { get: { ...op('Read a file', 'projects:read'), tags: ['projects'] } },
      '/projects/{id}/git': { get: { ...op('Git status', 'git:read'), tags: ['git'] } },
      '/projects/{id}/git/diff': { get: { ...op('Git diff', 'git:read'), tags: ['git'] } },
      '/projects/{id}/git/stage': { post: { ...op('Stage paths', 'git:write'), tags: ['git'] } },
      '/projects/{id}/git/unstage': { post: { ...op('Unstage paths', 'git:write'), tags: ['git'] } },
      '/projects/{id}/git/commit': { post: { ...op('Commit staged changes (idempotent)', 'git:write'), tags: ['git'] } },
      '/threads': {
        get: { ...op('List threads', 'threads:read'), tags: ['threads'] },
        post: { ...op('Create a thread (idempotent)', 'threads:write'), tags: ['threads'] }
      },
      '/threads/{id}': { get: { ...op('Get a thread with turns', 'threads:read'), tags: ['threads'] } },
      '/threads/{id}/turns': { post: { ...op('Start a turn (idempotent; supports SSE via Accept: text/event-stream)', 'threads:write'), tags: ['threads'] } },
      '/threads/{id}/interrupt': { post: { ...op('Interrupt the active turn', 'threads:write'), tags: ['threads'] } },
      '/threads/{id}/review': { post: { ...op('Start a review', 'review:read'), tags: ['threads'] } },
      '/threads/{id}/events': { get: { summary: 'Subscribe to thread events (SSE)', security: [{ ApiKeyAuth: [] }], 'x-required-scope': 'threads:read', tags: ['threads'], responses: { '200': { description: 'text/event-stream' }, '401': errResponse, '403': errResponse, '404': errResponse } } },
      '/approvals': { get: { ...op('List approvals', 'threads:read'), tags: ['approvals'] } },
      '/approvals/{requestId}': { post: { ...op('Resolve an approval', 'approvals:write'), tags: ['approvals'] } },
      '/skills': { get: { ...op('List skills', 'capabilities:read'), tags: ['capabilities'] } },
      '/agents': { get: { ...op('List custom agents', 'capabilities:read'), tags: ['capabilities'] } }
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: 'http', scheme: 'bearer', description: 'Public API key (cpk_live_...).' }
      },
      schemas: {
        Meta: {
          type: 'object',
          required: ['requestId', 'ts'],
          properties: {
            requestId: { type: 'string' },
            ts: { type: 'integer' },
            page: {
              type: 'object',
              properties: { cursor: { type: ['string', 'null'] }, limit: { type: 'integer' }, total: { type: 'integer' } }
            }
          }
        },
        OkEnvelope: envelopeOk,
        ErrEnvelope: envelopeErr
      }
    },
    'x-scopes': ALL_SCOPES
  };
}
