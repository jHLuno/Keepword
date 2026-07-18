[Earlier entries](docs/archive/CHANGELOG-pre-S04.md) · [2026-07-19 archive](docs/archive/CHANGELOG-2026-07-19-pre-filter.md) · [Trust Memory archive](docs/archive/CHANGELOG-2026-07-19-pre-trust-memory.md)

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
