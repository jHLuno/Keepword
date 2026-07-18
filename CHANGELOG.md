[Earlier entries](docs/archive/CHANGELOG-pre-S04.md) · [2026-07-19 archive](docs/archive/CHANGELOG-2026-07-19-pre-filter.md)

## 2026-07-19 — Railway lockfile configuration fix

### Fixed
- Copied `pnpm-workspace.yaml` into both Docker build stages before frozen dependency installation, so Railway receives the same pnpm override configuration that produced `pnpm-lock.yaml`.

### Verified
- `pnpm install --frozen-lockfile --prod` — passed locally with the production dependency graph.

## 2026-07-19 — Selective AI filter and dependency security

### Changed
- Restored a local commitment prefilter before OpenRouter extraction. It recognises broad Russian and English task actions, assignments, obligation cues, and deadlines without sending ordinary chat messages to the LLM.
- Added the safe `message_skipped_by_pre_filter` event, containing only identifiers.
- Updated `drizzle-orm` to `0.45.2`, `drizzle-kit` to `0.31.10`, and pinned Drizzle Kit's transitive `esbuild` to `0.28.1`.

### Verified
- `pnpm vitest run tests/unit/prefilter.test.ts tests/integration/suggestions.test.ts` — 17 tests passed after expected RED failures.
- `pnpm audit --prod --audit-level=moderate` — no known vulnerabilities.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 27 test files and 132 tests passed.

## 2026-07-19 — Private /check onboarding scope

### Fixed
- `/check` now returns commitments only from chats where the requesting user completed notification onboarding, while retaining the personal-chat guard.
- Users without completed onboarding receive the existing connection guidance instead of an empty summary.

### Verified
- `pnpm vitest run tests/integration/commands.test.ts` — 10 tests passed after two expected RED failures.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 27 test files and 125 tests passed.
