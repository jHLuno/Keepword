[Earlier entries](docs/archive/CHANGELOG-pre-S04.md)

## 2026-07-19 — Acknowledge Telegram webhooks before AI work

### Fixed
- Webhook responses now return immediately while update processing, including LLM extraction, continues in the background.
- Prevented Telegram from cancelling 60-second requests and repeatedly delivering the same update.

### Verified
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 27 test files and 122 tests passed.

## 2026-07-19 — Initialize grammY webhook bot

### Fixed
- Initialized grammY once before calling `handleUpdate`, fixing production failures for every incoming webhook update.

### Verified
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 27 test files and 122 tests passed.

## 2026-07-19 — grammY error unwrapping

### Fixed
- Production error diagnostics now inspect grammY's wrapped `error` and `cause` values while preserving safe log redaction.

### Verified
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 26 test files and 121 tests passed.
