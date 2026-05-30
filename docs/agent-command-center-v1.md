# Codex-Platform Agent Command Center v1

## Goal

Codex-Platform should become a self-branded, OpenAI Codex-style agent command center. The primary object is a project thread where the user can launch work, provide context, supervise agent execution, approve risky actions, review changed files, commit safe work, inspect artifacts, manage Skills and Agents, and verify GitHub plus Hugging Face deployments.

The product should feel quiet, dense, trustworthy, review-first, and deployable. It should not feel like a generic chat UI, developer demo console, marketing page, or official OpenAI product.

## Product Principles

- Thread-first: the main workspace is the selected agent thread.
- Review-first: the right panel serves review, diff, files, git, terminal, artifacts, and raw debug for the current thread.
- Approval-first: risky commands and state changes must have approval, status, and result history.
- Context-first: the composer should attach explicit context instead of relying only on long prompts.
- Registry-first: Skills and Agents should be diagnosable, manageable, and callable capabilities.
- Deployment-safe: GitHub and Hugging Face Space release paths must remain clean, repeatable, and verifiable.

## Information Architecture

- Left sidebar: brand, new thread, Skills, Agents, project/thread search, projects, threads, Settings.
- Center workspace: thread header, approval rail, timeline, composer.
- Right review panel: Review, Plan, Diff, Files, Git, Terminal, Artifacts, Raw.
- Management drawer: Skills registry, Agents registry, Runtime settings.
- Activity drawer: approvals, running threads, recent events, errors.

## Completion Standard

- The active project, selected thread, and agent execution state are visible without opening raw logs.
- Risky actions have clear approval, status, and result review paths.
- File changes can be reviewed through changed files and diff views, then staged and committed when Git actions are enabled.
- Composer context can include files, folders, current diff, git status, terminal output, Skills, and Agents.
- Artifacts, Browser previews, Terminal output, and Raw events have clear locations and do not dominate the main timeline.
- Skills and Agents expose name, description, scope, source path, runtime configuration, availability, and diagnostics.
- GitHub and Hugging Face Space deployment verification can prove the deployed build matches the GitHub commit.

## Non-goals For v1

- No marketing landing page.
- No OpenAI logo, official-brand copy, or pixel-level trade dress cloning.
- No broad rewrite of the repository layout.
- No `local/` source deployment or HFS bundle expansion beyond `cloud/hfs/export_space_bundle.sh`.
- No full multi-tenant SaaS, RBAC, secret vault, or background job system unless separately scoped.

## Delivery Phases

1. Product structure convergence: self-branding, reduced disabled chrome, thread-only review panel, separate management drawer.
2. Visual system convergence: consistent button, tab, pill, panel, card, empty, focus, and mobile behavior.
3. Review and Git loop: changed files, diff preview, file selection, stage, unstage, commit draft, commit.
4. Composer context picker: add file, folder, diff, git status, terminal output, Skill, Agent context chips.
5. Artifacts, Browser, Terminal surfaces: previews, generated files, dev-server preview, command history, raw debug.
6. Skills and Agents registry: scopes, paths, configuration, parse status, diagnostics, invocation hints.
7. Safety and release status: demo/real mode, auth, workspace roots, app-server status, HF target, GitHub commit, build SHA.
8. Verification and deployment: local checks, GitHub push, HFS bundle export, HF upload, live health and smoke verification.

## Validation Gates

Use lightweight local checks before release-oriented handoff:

```bash
npm run typecheck
npm run build:web
scripts/static-check.sh
bash -n scripts/hf-entrypoint.sh scripts/hf-healthcheck.sh scripts/hf-space-smoke.sh cloud/hfs/export_space_bundle.sh
bash cloud/hfs/export_space_bundle.sh /tmp/codex-platform-hfs-space
```
