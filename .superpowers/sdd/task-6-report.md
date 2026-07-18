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

No database migration was needed: the scoped `source_messages`, `commitment_suggestions`, and `commitments` schema already existed. Confirmation, editing, rejection, and callback resolution remain deliberately out of scope for Task 7.
