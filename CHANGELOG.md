[Earlier entries](docs/archive/CHANGELOG-pre-S04.md) · [2026-07-19 archive](docs/archive/CHANGELOG-2026-07-19-pre-filter.md) · [Trust Memory archive](docs/archive/CHANGELOG-2026-07-19-pre-trust-memory.md)

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

## 2026-07-19 — Trust Memory product definition

### Changed
- Updated `PROJECT.md` with the approved next production release: actionable cross-chat `/check`, immutable agreement/decision memory, team-local calibration, and private group-scoped reliability.
- Added the implementation plan and explicit privacy boundaries: no cross-chat or cross-team admin visibility.

### Verified
- Documentation self-review and `git diff --check` passed.

## 2026-07-19 — Railway lockfile configuration fix

### Fixed
- Copied `pnpm-workspace.yaml` into both Docker build stages before frozen dependency installation, so Railway receives the same pnpm override configuration that produced `pnpm-lock.yaml`.

### Verified
- `pnpm install --frozen-lockfile --prod` — passed locally with the production dependency graph.
