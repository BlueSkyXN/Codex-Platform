# src/shared navigation card

This directory contains TypeScript wire contracts shared by the backend and browser.
Read this card before changing API DTOs, UI event payloads, thread/project/agent/skill shapes, Git summaries, or runtime health types.
Key file: `types.ts`.

## Local invariants

- Types here must stay serializable across HTTP and WebSocket boundaries.
- Shared fields are a contract between `src/server/` producers and `src/web/` consumers; update both sides with any shape change.
- Prefer additive optional fields for compatibility unless a breaking change is explicitly scoped.
- Keep naming stable for browser state, persisted snapshots, and release evidence surfaces.

## Local rules

- Do not import server-only Node modules or browser-only implementation code from this directory.
- Keep compatibility aliases documented at the producer/consumer boundary, not hidden in unrelated components.
- When changing a discriminated union, update all normalizers, reducers, and event emitters that switch on it.

## Validation

- `npm run check` - verifies shared types with the whole TypeScript project; requires installed dependencies.
- `scripts/static-check.sh` - lightweight fallback when dependency installation is out of scope.
