# Task 12 Report — Chat settings, modes, and scoped data deletion

## Delivered

- Added the admin-authorized chat modes `suggest`, `manual`, and `silent_digest`; `auto_capture` is rejected with `INVALID_CHAT_MODE`.
- Manual mode ignores ordinary group traffic while `/keep` explicitly analyzes the replied source message.
- Silent Digest retains eligible candidates without a public reply and adds their titles to the private administrator digest review section.
- Added group administration commands: `/settings suggest|manual|silent_digest` and `/privacy delete`.
- Added `deleteChatData({ workspaceId, chatId, requestedByTelegramUserId })`, which verifies current Telegram admin authority, atomically removes all scoped content/deliveries/tokens/memberships, and deactivates the chat record.

## TDD evidence

1. Red: `pnpm vitest run tests/integration/privacy.test.ts tests/integration/chat-modes.test.ts` failed because the requested settings and deletion service modules did not exist.
2. Green: the same focused suite passed after the minimal services and mode gates were added.
3. Red: a group command test observed `/settings manual` leaving the chat in `suggest` mode.
4. Green: the handler now resolves the active chat, delegates to the current-admin-authorized service, and passes the command test.

## Verification

- `pnpm vitest run tests/integration/privacy.test.ts tests/integration/chat-modes.test.ts` — passed (6 tests)
- `pnpm typecheck` — passed
- `pnpm lint` — passed
- `pnpm test` — passed (24 files, 107 tests)
- `git diff --check` — passed

## Safety notes

- Authorization always calls the live Telegram admin checker; an old database membership alone cannot change a mode or delete data.
- Deletion preserves only an inactive chat marker for operational routing and removes scoped messages, suggestions, commitments, source links, deliveries, memberships, manual-capture markers, and onboarding tokens. Dependent callback and edit/reschedule rows are removed by existing foreign-key cascades.

## Blocker follow-up

- Silent Digest now suppresses medium-confidence follow-up clarification replies as well as high-confidence public suggestion cards.
- The administrator review query now joins the chat scope and returns pending candidates only when that chat is currently in `silent_digest` mode; ordinary `suggest` chat candidates stay out of the review section.
- Deletion now starts its transaction with a conditional `is_active = true → false` update. PostgreSQL takes the row lock for that update before any scoped deletes, preventing a parallel deletion from continuing and making subsequent active-chat analysis fail closed.

### Follow-up verification

- Targeted privacy/mode tests — passed (9 tests)
- `pnpm typecheck` — passed
- `pnpm lint` — passed
- `pnpm test` — passed (24 files, 110 tests)
