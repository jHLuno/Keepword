# Task 11 Report — Timezone-aware daily digests

## Delivered

- Added `createDigestJob(...)`, which returns `runDigestJob(now)` for per-chat daily processing after each chat's configured local digest time.
- Personal summaries are calculated from the recipient's commitments only. They include completed today, open, overdue, due tomorrow, and attention items.
- Administrator summaries include team totals and only task-level risk titles for overdue or no-deadline commitments; they never include notification connection or delivery state.
- Private delivery requires both an active private chat and enabled notifications. The job never sends a personal or admin digest to an un-onboarded user.
- Digest delivery uses `digest:<chatId>:<userId>:<localDate>:<kind>` idempotency keys. A sent digest is not emitted again for the same recipient, chat-local date, and kind; failed delivery can retry safely.
- The worker now creates the digest job and runs it at startup and once per minute, with an in-process overlap guard.
- Added safe `daily_digest_sent` and `daily_digest_failed` lifecycle logs without commitment text, private message content, or delivery state.

## Changed files

- `src/jobs/digests.ts`
- `src/services/send-digest.ts`
- `src/worker.ts`
- `src/telegram/messages.ts`
- `src/repositories/deliveries.ts`
- `tests/integration/digests.test.ts`

## TDD evidence

1. Red:

   ```text
   pnpm vitest run tests/integration/digests.test.ts
   ```

   Failed as intended because `src/jobs/digests.ts` did not exist.

2. Green focused suite:

   ```text
   pnpm vitest run tests/integration/digests.test.ts
   ```

   Passed 3/3 tests covering recipient-only personal content, IANA timezone/local-time selection with repeat idempotency, and private admin risk summaries.

3. Counter regression:

   The added job-result assertion first failed with `expected 0 to be 2`, exposing that delivery counts were being written to a temporary object expression. The job now mutates a single local counter object; the focused suite passes.

## Final verification

- `pnpm lint` — passed
- `pnpm typecheck` — passed
- `pnpm test` — passed: 22 files, 96 tests
- `pnpm build` — passed
- `git diff --check` — passed

## Safety notes

- Personal item filtering is by server-side assignee user ID within the chat scope.
- Admin digests contain aggregate counts and task titles only; no user notification, connection, or delivery metadata is rendered.
- Telegram messages are sent only after a durable delivery claim; a successfully marked delivery is not re-sent for the same local day.
