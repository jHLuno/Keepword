[Earlier entries](docs/archive/CHANGELOG-pre-S04.md) · [2026-07-19 archive](docs/archive/CHANGELOG-2026-07-19-pre-filter.md) · [Trust Memory archive](docs/archive/CHANGELOG-2026-07-19-pre-trust-memory.md)

## 2026-07-19 — Immutable suggestion memory

### Added
- Added append-only `suggestion_events` memory for `suggested`, `edited`, `confirmed`, and `rejected` decisions, each scoped to its workspace and chat with an actor and immutable JSON snapshot.
- Added migration `0010_suggestion_events` with scoped foreign keys and indexes.

### Changed
- Suggestion creation, editing, confirmation, and rejection now write their event in the same database transaction as the state change.
- Chat privacy deletion explicitly removes suggestion events before deleting suggestion data.

### Verified
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` passed locally (28 test files, 138 tests).

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
