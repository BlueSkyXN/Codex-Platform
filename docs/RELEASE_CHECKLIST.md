# Release Checklist

- [ ] `npm run check` passes in GitHub Actions.
- [ ] `npm run build` passes in GitHub Actions.
- [ ] `scripts/static-check.sh` and `scripts/validate-hfs-contract.sh` pass in GitHub Actions.
- [ ] `cloud/hfs/export_space_bundle.sh` produces a bundle whose `BUILD_SOURCE.txt` commit matches the GitHub commit being deployed.
- [ ] HF Space repo receives the exported bundle.
- [ ] HF Space build reaches a running state.
- [ ] Live smoke passes against `https://blueskyxn-codex-platform-hfs.hf.space/healthz`, `/api/config`, `/`, and `/api/state`.
- [ ] `/healthz` build SHA, `BUILD_SOURCE.txt`, HF repo SHA, and HF runtime SHA are consistent for the deployed revision.
- [ ] Real-mode deployments have `CODEX_PLATFORM_AUTH_TOKEN` set as a Secret and are Private or Protected.
- [ ] `.env.local` remains untracked and contains only local ledger values.
