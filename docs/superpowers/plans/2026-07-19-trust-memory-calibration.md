# Trust Memory, Calibration, and Cross-Chat Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/check` actionable across connected chats, preserve immutable proposal-decision memory, and add chat-scoped calibration and reliability digests.

**Architecture:** Extend existing signed commitment callbacks for private `/check`; add append-only suggestion events with a schema migration; derive calibration and reliability at read time from records scoped to one chat/workspace. No feature may trust a chat ID from Telegram callback data or aggregate across chats.

**Tech Stack:** TypeScript, grammY, Drizzle/PostgreSQL, Vitest, existing reminder and digest jobs.

## Global constraints

- Every query and event includes both `workspaceId` and `chatId`.
- `/check` reveals only the caller's own commitments from connected active chats.
- Only a current admin of the source chat may see that chat's reliability digest.
- Keep original suggestion snapshots immutable; never log message text or secrets.
- Exclude cancelled and no-exact-deadline commitments from reliability.
- Use a 30-day rolling window and a minimum of three eligible commitments before showing a reliability line.
- Calibration is observation-only until a workspace has 30 resolved suggestions in 90 days.

---

### Task 1: Add paginated, actionable private `/check`

**Files:** Modify `src/telegram/handlers/commands.ts`, `src/telegram/messages.ts`, `src/telegram/callback-data.ts`, `src/telegram/handlers/callback.ts`; add/modify `tests/integration/commands.test.ts` and `tests/integration/commitment-actions.test.ts`.

- [ ] Write RED integration tests for five-task pages, source-chat labels, next/previous controls, and assignee completion from a private `/check` callback.
- [ ] Add `check_page` callback parsing and signed one-time callback tokens that carry no client-trusted scope.
- [ ] Query only the caller's connected active commitments, render at most five per page, and issue existing `complete`, `block`, and `reschedule` callbacks per item.
- [ ] Verify an unrelated participant and an admin from another chat cannot use the callback.
- [ ] Run focused command and callback tests, then the full suite.

### Task 2: Preserve immutable suggestion events

**Files:** Create a Drizzle migration and schema table for `suggestion_events`; modify `src/services/analyze-message.ts`, `src/services/suggestion-edit-sessions.ts`, `src/services/confirm-suggestion.ts`, `src/services/delete-chat-data.ts`; add integration tests.

- [ ] Write RED tests proving `suggested`, `edited`, `confirmed`, and `rejected` events preserve original and final snapshots and are removed with a deleted chat.
- [ ] Create an append-only event table with event type, actor user ID, immutable JSON snapshots, workspace/chat/suggestion foreign-key scope, and timestamp.
- [ ] Write events inside the same transactions as suggestion creation, edit, confirmation, and rejection.
- [ ] Verify source scope, privacy deletion, and concurrent actions.

### Task 3: Surface chat-scoped calibration in private admin digest

**Files:** Modify `src/jobs/digests.ts`, `src/services/send-digest.ts`, `src/telegram/messages.ts`; add calibration repository/query module and digest tests.

- [ ] Write RED digest tests for same-chat counts, workspace isolation, 30-decision/90-day gating, and no disclosure to non-admins.
- [ ] Derive accepted-as-proposed, edited-before-confirmation, and rejected counts from `suggestion_events` for the active chat only.
- [ ] Render a concise private admin calibration section only after the sample threshold.
- [ ] Verify personal digests and group messages never include calibration data.

### Task 4: Add reliability aggregates

**Files:** Add reliability query module; modify `src/jobs/digests.ts`, `src/services/send-digest.ts`, `src/telegram/messages.ts`, `src/telegram/handlers/commands.ts`; add integration tests.

- [ ] Write RED tests for on-time, late, overdue, cancelled, and no-deadline commitments across two chats.
- [ ] Calculate `completedAt <= dueAt` as on-time for the rolling 30-day chat window; exclude cancelled/no-due commitments and suppress rows below three eligible commitments.
- [ ] Add the caller's own cross-chat summary to `/check` and source-chat-only lines to the private admin digest.
- [ ] Verify a user or admin cannot read another chat's metric.

### Task 5: Documentation, migration, and release verification

**Files:** Modify `PROJECT.md`, `CHANGELOG.md`, `HANDOFF.md`, `docs/release-checklist.md`.

- [ ] Update the product flow, privacy rules, and retention description to match the implementation.
- [ ] Run `pnpm db:migrate` against staging, then `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm audit --prod --audit-level=moderate`.
- [ ] Perform Railway staging smoke tests for `/check` callbacks, admin digest isolation, and chat deletion cascade before production deployment.
