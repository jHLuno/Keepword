## 2026-07-19 — grammY error unwrapping

### Fixed
- Production error diagnostics now inspect grammY's wrapped `error` and `cause` values while preserving safe log redaction.

### Verified
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 26 test files and 121 tests passed.

## 2026-07-19 — Private /check command

### Added
- Private `/check` summary of the caller's active overdue, open, and blocked commitments across active connected groups.
- Chat labels, fixed status sections, and an empty state without exposing teammate, completed, cancelled, or inactive-chat commitments.

### Verified
- `pnpm vitest run tests/integration/commands.test.ts` — 9 tests passed.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 27 test files and 124 tests passed.
