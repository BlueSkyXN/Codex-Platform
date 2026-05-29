# Development

Normal development uses Node 20+:

```bash
npm install
npm run check
npm run build
```

This repository's HFS work should keep dependency installs, Docker builds, and complex tests in GitHub Actions or HF. Local validation for small edits should stay lightweight:

```bash
bash -n scripts/hf-entrypoint.sh scripts/hf-healthcheck.sh scripts/hf-space-smoke.sh cloud/hfs/export_space_bundle.sh
bash cloud/hfs/export_space_bundle.sh /tmp/codex-platform-hfs-space
```

Demo backend:

```bash
DEMO_MODE=true npm run dev:server
```

Frontend dev server:

```bash
npm run dev:web
```

The production frontend is served by the Node backend from `dist/web`.
