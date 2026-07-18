# Task 6 — suggestions, duplicate checks, and public cards

## Status

Implemented and verified.

## Delivered

- Candidate group messages are pre-filtered, scoped to an active `suggest` chat, persisted before LLM extraction, and supplied with bounded same-chat context.
- High-confidence candidates create only a pending suggestion, never a commitment. They require a non-empty action, a known in-chat assignee, and either a due date or an explicit due-date clarification.
- Duplicate detection compares normalized title, assignee, workspace, and chat against open commitments and pending suggestions. Re-delivery of the same source message reuses its pending suggestion so Telegram delivery can retry.
- Low-confidence candidates are silent. Medium-confidence follow-ups receive only: `Похоже, это договорённость. Кто отвечает и к какому сроку?`
- Public suggestion replies render the documented confirm/edit/reject labels with signed, opaque callback data; no commitment action handler was added (Task 7 remains responsible for that).
- Telegram group-message routing and the fake Telegram adapter now support suggestion cards and clarification replies.
- Added safe event logs: `message_candidate_detected`, `duplicate_commitment_detected`, and `commitment_suggestion_created`. They contain only IDs and result metadata, never message text or LLM content.

## TDD evidence

- Red: `pnpm vitest run tests/integration/suggestions.test.ts` failed because `src/services/analyze-message.ts` was absent.
- Green: the targeted suite passes with four tests, including fake-Telegram group routing.

## Verification

- `pnpm vitest run tests/integration/suggestions.test.ts` — passed (4 tests)
- `pnpm lint` — passed
- `pnpm typecheck` — passed
- `pnpm test` — passed (41 tests)
- `git diff --check` — passed

## Scope note

The original scoped `source_messages`, `commitment_suggestions`, and `commitments` schema supported the first vertical slice. Confirmation, editing, rejection, and callback action handling remain deliberately out of scope for Task 7.

## P1 follow-up — callback durability and atomic duplicates

- Added the required `CALLBACK_SIGNING_SECRET` configuration value and `.env.example` entry. Callback data is now `kw:<action>:<suggestion UUID>:<HMAC>`: the suggestion ID is resolvable by the server, its HMAC uses the supplied stable secret, and the longest confirm payload is exactly 64 bytes.
- Removed process-random callback signing. Cards are stable across restarts and multiple instances sharing the configured secret.
- High-confidence gating now treats whitespace-only `due_date_text` as absent; only a real due date, `due_at`, or explicit clarification permits a suggestion.
- Added migration `0003_atomic_suggestions` with `normalized_title` and a partial unique index over workspace, chat, assignee, and normalized title for pending suggestions. Inserts use `ON CONFLICT DO NOTHING` and resolve the winning row as a duplicate.
- Added regression tests for the signing secret, stable/resolvable Telegram callback data, blank deadlines, and concurrent normalized duplicate creation.

### P1 verification

- Red: callback data differed between equivalent cards; missing `CALLBACK_SIGNING_SECRET` was accepted; whitespace due text was suggested; two racing normalized suggestions both inserted.
- Green: `pnpm vitest run tests/unit/config.test.ts tests/unit/suggestion-messages.test.ts tests/integration/suggestions.test.ts` — passed (9 tests).
- Full verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (45 tests), `pnpm build`, and `git diff --check` — passed.
