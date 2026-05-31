# src/web navigation card

This directory is the React/Vite browser workspace for Codex-Platform.
Read this card before changing UI state, API calls, token handling, event stream behavior, release panels, or workspace supervision surfaces.
Key files: `App.tsx`, `lib/api.ts`, `lib/reducer.ts`, `lib/normalize.ts`, `components/`, `styles.css`.

## Local invariants

- The UI communicates only with Codex-Platform HTTP/WebSocket endpoints; it must not call `codex app-server` directly.
- `lib/api.ts` intentionally avoids putting the Codex-Platform token in the WebSocket URL. Keep event streams same-origin and cookie/header based.
- Request/response/event shapes come from `src/shared/types.ts`; update shared types and backend emitters when changing UI contracts.
- `lib/normalize.ts` is the compatibility boundary for server/runtime shape variance. Keep normalization explicit instead of spreading ad hoc guards across components.
- The first screen is the command-center workspace, not a marketing landing page.

## Local rules

- Keep UI controls connected to real server capabilities or clearly demo-mode data; do not add decorative controls with no behavior.
- Preserve release and deployment evidence surfaces that compare GitHub, HFS, runtime build SHA, and smoke status.
- Keep Vite/browser code free of Node-only APIs.
- Do not store additional sensitive values in `localStorage` unless there is a documented server-side reason and a cleanup path.

## Do not

- Do not include tokens in links, browser-visible query strings, copied release notes, or WebSocket URLs.
- Do not weaken auth error handling that clears rejected saved tokens.
- Do not introduce a separate client-side source of truth for project roots, approvals, Git status, or runtime health.

## Validation

- `npm run check` - TypeScript contract check; requires installed dependencies.
- `npm run build:web` - Vite build; requires installed dependencies.
- `scripts/static-check.sh` - lightweight repo checks when dependency installation is out of scope.
