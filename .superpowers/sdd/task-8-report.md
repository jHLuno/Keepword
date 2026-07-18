# Task 8 — Private notification onboarding

## Implemented

- Added `src/services/onboarding.ts` with opaque, 32-byte base64url tokens; only SHA-256 hashes are persisted.
- Token redemption is transactional and requires a matching hash, unexpired and unused token, and an active bound chat. It atomically consumes the token and enables the chat membership's notifications.
- Added private `/start join_<token>` handling. Invalid or missing tokens stay helpful and do not create chat membership access.
- Added `/invite` and `/notifications` group commands, both guarded by a current Telegram administrator check.
- Added per-membership `last_notification_invite_at` throttling (24 hours), applied when Keepword assigns an unconnected user.
- Added onboarding delivery and invitation messaging to the Telegram adapter and fake test adapter.

## Database

- Added migration `0007_private_notification_onboarding.sql` for `chat_memberships.last_notification_invite_at`.

## Verification

- `pnpm vitest run tests/integration/onboarding.test.ts` — passed (8 tests)
- `pnpm typecheck` — passed
- `pnpm lint` — passed
- `pnpm test` — passed (72 tests across 18 files)

## Logs

- `onboarding_completed` is recorded for successful and rejected private onboarding attempts without logging tokens or message contents.
