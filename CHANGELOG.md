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
