## 2026-07-18 — MVP release readiness

### Added
- End-to-end MVP regression covering group connection, private onboarding, high-confidence suggestion and author confirmation, private reminders, rescheduling, blocker/completion actions, personal/admin digests, and scoped chat deletion.
- Operator-facing release checklist for backups, migrations, Railway configuration, Telegram webhook registration, worker operation, monitoring, rollback, and staging validation.

### Changed
- Linked the Railway deployment guide to the release checklist.

### Verified
- `pnpm vitest run tests/integration/mvp-flow.test.ts`
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 26 test files and 115 tests passed.

### Notes
- `PROJECT.md` remains accurate; no MVP behavior changed.
- The staging webhook smoke test requires an operator-provided non-production bot, database, and secrets, so it was documented but not executed from this workspace.

## 2026-07-18 — Railway deployment and job runner

### Added
- Protected `POST /internal/run-jobs` endpoint for idempotent reminder and digest execution.
- Shared job runner, standalone worker launcher, Dockerfile, and Railway web-service configuration.
- Railway deployment and staging smoke-test instructions.

### Changed
- The worker now runs both reminder and digest jobs.

### Verified
- `pnpm vitest run tests/integration/worker-auth.test.ts && pnpm build`
- `pnpm lint`
- `pnpm test`

### Notes
- Railway worker is a second service from the same image, configured with `node dist/scripts/run-worker.js`.
