# Contextual actions UX implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make Telegram editing and commitment actions unambiguous, local to the right chat, and visually single-use.

**Architecture:** Keep authorization and source-chat scope server-side. Add a small message-state layer so an authorised callback can remove its originating keyboard before starting a follow-up session. Extend the existing session services rather than trusting text or callback data from Telegram. `/check` becomes a private picker/detail state machine whose opaque, actor-bound tokens resolve selection and navigation server-side.

**Tech stack:** Node.js, TypeScript strict mode, grammY, Drizzle/PostgreSQL, Vitest with PGlite.

## Global constraints

- Every query and callback remains constrained by exact `workspace_id` and `chat_id`.
- Group-wide settings can be changed only by a current administrator in that group.
- Edit input is accepted only as a reply in the source group; reschedule input is accepted only in the authorised actor's private chat.
- An authorised action removes the originating inline keyboard before follow-up; an unauthorised attempt does not consume another user's control.
- `/check` reveals only the caller's active commitments from personally onboarded chats.
- Do not log plaintext message bodies or secrets.

---

### Task 1: Reliable private rescheduling and consumed-card UI

**Files:**
- Modify: `src/services/commitment-reschedule-sessions.ts`
- Modify: `src/telegram/handlers/callback.ts`
- Modify: `src/telegram/handlers/private.ts`
- Modify: `src/telegram/bot.ts`
- Modify: `src/telegram/messages.ts`
- Test: `tests/integration/reschedule.test.ts`
- Test: `tests/integration/commitment-actions.test.ts`

**Interfaces:**
- `resolveDueDate(text, now, timezone)` must accept Russian and English relative forms and return either a future `Date` or no result.
- Callback messenger gains an edit method for the originating bot message, with optional text and no reply markup.
- Reschedule session remains actor- and commitment-bound; only its private owner may submit input.

- [ ] **Step 1: Add failing reschedule tests**

  Add cases for `сегодня в 22:00`, `сегодня 22:00`, `завтра 18:00`, a weekday phrase, and English equivalents in `Asia/Almaty`. Add a past same-day case. Assert successful values reopen the commitment and invalid/past input leaves its session active for retry.

- [ ] **Step 2: Run focused RED tests**

  Run:

  ```bash
  pnpm vitest run tests/integration/reschedule.test.ts
  ```

  Expected: Russian forms fail before parser support is added.

- [ ] **Step 3: Implement localized relative deadline parsing**

  Normalise whitespace and optional `в`, recognise Russian today/tomorrow/weekday forms before existing ISO/English handling, resolve with the commitment source chat timezone, and reject `<= now`. Return an explicit error code for a recognised past date so presentation can distinguish it from an unrecognised value.

- [ ] **Step 4: Disable authorised private reminder controls immediately**

  In the reschedule callback path, authorise first, then claim the callback, edit the originating private bot card to remove `reply_markup`, and open the session. Keep denied callbacks unclaimed and unchanged. Update the prompt and failure strings in every locale.

- [ ] **Step 5: Run GREEN tests and commit**

  Run:

  ```bash
  pnpm vitest run tests/integration/reschedule.test.ts tests/integration/commitment-actions.test.ts
  pnpm typecheck
  ```

  Commit:

  ```bash
  git add src/services/commitment-reschedule-sessions.ts src/telegram tests/integration/reschedule.test.ts tests/integration/commitment-actions.test.ts
  git commit -m "fix: make private rescheduling clear and localized"
  ```

### Task 2: Group-native suggestion editing and single-use suggestion cards

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0012_group_suggestion_edit_sessions.sql`
- Modify: `src/services/suggestion-edit-sessions.ts`
- Modify: `src/telegram/handlers/callback.ts`
- Modify: `src/telegram/handlers/group.ts`
- Modify: `src/telegram/bot.ts`
- Modify: `src/telegram/messages.ts`
- Test: `tests/integration/private-edit.test.ts`
- Create: `tests/integration/group-edit.test.ts`

**Interfaces:**
- A suggestion edit session stores `workspaceId`, `chatId`, `actorUserId`, `suggestionId`, `instructionTelegramMessageId`, `expiresAt`, and `usedAt`.
- `begin()` returns the server-created session; `findActiveForGroupReply()` resolves only the matching actor, source chat and instruction reply.
- Group messenger can send an instruction reply and edit a bot message's text/keyboard.

- [ ] **Step 1: Write failing group edit tests**

  Cover: source author starts Edit; original suggestion buttons disappear; a group instruction is posted; only a reply to that instruction by the authorised actor in the same chat applies `название:` / `срок:` or English aliases; the old card stays disabled; a new revised card has confirm/edit/reject controls. Cover foreign actor, wrong chat, non-reply, expired session and unauthorised callback.

- [ ] **Step 2: Run RED tests**

  Run:

  ```bash
  pnpm vitest run tests/integration/group-edit.test.ts tests/integration/private-edit.test.ts
  ```

  Expected: current Edit creates a private session/prompt rather than an accepted group reply.

- [ ] **Step 3: Add scoped group-edit persistence and migration**

  Create the forward-only Drizzle migration and schema constraints that bind a session to the exact source suggestion/workspace/chat and actor. Supersede only that actor's older unused edit sessions in the same source scope. Preserve the existing private editor only where still required by private manual-capture cards; group suggestions no longer route to it.

- [ ] **Step 4: Route Edit callback and group replies**

  Authorise against the real source chat, claim the callback, disable the original suggestion message, create the group session, and send the reply-target instruction. In the group message handler, validate the reply target, session actor, scope, expiry and patch before applying. Publish a fresh revised suggestion card so confirmation remains explicit. Emit safe lifecycle logs with IDs only.

- [ ] **Step 5: Disable every resolved suggestion card**

  Confirm, reject and edit must update the originating card with no inline keyboard after their authorised transition. Do not remove controls after an unauthorised attempt. Add regression assertions to existing authorisation/suggestion tests.

- [ ] **Step 6: Run GREEN tests and commit**

  Run:

  ```bash
  pnpm vitest run tests/integration/group-edit.test.ts tests/integration/private-edit.test.ts tests/integration/suggestions.test.ts tests/integration/authorization.test.ts
  pnpm typecheck
  ```

  Commit:

  ```bash
  git add src/db src/services/suggestion-edit-sessions.ts src/telegram tests/integration
  git commit -m "feat: edit group suggestions in place"
  ```

### Task 3: `/check` picker/detail flow and unambiguous lifecycle cards

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0013_check_commitment_picker_tokens.sql`
- Modify: `src/services/callback-tokens.ts`
- Modify: `src/telegram/handlers/commands.ts`
- Modify: `src/telegram/handlers/callback.ts`
- Modify: `src/telegram/messages.ts`
- Modify: `src/telegram/bot.ts`
- Test: `tests/integration/commands.test.ts`
- Test: `tests/integration/commitment-actions.test.ts`

