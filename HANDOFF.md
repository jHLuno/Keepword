[Earlier entries](docs/archive/HANDOFF-pre-S04.md) · [2026-07-19 archive](docs/archive/HANDOFF-2026-07-19-pre-filter.md) · [Trust Memory archive](docs/archive/HANDOFF-2026-07-19-pre-trust-memory.md) · [Pre-calibration archive](docs/archive/HANDOFF-2026-07-19-pre-calibration.md)

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

## 2026-07-19 — Handoff

### Done
- Added a private calibration section to the admin digest after 30 resolved decisions within a rolling 90-day window.
- Calibration derives only from immutable `suggestion_events` scoped by both `workspace_id` and `chat_id`; it never reads message snapshots.
- Confirmed-without-edits, confirmed-after-edits, and rejected signals are isolated per source group.
- The digest worker checks current Telegram admin access before sending admin data; personal and group messages cannot include calibration.

### Not done
- Reliability aggregates and the cross-chat reliability section in `/check` remain task 4.
- Railway/staging migration and smoke tests remain task 5; no production database was changed.

### Risks / blockers
- Repository-wide `pnpm lint` is blocked by pre-existing, untracked `landing/dist` generated output. Changed files pass targeted ESLint.

### Next recommended step
- Implement task 4: privacy-safe reliability aggregates for each source chat and the user’s own cross-chat `/check` summary.

## 2026-07-19 — Handoff

### Done
- Added migration `0010_suggestion_events` and append-only, chat/workspace-scoped suggestion-decision memory.
- Creation, edit, confirmation, rejection, and chat privacy deletion have integration coverage, including a confirm/reject race.
- Added forward migration `0011_preserve_suggestion_event_history`: a former actor's event remains immutable after membership deletion, while source-chat deletion still removes its event history.
- Added database-level integration coverage for rejecting cross-chat suggestion event inserts.

### Not done
- Calibration and reliability aggregates are not implemented yet; they will derive only from this scoped event history in later plan tasks.

### Risks / blockers
- Railway/staging migration and smoke test remain a release-verification task; no production database was touched locally.

### Next recommended step
- Implement task 3: a private, chat-scoped admin calibration section with 30 resolved suggestions in 90 days as the minimum threshold.
