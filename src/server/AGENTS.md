# src/server navigation card

Privileged Node/Express control plane for Codex-Platform.
Read before changing backend routes, config, auth, workspace boundaries, Git APIs, persistence, or the `codex app-server` bridge.
Key files: `index.ts`, `config.ts`, `security/`, `workspace/`, `codex/`, `store/PersistentStore.ts`.

## Local invariants

- The browser never talks to `codex app-server` directly; the backend owns auth, path policy, event normalization, persistence, and WebSocket fanout.
- Real Codex mode on Hugging Face must require `CODEX_PLATFORM_AUTH_TOKEN`; unauthenticated access is only for existing demo/loopback cases.
- Project roots must stay inside `WORKSPACE_ROOTS`. Preserve `assertDirectoryInsideAllowedRoots`, `resolveProjectPath`, and rejection of absolute or traversal paths.
- Git operations must keep literal relative-path handling and must reject absolute paths and `..` path segments.
- `RealCodexBridge` must preserve approval policy, sandbox policy, cwd scoping, skill input, and normalized approval events.
- Persistence and diagnostics must keep token/secret/password/authorization/API-key/cookie redaction.

## Local rules

- Treat `security/`, `workspace/`, Git actions, auth cookies/headers, and WebSocket upgrade auth as security-sensitive.
- When adding API fields, update `src/shared/types.ts` and `src/web/` consumers in the same change.
- Keep legacy `CODEX_WEB_*` aliases only where compatibility already exists; new public env keys should use `CODEX_PLATFORM_*`.

## Do not

- Do not bypass `requireAuth` for state-changing or sensitive routes.
- Do not expose tokens in query strings, logs, snapshots, or WebSocket URLs.
- Do not spawn commands outside the configured project/workspace boundary.

## Validation

- `npm run check` - TypeScript contract check; requires installed dependencies.
- `npm run build:server` - backend/shared build; requires installed dependencies.
- `scripts/static-check.sh` - lightweight fallback when dependency installation is out of scope.
