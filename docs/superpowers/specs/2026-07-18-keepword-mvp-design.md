# Keepword MVP Engineering Design

**Status:** Approved design

## Goal

Deliver the complete Telegram-first MVP defined in `PROJECT.md`: detect
high-confidence commitments in new group messages, require confirmation,
and deliver private reminders and digests without exposing private task state
in group chats.

## Architecture

Keepword is a single TypeScript service deployed on Railway. Fastify exposes
the Telegram webhook and health endpoints; grammY validates and routes
Telegram updates. Application services contain business rules and communicate
with PostgreSQL through Drizzle. A worker mode runs scheduled reminder and
digest processing from the same codebase.

```text
Telegram webhook → Fastify → grammY update router → application services → PostgreSQL
                                           │
                                           └→ OpenAI structured extraction

Scheduled worker → reminder/digest services → PostgreSQL → Telegram Bot API
```

Modules are isolated by responsibility:

- `telegram`: update routing, message rendering, callback parsing, and bot API
  adapters; no business rules beyond translating Telegram input/output.
- `commitments`: candidate extraction orchestration, suggestion lifecycle,
  authorization, duplicate detection, and status changes.
- `onboarding`: expiring, single-use chat-scoped invite tokens and private-chat
  notification activation.
- `notifications`: reminders, participant digests, admin digests, delivery
  idempotency, and safe retry classification.
- `ai`: pre-filtering, short-context construction, OpenAI structured-output
  calls, and validation/mapping of the extraction result.
- `persistence`: Drizzle schema, migrations, repositories, and transaction
  boundaries.
- `observability`: structured JSON logging with safe identifiers and error
  codes; no secrets or full private message text.

## Technology Decisions

- Node.js and TypeScript in strict mode.
- Fastify for HTTP/webhook endpoints.
- grammY for Telegram updates, inline keyboards, and bot API calls.
- PostgreSQL with Drizzle ORM and versioned SQL migrations.
- OpenAI structured outputs for commitment extraction; AI output is parsed
  against a server-owned schema before use.
- Railway web service plus worker service and PostgreSQL. Railway invokes the
  worker on a short interval; all jobs are idempotent so retries are safe.
- Vitest for unit and integration tests.

## Persistence Model

All tenant-owned records carry `workspace_id`; chat-scoped records also carry
`chat_id`. Repository methods require the scope IDs rather than accepting
unbounded identifiers.

| Entity | Purpose | Key constraints |
|---|---|---|
| `workspaces` | Team boundary | one active owner/chat relationship at creation |
| `chats` | Telegram group settings | unique Telegram chat ID; mode, timezone, digest time, active/deleted state |
| `users` | Telegram identity | unique Telegram user ID; minimal public profile fields |
| `chat_memberships` | User membership and notification status per chat | unique `(chat_id, user_id)`; current admin flag refreshed from Telegram |
| `source_messages` | Minimal source and short context | unique `(chat_id, telegram_message_id)`; only new messages after connection |
| `commitment_suggestions` | Unconfirmed AI/manual proposal | unique source/action guard; expires or is confirmed/rejected/cancelled |
| `commitments` | Confirmed obligation | assignee, due time/text, lifecycle status, confirmer, source links |
| `commitment_sources` | Many-to-many source chain | unique `(commitment_id, source_message_id)` |
| `onboarding_tokens` | Private-notification invitation | token hash only; chat-scoped, expiry, single-use semantics |
| `notification_deliveries` | Reminder/digest idempotency | unique idempotency key, attempted/sent/failed state |
| `processed_updates` | Telegram update deduplication | unique Telegram update ID |

The service stores message text only for the minimal extraction/source purpose.
Chat deletion removes or anonymizes related messages, context, commitments,
reminders, and onboarding tokens according to the MVP deletion flow.

## Core Flows

### Group candidate to confirmed commitment

1. Receive and validate a Telegram update; atomically record its update ID.
2. Require an active connected group chat and a new message.
3. Persist the minimal source message and evaluate the cheap local pre-filter.
4. For a candidate, select the bounded recent context from the same chat.
5. Ask OpenAI for a schema-validated extraction result.
6. Reject low confidence, missing required facts, or duplicate candidates.
7. Create an unconfirmed suggestion and reply publicly with confirm, edit, and
   reject actions.
8. On a callback, re-check chat membership and authorization. Only the source
   author or an active Telegram administrator may confirm or edit.
9. In one transaction, convert the suggestion into a commitment and link its
   source messages. Reply with confirmation and create any required
   notification/invite hint.

Medium-confidence follow-ups may produce a concise explicit prompt. They do
not create a commitment until confirmation. Low-confidence messages produce no
group output.

### Private onboarding and manual capture

The group onboarding card contains a deep link with an opaque token. `/start
join_<token>` is handled only in a private chat. The service hashes and checks
the token, chat binding, expiry, and unused state in a transaction before
activating that user's notifications for that chat. Telegram chat IDs never
appear in public URLs.

Forwarded/private messages take the same extraction and confirmation path but
scope the assignee to the sender by default. They support the documented
fallback without requiring group access.

### Reminders and digests

A scheduled worker selects due commitments and produces reminder or digest
delivery candidates. An idempotency record is claimed before a Telegram send;
duplicate workers or retries cannot send the same delivery twice. Personal
digests contain only the recipient's commitments. Admin digests contain only
aggregate risks and are sent to eligible, onboarded administrators. Private
overdue status is never posted in a group.

## Security and Privacy Rules

- Validate Telegram update shape, deep-link payloads, callback payloads, and
  AI output at the boundary.
- Check the current Telegram administrator status before privileged actions;
  do not trust stale callback data or client-supplied IDs.
- Every read/write is limited by workspace and chat. A user cannot access a
  commitment outside their chat membership.
- Use signed/opaque callback data that references server records; it cannot
  encode authority or raw chat IDs.
- Configure all tokens and API keys only as environment variables. Never log
  them or full private message content.
- Use transactional state changes and unique database constraints to make
  webhook retries and scheduled execution safe.

## Errors and Observability

User-visible errors are short and actionable. Internal errors have stable
codes: invalid update/payload, unauthorized action, expired/used invite,
duplicate candidate, extraction failure, and notification delivery failure.

Logs use event names such as `telegram_update_received`,
`message_candidate_detected`, `llm_commitment_extraction_completed`,
`commitment_confirmed`, `onboarding_completed`, `reminder_sent`, and
`daily_digest_sent`. Metadata is limited to safe IDs, durations, result, and
error code. Message content is neither logged nor included in error reports.

## Verification Strategy

Unit tests cover pre-filtering, extraction mapping, duplicate matching,
authorization, callback/token validation, due-date behavior, and idempotency.
Integration tests exercise webhook-to-suggestion, author/admin confirmation,
unauthorized rejection, onboarding token cases, manual forwarding, reminder
privacy, and both digest audiences using fake Telegram/OpenAI adapters.

The release gate is `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
`pnpm build`, followed by a staging webhook smoke test with a non-production
bot token.

## Scope Boundaries

This design implements exactly the MVP in `PROJECT.md`. It does not add a web
dashboard, external task-manager integrations, historical group-message
analysis, media/file analysis, billing, or auto-capture without confirmation.
