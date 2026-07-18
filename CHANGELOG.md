[Earlier entries](docs/archive/CHANGELOG-pre-S04.md)

## 2026-07-19 — Telegram dispatch diagnostic logging

### Fixed
- Telegram webhook dispatch failures now log a safe upstream error code without logging private message content or secrets.

### Verified
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 26 test files and 117 tests passed.

## 2026-07-19 — Worker diagnostic logging

### Fixed
- Worker job failures now log a safe upstream error code such as a PostgreSQL code, without recording error messages, secrets, or message content.

### Verified
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 26 test files and 116 tests passed.

## 2026-07-19 — Railway migration runtime

### Fixed
- Included Drizzle migration tooling, configuration, schema, and migration SQL in the production image.

### Verified
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
