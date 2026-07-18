[Earlier entries](docs/archive/CHANGELOG-pre-S04.md) · [2026-07-19 archive](docs/archive/CHANGELOG-2026-07-19-pre-filter.md) · [Trust Memory archive](docs/archive/CHANGELOG-2026-07-19-pre-trust-memory.md) · [Pre-calibration archive](docs/archive/CHANGELOG-2026-07-19-pre-calibration.md)

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

## 2026-07-19 — Private chat-scoped calibration digest

### Added
- Added a 90-day calibration aggregate derived only from immutable `suggestion_events` for the exact active workspace/chat pair.
- After 30 resolved decisions, the private digest for a current admin shows confirmed-without-edits, confirmed-after-edits, and rejected counts with percentages.

### Changed
- The worker now verifies current Telegram administrator status before sending any admin digest, preventing a former admin with a stale database role from receiving group data.
- Personal digests and all group messages remain free of calibration data.

### Verified
- Focused digest, mode, and MVP suites: 15 tests passed.
- `pnpm typecheck`, `pnpm test` (28 files, 144 tests), and `pnpm build` passed.
- Targeted ESLint for changed source/tests and `git diff --check` passed.

### Notes
- Repository-wide `pnpm lint` remains blocked by the pre-existing untracked `landing/dist/assets/index-Cs9s6c9w.js` output, which was not changed.

## 2026-07-19 — Immutable suggestion memory

### Added
- Added append-only `suggestion_events` memory for `suggested`, `edited`, `confirmed`, and `rejected` decisions, each scoped to its workspace and chat with an actor and immutable JSON snapshot.
- Added migration `0010_suggestion_events` with scoped foreign keys and indexes.

### Changed
- Suggestion creation, editing, confirmation, and rejection now write their event in the same database transaction as the state change.
- Chat privacy deletion explicitly removes suggestion events before deleting suggestion data.
- Decision events retain the actor ID after that actor leaves a chat; deleting the source chat still removes its events.

### Fixed
- Added a forward-only migration that removes the actor-membership cascade from `suggestion_events`, preserving immutable decision memory after a membership is deleted.
- Added an integration assertion that the database rejects a suggestion event whose workspace/chat scope differs from its suggestion.

### Verified
- `pnpm vitest run tests/integration/suggestion-events.test.ts tests/integration/privacy.test.ts`, `pnpm typecheck`, targeted ESLint, `pnpm test` (28 files, 140 tests), and `pnpm build` passed locally.
- Repository-wide `pnpm lint` remains blocked by the pre-existing untracked `landing/dist` output, which is intentionally not part of this change.
