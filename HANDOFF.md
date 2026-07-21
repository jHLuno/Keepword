[Earlier entries](docs/archive/HANDOFF-pre-S04.md) · [2026-07-19 archive](docs/archive/HANDOFF-2026-07-19-pre-filter.md) · [Trust Memory archive](docs/archive/HANDOFF-2026-07-19-pre-trust-memory.md) · [Pre-calibration archive](docs/archive/HANDOFF-2026-07-19-pre-calibration.md) · [Trust Memory implementation archive](docs/archive/HANDOFF-2026-07-19-trust-memory-implementation.md)

## 2026-07-21 — Group edit UX handoff

### Done
- Group suggestion editing is source-chat native. An authorised author or
  current source-chat admin must reply to the issued instruction; the server
  scopes the session to the exact actor, workspace, chat, suggestion and
  instruction message.
- The original card is disabled after an authorised action; edits publish a
  new confirmation card rather than silently creating a commitment.
- Added forward-only migration `0013_group_suggestion_edit_sessions`.

### Not done
- Task 3 (`/check` picker/detail UX) and Task 4 (settings-scope UX) remain.

### Risks / blockers
- This migration must be applied before the group-edit deployment. No automated
  checks were run in this pass at the operator's request.

### Next recommended step
- Continue with the `/check` picker/detail flow, then deploy web so Railway
  applies migration `0013` via the configured pre-deploy migration command.

## 2026-07-19 — Internationalization & delivery hardening handoff

### Done
- Added EN/RU/ES replies: extractor preserves the message language (fixes titles being
  translated to random languages) and returns `language`; all bot chrome is localized via
  `src/i18n` + the catalog in `src/telegram/messages.ts`. Language is stored on suggestions
  and commitments (migration `0012_multilingual_replies`).
- Added `/settings language|timezone|digest` for chat admins (with validation) on top of
  `/settings mode`.
- Added Telegram throttling + auto-retry (`@grammyjs/transformer-throttler`,
  `@grammyjs/auto-retry`).
- Added `docs/privacy-policy.md` and README sections for languages/settings/privacy.
- Added relative-deadline resolution (`src/domain/relative-date.ts`): "завтра",
  "tomorrow 18:00", "к вечеру", weekday names, etc. now resolve to a concrete `dueAt` in
  the chat time zone, so reminders are actually scheduled and delivered. Wired into
  suggestion creation and private `due` edits.
- Verified locally: lint, typecheck, build, `pnpm audit --prod`, and `pnpm test`
  (30 files / 156 tests, incl. migration `0012` applied to PGlite).

### Not done
- No live staging run: `pnpm db:migrate` (now includes `0012`), Railway deploy, webhook
  registration, and Telegram smoke test still require an operator with staging credentials.

### Risks / blockers
- Migration `0012` adds three `NOT NULL` columns with defaults (`chats.language='auto'`,
  `commitment_suggestions.language='en'`, `commitments.language='en'`) — additive, but must
  be applied to staging before deploying the new image.
- Relative-deadline resolution defaults a bare day to 09:00 local and evening cues to 18:00;
  confirm the default hours match the team's expectation during the staging smoke test.

### Next recommended step
- On staging: back up the DB, run `pnpm db:migrate` once, deploy web + worker, then run the
  smoke checks in `docs/release-checklist.md` (verify RU/EN/ES replies, `/settings timezone`
  and `/settings digest`, and a reminder burst under throttling) before production.

## 2026-07-19 — Handoff

### Done
- Documented the implemented Trust Memory release: immutable scoped suggestion events, chat-scoped calibration, reliability, and actionable private `/check`.
- Added a release checklist that requires migrations `0009`–`0011` on staging before production and verifies callback ownership, current-admin-only digests, and deletion cascade.
- Clarified that `check_page` navigation callbacks are actor-bound, while lifecycle callbacks are authorized only for the assignee or current administrator of the original source chat.
- Passed local frozen install, repository-wide ESLint, typecheck, full test suite (28 files, 148 tests, including local migration application), build, and production dependency audit.

### Not done
- No staging `pnpm db:migrate`, Railway deployment, or live Telegram smoke test was run from this workspace.

### Risks / blockers
- A Railway operator with a separate staging database and bot is required to complete the checklist. Do not use the production database as the first migration target.
- `landing/` remains untracked and was not modified; nested generated `dist/` artifacts are excluded from ESLint without excluding source files.

### Next recommended step
- In Railway staging: back up the staging database, apply `pnpm db:migrate` once, deploy web and worker, and complete every smoke check in `docs/release-checklist.md` before production.

## 2026-07-19 — Handoff

### Done
- Added privacy-safe reliability aggregates for exact source chat/workspace pairs: on-time, late, and overdue in a 30-day deadline window.
- Current source-chat admins receive only that chat's per-person rows after the three-commitment threshold.
- `/check` adds only the caller's own aggregate across their personally connected active chats; it never shows a colleague's metric.

### Not done
- Railway/staging migration and Telegram smoke verification remain task 5; no production database was changed.

### Risks / blockers
- Repository-wide `pnpm lint` remains blocked by the pre-existing untracked `landing/dist` generated output, which this change did not modify.

### Next recommended step
- Complete task 5: release verification, migration checks, and Railway/Telgram smoke checklist.
