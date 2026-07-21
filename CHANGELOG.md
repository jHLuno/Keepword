[Earlier entries](docs/archive/CHANGELOG-pre-S04.md) · [2026-07-19 archive](docs/archive/CHANGELOG-2026-07-19-pre-filter.md) · [Trust Memory archive](docs/archive/CHANGELOG-2026-07-19-pre-trust-memory.md) · [Pre-calibration archive](docs/archive/CHANGELOG-2026-07-19-pre-calibration.md) · [Trust Memory implementation archive](docs/archive/CHANGELOG-2026-07-19-trust-memory-implementation.md)

## 2026-07-21 — Explicit settings scope

### Changed
- Bare group `/settings` now renders that group's current mode, language,
  timezone, and digest time, followed by the exact group-admin commands.
- Private `/settings` and private help now state that they change only the
  caller's notification delivery; team-wide settings must be changed by a
  current administrator inside the relevant group.
- The Railway checklist now covers migrations `0013` group edit sessions and
  `0014` private `/check` picker tokens, plus their production smoke flows.

### Verified
- Tests were added for the settings scope and non-admin mutation denial. Per
  operator request, no automated checks were run in this implementation pass.

## 2026-07-21 — Contextual private `/check`

### Added
- Actor-bound, opaque one-time picker, detail, and back callbacks for private
  `/check` (migration `0014_check_commitment_picker_tokens`).

### Changed
- `/check` now lists compact commitment selectors instead of repeating lifecycle
  controls under every task. A selector opens one detail card with its own
  Done, Blocked, Reschedule, and Back controls.
- An authorised Done or Blocked action disables the detail card and sends a
  fresh picker page. Copied selection and detail callbacks are rejected before
  their owner's token is consumed.

### Verified
- Tests were updated for picker/detail, back navigation, and copied callback
  rejection. Per operator request, no automated checks were run in this pass.

## 2026-07-21 — Group-native suggestion editing

### Added
- Group edit sessions tied to the exact workspace, source chat, authorised actor,
  pending suggestion, and bot instruction message (migration
  `0013_group_suggestion_edit_sessions`).
- Russian edit aliases `название:`, `срок:` and `описание:` alongside the
  existing English fields.

### Changed
- `Edit` on a group suggestion now stays in the group: the old card loses its
  controls, the actor replies to a bot instruction, and Keepword publishes a
  fresh revised card requiring explicit confirmation.
- Authorised confirm, reject, edit, and commitment-status callbacks remove the
  originating inline keyboard; denied actions leave it usable.

### Verified
- Tests were added for scoped group edits. Per operator request, no automated
  checks were run in this implementation pass.

## 2026-07-19 — Internationalization, chat settings, and delivery hardening

### Added
- Multilingual replies in English, Russian, and Spanish. The extractor detects the
  message language, writes the commitment title/description in it (no more translation),
  and reports it as `language`; a new `src/i18n` module plus a locale catalog in
  `src/telegram/messages.ts` render all bot chrome per locale. Language flows from the
  detected/overridden locale and is stored on suggestions and commitments (migration
  `0012_multilingual_replies`).
- Per-chat administrator settings: `/settings language auto|en|ru|es`,
  `/settings timezone <IANA>`, and `/settings digest HH:MM`, alongside the existing
  `/settings mode …`. Timezone and digest time are validated before saving.
- Telegram rate-limit protection: `@grammyjs/transformer-throttler` and
  `@grammyjs/auto-retry` are installed on the bot API so reminder/digest bursts respect
  Telegram limits and retry on `429`.
- `docs/privacy-policy.md` — an operator-completable privacy policy; README documents
  languages, settings, and privacy.
- Relative-deadline resolution (`src/domain/relative-date.ts`): phrases like "завтра",
  "tomorrow 18:00", "к вечеру", "viernes", or a weekday are resolved to a concrete
  `dueAt` in the chat's time zone (English/Russian/Spanish), so commitments now schedule
  reminders instead of only keeping the deadline as text. Applied on suggestion creation
  and when a private edit changes the `due` field; the human phrase is still shown.

### Changed
- Chat language preference defaults to `auto` (per-message detection, English fallback);
  admins can pin a locale. Digest locale resolves from the chat preference or the
  dominant commitment language.

### Verified
- `pnpm lint`, `pnpm typecheck`, `pnpm build` — passed.
- `pnpm test` — passed: 30 files, 156 tests (added i18n and chat-settings suites; the
  integration suite applies migrations `0000`–`0012` to PGlite).
- `pnpm audit --prod --audit-level=moderate` — no known vulnerabilities.

### Notes
- The live Railway/staging prod run (backup, `pnpm db:migrate`, deploy, webhook,
  Telegram smoke test) still requires an operator with staging credentials; it was not
  run from this workspace.

## 2026-07-19 — Trust Memory release verification

### Changed
- Updated `PROJECT.md` to describe the implemented action-first private `/check`, immutable suggestion decision history, observation-only chat calibration, and scoped reliability metrics.
- Expanded the Railway release checklist with the three migrations in this release, forward-only rollback guidance, and staging checks for callback ownership, current-admin isolation, and privacy deletion cascade.
- Corrected the callback guarantee: only `check_page` navigation callbacks are actor-bound; lifecycle callbacks remain server-authorized for the commitment assignee or a current admin of its original source chat.

### Verified
- `pnpm install --frozen-lockfile` — passed.
- `pnpm typecheck` — passed.
- `pnpm test` — passed: 28 files, 148 tests. The integration suite applies the complete local Drizzle migration folder to PGlite.
- `pnpm build` — passed.
- `pnpm audit --prod --audit-level=moderate` — passed: no known vulnerabilities.
- `pnpm lint` — passed after excluding nested generated `dist/` artifacts without excluding source files.

### Notes
- No discoverable staging database configuration or Railway authority was available locally, so `pnpm db:migrate` was not run against any external database and Telegram/Railway smoke tests were not claimed as complete. The required operator steps are in `docs/release-checklist.md`.

## 2026-07-19 — Chat-scoped reliability memory

### Added
- Added a rolling 30-day reliability aggregate: on-time, late, and currently overdue commitments with an exact deadline.
- Added a private source-chat admin digest section after at least three eligible commitments per person, plus the caller's own connected cross-chat summary in `/check`.

### Changed
- Cancelled commitments, commitments without a deadline, future deadlines, and completed commitments without a recorded completion time are excluded rather than guessed.
- Reliability queries preserve the exact `workspace_id` and `chat_id` source boundary; private `/check` can aggregate only the caller's own connected chats.

### Verified
- `pnpm vitest run tests/integration/digests.test.ts tests/integration/commands.test.ts` — 23 tests passed.
- `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.

### Notes
- Railway/staging migration and live Telegram smoke verification remain task 5; this feature needs no schema migration.
