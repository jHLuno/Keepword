[Earlier entries](docs/archive/CHANGELOG-pre-S04.md)

## 2026-07-19 — HTTP diagnostic logging

### Fixed
- Safe production error-code logging now recognizes Telegram/OpenRouter HTTP statuses without recording upstream descriptions or message content.

### Verified
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 26 test files and 118 tests passed.

## 2026-07-19 — Telegram dispatch diagnostic logging

### Fixed
- Telegram webhook dispatch failures now log a safe upstream error code without logging private message content or secrets.

### Verified
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 26 test files and 117 tests passed.
