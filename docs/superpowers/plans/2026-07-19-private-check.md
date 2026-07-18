# Private `/check` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private `/check` command that shows a user all of their active commitments across connected Telegram groups.

**Architecture:** Keep `/tasks` as the existing one-group command. Add a read-only `/check` branch to the private command handler that joins commitments, memberships, users, and chats using the authenticated Telegram sender ID, then renders grouped status sections. No schema migration, LLM call, callback, or background job is required.

**Tech Stack:** TypeScript, grammY private handler, Drizzle ORM, PostgreSQL/PGlite, Vitest.

## Global Constraints

- `/check` works only in a private chat and never trusts a chat ID supplied in the message.
- Results include only the requesting user, active chats, and statuses `overdue`, `open`, and `blocked`.
- Results exclude commitments from other users, `completed`/`cancelled` commitments, inactive chats, and users without private onboarding.
- Preserve `/tasks` per-group behavior unchanged.
- Do not log commitment titles, message content, or secrets.

---

### Task 1: Query and render the private cross-group commitment summary

**Files:**
- Modify: `src/telegram/handlers/commands.ts:1-170`
- Modify: `tests/integration/commands.test.ts:1-180`

**Interfaces:**
- Consumes: `TelegramCommand`, `createPrivateCommandHandler`, `commitments`, `chats`, `chatMemberships`, and `users`.
- Produces: `/check` private command reply text headed `📋 Мои обязательства`.

- [ ] **Step 1: Write the failing integration test**

Extend `tests/integration/commands.test.ts` with a test that creates two active chats for the same onboarded actor, inserts one task for each of `overdue`, `open`, and `blocked`, plus a teammate task, a completed task, a cancelled task, and an inactive-chat task. Send `/check` to the existing private adapter. Assert that the reply contains the three status headings, each visible title, and each chat title; assert it excludes every invisible title.

```ts
await adapter.handleUpdate(privateUpdate(actorTelegramUserId, '/check'));

const reply = fakeTelegram.privateMessages.at(-1) ?? '';
expect(reply).toContain('📋 Мои обязательства');
expect(reply).toContain('🔴 Просрочены');
expect(reply).toContain('🟡 Открытые');
expect(reply).toContain('🟠 Есть блокер');
expect(reply).toContain('[First group] Overdue task · вчера');
expect(reply).toContain('[Second group] Open task · завтра');
expect(reply).toContain('[First group] Blocked task');
expect(reply).not.toContain('Private teammate task');
expect(reply).not.toContain('Completed task');
expect(reply).not.toContain('Cancelled task');
expect(reply).not.toContain('Inactive chat task');
```

Add a second test for an onboarded user with no active commitments:

```ts
await adapter.handleUpdate(privateUpdate(actorTelegramUserId, '/check'));
expect(fakeTelegram.privateMessages.at(-1)).toBe('📋 Мои обязательства\n\n— активных обязательств нет');
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
pnpm vitest run tests/integration/commands.test.ts
```

Expected: the new `/check` assertions fail because the command is currently unhandled.

- [ ] **Step 3: Implement `/check` with a scoped query and pure rendering helpers**

In `src/telegram/handlers/commands.ts`:

1. Import `CommitmentStatus` typing if needed, and define a local row type containing `chatTitle`, `dueDateText`, `status`, and `title`.
2. Add a pure `renderCheck(rows)` helper. It emits sections in fixed order `overdue`, `open`, `blocked`; omits empty sections; renders task lines as `— [<chat title>] <title>` and appends ` · <due date text>` only when present.
3. Add the `/check` branch before `/tasks`. Query with joins from `commitments` to `users` and `chats`, and filter by:

```ts
and(
  eq(users.telegramUserId, input.telegramUserId),
  isNotNull(users.privateChatStartedAt),
  eq(chats.isActive, true),
  inArray(commitments.status, ['open', 'overdue', 'blocked']),
)
```

Order records by `commitments.dueAt` and `commitments.createdAt`; rendering supplies the fixed status grouping.
4. Return `{ handled: true, text: renderCheck(rows) }`.
5. Add `/check — мои обязательства во всех подключённых группах` to `privateHelpText`.
6. Update the group-only command guard and group `/help` copy so `/check` is identified as a private command.

- [ ] **Step 4: Run the targeted test to verify it passes**

Run:

```bash
pnpm vitest run tests/integration/commands.test.ts
```

Expected: all command tests pass, including `/check` scoping and empty-state coverage.

- [ ] **Step 5: Run the complete verification suite**

Run:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 6: Update product and session documentation**

Update:

- `PROJECT.md` in the personal-bot command section with `/check` and its privacy scope.
- `CHANGELOG.md` with the added command and executed verification.
- `HANDOFF.md` with delivered behavior and manual Railway check: personal `/check` shows only the caller's active tasks.

- [ ] **Step 7: Commit and push**

```bash
git add src/telegram/handlers/commands.ts src/telegram/handlers/group.ts tests/integration/commands.test.ts PROJECT.md CHANGELOG.md HANDOFF.md
git commit -m "feat: add private check command"
git push origin main
```

## Self-review

- Spec coverage: Task 1 covers the private command, all status sections, chat labels, empty state, access scoping, help copy, tests, and required product/session docs.
- Placeholder scan: no `TODO`, `TBD`, or unspecified code paths remain.
- Type consistency: the command returns the existing `PrivateCommandResult`, uses existing Drizzle table definitions, and is dispatched by the existing private handler.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-19-private-check.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute in this session using the plan with direct checkpoints.
