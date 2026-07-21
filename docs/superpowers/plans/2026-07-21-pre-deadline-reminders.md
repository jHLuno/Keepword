# Преддедлайновые напоминания Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send one private reminder ten minutes before an exact commitment deadline and never send a duplicate at the deadline itself.

**Architecture:** `createReminderJob` selects open commitments that enter a ten-minute pre-deadline window and sends a `reminder_upcoming` delivery using the existing idempotent delivery repository. Tasks at or after the deadline remain open for the rest of that local date; the existing overdue flow starts on the following local date. No database migration is needed because delivery kinds are stored as text.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL/PGlite, Vitest, Grammy.

## Global Constraints

- Deliver only to the assignee after private onboarding and only for the source chat membership.
- Never publish deadline, delivery state, or overdue status to the source group.
- Keep delivery idempotent across one-minute worker runs.
- Do not log message text or secrets.
- Keep the chat’s IANA timezone for local-day overdue calculations.

---

### Task 1: Specify the regression with reminder-job tests

**Files:**

- Modify: `tests/integration/reminders.test.ts:88-115`

**Interfaces:**

- Consumes: `createReminderJob({ callbackSigningSecret, database, messenger })`.
- Produces: tests that establish the upcoming-delivery and no-at-deadline contract.

- [ ] **Step 1: Write the failing tests**

Replace the current at-deadline test with an upcoming test whose `dueAt` is `2026-07-18T12:10:00.000Z`, runs the job at `2026-07-18T12:00:00.000Z`, and expects exactly one private message and no group messages. Add a second test which runs the same job again at `dueAt` and still expects exactly one private message.

- [ ] **Step 2: Run the tests to verify the current behaviour fails**

Run: `pnpm vitest run tests/integration/reminders.test.ts`

Expected: the upcoming-reminder assertion fails because the job only selects `dueAt <= now`; the deadline assertion demonstrates the old duplicate-at-deadline behaviour.

### Task 2: Deliver only the pre-deadline reminder

**Files:**

- Modify: `src/jobs/reminders.ts:34-145`
- Modify: `src/services/send-reminder.ts:20-34,42-49`

**Interfaces:**

- Consumes: commitment `dueAt`, `createdAt`, membership notification state, and `now`.
- Produces: `kind: 'upcoming' | 'overdue'` delivery input and `reminder_upcoming` idempotency records.

- [ ] **Step 1: Extend the candidate query**

Select `commitments.createdAt` and replace the deadline predicate with `lte(commitments.dueAt, new Date(now.getTime() + 10 * 60 * 1_000))`. This fetches due and imminently-due commitments in one query.

- [ ] **Step 2: Branch by delivery moment**

Use the following conditions inside the candidate loop:

```ts
const preDeadlineAt = new Date(candidate.dueAt.getTime() - 10 * 60 * 1_000);
const isUpcoming = candidate.dueAt > now && candidate.createdAt <= preDeadlineAt;
const isPastDeadline = candidate.dueAt <= now;
const isSameLocalDeadlineDay = dueLocalDate === nowLocalDate;
```

Send with `kind: 'upcoming'` only for `isUpcoming`. Preserve the existing status update and send with `kind: 'overdue'` only for `isPastDeadline && !isSameLocalDeadlineDay`; otherwise increment `skipped` and continue. Build the upcoming key as `reminder:upcoming:${candidate.commitmentId}:${candidate.dueAt.toISOString()}` and retain the existing local-date key for overdue delivery. This prevents a late task creation from receiving a less-than-ten-minute pre-deadline message.

- [ ] **Step 3: Update the sender union**

Change `SendReminder` input from `kind: 'due' | 'overdue'` to `kind: 'upcoming' | 'overdue'`. The persistence kind remains ``reminder_${reminder.kind}``; the current open reminder card is reused for `upcoming`.

- [ ] **Step 4: Run the focused tests**

Run: `pnpm vitest run tests/integration/reminders.test.ts`

Expected: all reminder tests pass, including the new upcoming and no-at-deadline cases.

### Task 3: Document and verify the behavioural change

**Files:**

- Modify: `PROJECT.md:266-292`
- Modify: `CHANGELOG.md` (prepend a 2026-07-21 entry)
- Modify: `HANDOFF.md` (prepend a 2026-07-21 entry)

**Interfaces:**

- Consumes: the delivered reminder timing from Task 2.
- Produces: current product documentation and session handoff consistent with runtime behaviour.

- [ ] **Step 1: Update product wording**

Replace “Напомню Данияру в день дедлайна” and the section opening “В день дедлайна” with wording that says Keepword sends the personal card ten minutes before an exact deadline. Preserve the privacy statement for users without private onboarding and the next-day overdue flow.

- [ ] **Step 2: Write the session records**

Add the changed scheduling rule, focused test command, and the required Railway deployment/smoke-test step. Do not claim a live Telegram delivery was performed locally.

- [ ] **Step 3: Run repository checks**

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`. Each must exit `0`.

- [ ] **Step 4: Commit the implementation**

Run `git add src/jobs/reminders.ts src/services/send-reminder.ts tests/integration/reminders.test.ts PROJECT.md CHANGELOG.md HANDOFF.md` followed by `git commit -m "fix: send reminders before commitment deadlines"`.
