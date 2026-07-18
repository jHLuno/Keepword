## 2026-07-19 — OpenRouter Gemini extraction

### Changed
- Replaced direct OpenAI extraction with OpenRouter Chat Completions using `google/gemini-2.5-flash-lite`.
- Replaced `OPENAI_API_KEY` with `OPENROUTER_API_KEY` in runtime and Railway documentation.

### Verified
- `pnpm vitest run tests/unit/config.test.ts tests/unit/extractor.test.ts`
- `pnpm typecheck`

### Notes
- Existing Zod validation and message-source provenance checks remain server-side.

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

## 2026-07-19 — Worker diagnostic logging

### Fixed
- Worker job failures now log a safe upstream error code such as a PostgreSQL code, without recording error messages, secrets, or message content.

### Verified
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 26 test files and 116 tests passed.

## 2026-07-19 — Railway migration runtime

### Fixed
- Included Drizzle migration tooling, configuration, schema, and migration SQL in the production image.

### Verified
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
