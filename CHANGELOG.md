[Earlier entries](docs/archive/CHANGELOG-pre-S04.md)

## 2026-07-19 — Source-frame diagnostics

### Fixed
- Unknown production failures now identify their first Keepword source frame without exposing exception text or private content.

### Verified
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 26 test files and 120 tests passed.

## 2026-07-19 — Internal error diagnostics

### Fixed
- Known internal failures now emit safe static diagnostic codes without writing exception text, chat content, or secrets to production logs.

### Verified
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 26 test files and 119 tests passed.