**Interfaces:**
- `callback_tokens` supports opaque, one-time `check_commitment` tokens holding actor ID, page and commitment ID server-side.
- `getCheckPage()` renders a picker with only commitment-selection and page controls.
- `getCheckCommitmentDetail()` renders exactly one commitment with its lifecycle controls and a back-to-page control.

- [ ] **Step 1: Write failing picker/detail tests**

  Add a caller with two or more commitments. Assert `/check` has only labelled commitment picker buttons, selecting one renders exactly that commitment's detail/actions, and the other task is absent from that action card. Assert back returns the same page. Assert copied selection/detail callbacks are rejected and the owner's token remains usable.

- [ ] **Step 2: Run RED tests**

  Run:

  ```bash
  pnpm vitest run tests/integration/commands.test.ts tests/integration/commitment-actions.test.ts
  ```

  Expected: the current list renders lifecycle button rows for every item.

- [ ] **Step 3: Add server-resolved picker token kinds**

  Add a forward-only migration and typed schema fields/constraints for `check_commitment` and `check_back` tokens. Bind actor, page and commitment server-side, require private chat, claim only after ownership checks, and retain deterministic commitment ordering.

- [ ] **Step 4: Render picker and detail cards**

  Replace multi-task lifecycle grids with compact labelled picker rows. Detail rendering receives only a resolved commitment and creates action buttons for that one ID. On an authorised lifecycle action, remove the selected detail keyboard, update status feedback, and render a fresh picker page. On navigation/back, replace the old message with a fresh picker/detail state.

- [ ] **Step 5: Run GREEN tests and commit**

  Run:

  ```bash
  pnpm vitest run tests/integration/commands.test.ts tests/integration/commitment-actions.test.ts
  pnpm typecheck
  ```

  Commit:

  ```bash
  git add src/db src/services/callback-tokens.ts src/telegram tests/integration
  git commit -m "feat: make check actions contextual"
  ```

### Task 4: Explain and enforce settings scope

**Files:**
- Modify: `src/telegram/handlers/commands.ts`
- Modify: `src/telegram/messages.ts`
- Test: `tests/integration/commands.test.ts`
- Modify: `PROJECT.md`
- Modify: `CHANGELOG.md`
- Modify: `HANDOFF.md`

**Interfaces:**
- Bare group `/settings` returns current mode, locale, timezone and digest time plus group-admin command examples.
- Private `/settings` continues to change only personal notification delivery and explicitly explains group-settings scope.

- [ ] **Step 1: Add failing settings tests**

  Assert bare group `/settings` returns the source chat's current values and group command examples. Assert a non-admin cannot mutate a group setting. Assert private help clearly states that it cannot alter group configuration.

- [ ] **Step 2: Run RED tests**

  Run:

  ```bash
  pnpm vitest run tests/integration/commands.test.ts
  ```

- [ ] **Step 3: Implement scoped settings presentation**

  Preserve existing `mode`, `language`, `timezone` and `digest` mutation authorisation. Add a locale-aware, current-state response for bare group `/settings`; update private and group help strings so the distinction is explicit.

- [ ] **Step 4: Update product and operational docs**

  Document group-native edits, private rescheduling, contextual `/check`, and the setting scopes in `PROJECT.md`. Add verified behaviour and migration names to `CHANGELOG.md` and `HANDOFF.md`.

- [ ] **Step 5: Run quality checks and commit**

  Run:

  ```bash
  pnpm lint
  pnpm typecheck
  pnpm vitest run --maxWorkers=1 --minWorkers=1
  pnpm build
  git diff --check
  ```

  Commit:

  ```bash
  git add src/telegram/handlers/commands.ts src/telegram/messages.ts tests/integration/commands.test.ts PROJECT.md CHANGELOG.md HANDOFF.md
  git commit -m "docs: clarify contextual Keepword controls"
  ```

## Final verification

1. Apply migrations to a disposable PGlite database through the integration suite.
2. Run `pnpm lint`, `pnpm typecheck`, `pnpm vitest run --maxWorkers=1 --minWorkers=1`, `pnpm build`, and `pnpm audit --prod --audit-level=moderate`.
3. Review the full range for source-chat isolation, stale callback safety, button removal after authorised actions, and no private/group cross-disclosure.
4. Update `docs/release-checklist.md` with migrations `0012` and `0013` and the group-edit/picker smoke tests before Railway deployment.
