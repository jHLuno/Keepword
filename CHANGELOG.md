[Earlier entries](docs/archive/CHANGELOG-pre-S04.md) · [2026-07-19 archive](docs/archive/CHANGELOG-2026-07-19-pre-filter.md) · [Trust Memory archive](docs/archive/CHANGELOG-2026-07-19-pre-trust-memory.md) · [Pre-calibration archive](docs/archive/CHANGELOG-2026-07-19-pre-calibration.md) · [Trust Memory implementation archive](docs/archive/CHANGELOG-2026-07-19-trust-memory-implementation.md)

## 2026-07-19 — Trust Memory release verification

### Changed
- Updated `PROJECT.md` to describe the implemented action-first private `/check`, immutable suggestion decision history, observation-only chat calibration, and scoped reliability metrics.
- Expanded the Railway release checklist with the three migrations in this release, forward-only rollback guidance, and staging checks for callback ownership, current-admin isolation, and privacy deletion cascade.
- Corrected the callback guarantee: only `check_page` navigation callbacks are actor-bound; lifecycle callbacks remain server-authorized for the commitment assignee or a current admin of its original source chat.

### Verified
- `pnpm install --frozen-lockfile` — passed.
- `pnpm typecheck` — passed.
- `pnpm test` — passed: 28 files, 147 tests. The integration suite applies the complete local Drizzle migration folder to PGlite.
- `pnpm build` — passed.
- `pnpm audit --prod --audit-level=moderate` — passed: no known vulnerabilities.
- Repository-wide `pnpm lint` fails only because pre-existing, untracked `landing/dist/assets/index-CFentx7P.js` is outside the TypeScript project. `git ls-files -z -- '*.ts' '*.mts' '*.cts' | xargs -0 pnpm exec eslint` — passed for all tracked TypeScript files.

### Notes
- No discoverable staging database configuration or Railway authority was available locally, so `pnpm db:migrate` was not run against any external database and Telegram/Railway smoke tests were not claimed as complete. The required operator steps are in `docs/release-checklist.md`.

## 2026-07-19 — Chat-scoped reliability memory

### Added
- Added a rolling 30-day reliability aggregate: on-time, late, and currently overdue commitments with an exact deadline.
- Added a private source-chat admin digest section after at least three eligible commitments per person, plus the caller's own connected cross-chat summary in `/check`.

### Changed
- Cancelled commitments, commitments without a deadline, future deadlines, and completed commitments without a recorded completion time are excluded rather than guessed.
- Reliability queries preserve the exact `workspace_id` and `chat_id` source boundary; private `/check` can aggregate only the caller's own connected chats.

### Verified
- `pnpm vitest run tests/integration/digests.test.ts tests/integration/commands.test.ts` — 23 tests passed.
- `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.

### Notes
- Railway/staging migration and live Telegram smoke verification remain task 5; this feature needs no schema migration.
