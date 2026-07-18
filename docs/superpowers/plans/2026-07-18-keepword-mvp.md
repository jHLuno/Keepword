# Keepword MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the complete Telegram-first Keepword MVP defined in `PROJECT.md`.

**Architecture:** A strict TypeScript Fastify application accepts validated Telegram webhooks and exposes health endpoints. grammY adapters translate Telegram updates to small application services; Drizzle repositories persist scoped data in PostgreSQL. A worker process uses the same services to send idempotent reminders and digests.

**Tech Stack:** Node.js, TypeScript, Fastify, grammY, PostgreSQL, Drizzle ORM, OpenAI structured outputs, Zod, Vitest, Railway.

## Global Constraints

- The product behavior and scope are defined by `PROJECT.md`; no web dashboard, historical group analysis, integrations, billing, or auto-capture without confirmation.
- Use TypeScript strict mode; do not use `any`.
- Every database schema change ships as a Drizzle migration.
- All tenant data is scoped by workspace and chat; authorization is always re-checked server-side.
- Log only safe IDs, durations, outcomes, and error codes—never secrets or full private message text.
- Private reminders and digests require private `/start` onboarding; overdue work is never disclosed to a group.
- Every feature is developed test-first: run each new test red before its implementation and green afterward.
- Required release commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

---

## File Structure

```text
src/
  app.ts                         # Fastify construction and lifecycle
  config.ts                      # validated environment configuration
  main.ts                        # web-process entry point
  worker.ts                      # scheduled worker entry point
  db/
    client.ts                    # Drizzle PostgreSQL client
    schema.ts                    # relational schema and enums
    migrations/                  # generated SQL migrations
  domain/
    commitment.ts                # lifecycle/status/domain types
    extraction.ts                # validated AI candidate types
    errors.ts                    # stable application errors
  repositories/                  # scoped persistence operations
  services/                      # application/business flows
  telegram/
    bot.ts                       # grammY construction
    handlers/                    # group, private, callback, command handlers
    messages.ts                  # Telegram-safe rendering/keyboards
    callback-data.ts             # signed action payload codecs
  ai/
    prefilter.ts                 # low-cost candidate check
    extractor.ts                 # OpenAI structured extraction adapter
    context.ts                   # bounded chat context selection
  jobs/
    reminders.ts                 # due-work delivery candidates
    digests.ts                   # user/admin digest candidates
  observability/logger.ts        # safe structured logger
tests/
  unit/                          # pure service/domain tests
  integration/                   # Fastify + fake Telegram/OpenAI flows
  helpers/                       # isolated PostgreSQL/fake adapter fixtures
```

## Task 1: Initialize the strict TypeScript service

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.gitignore`, `.env.example`
- Create: `src/config.ts`, `src/app.ts`, `src/main.ts`, `src/worker.ts`, `src/observability/logger.ts`, `tests/unit/config.test.ts`
- Modify: `README.md` (create it if absent) with local setup and commands

**Interfaces:**
- Produces `loadConfig(env: NodeJS.ProcessEnv): AppConfig` and `buildApp(config: AppConfig): FastifyInstance`.
- Produces `createLogger(): Logger` with `info(event, metadata)` and `error(event, metadata)`.

- [ ] **Step 1: Write the failing configuration test**

```ts
import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../src/config.js';

test('rejects a missing TELEGRAM_BOT_TOKEN', () => {
  expect(() => loadConfig({ DATABASE_URL: 'postgres://local/db', OPENAI_API_KEY: 'key' }))
    .toThrow('TELEGRAM_BOT_TOKEN');
});
```

- [ ] **Step 2: Run the test red**

Run: `pnpm vitest run tests/unit/config.test.ts`  
Expected: failure because `src/config.ts` does not exist.

- [ ] **Step 3: Implement the bootstrap**

```ts
export type AppConfig = Readonly<{
  telegramBotToken: string;
  telegramWebhookSecret: string;
  databaseUrl: string;
  openAiApiKey: string;
  port: number;
  workerSecret: string;
}>;

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'DATABASE_URL', 'OPENAI_API_KEY', 'WORKER_SECRET'] as const;
  for (const key of required) if (!env[key]) throw new Error(`Missing required environment variable: ${key}`);
  return {
    telegramBotToken: env.TELEGRAM_BOT_TOKEN!, telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET!,
    databaseUrl: env.DATABASE_URL!, openAiApiKey: env.OPENAI_API_KEY!, workerSecret: env.WORKER_SECRET!,
    port: Number(env.PORT ?? 3000),
  };
}
```

Configure scripts: `dev`, `dev:worker`, `lint`, `typecheck`, `test`, `build`, `db:generate`, and `db:migrate`; ignore `.env`, generated coverage, and build output. Add an `.env.example` with names only, never values.

- [ ] **Step 4: Run the test green and static checks**

Run: `pnpm vitest run tests/unit/config.test.ts && pnpm typecheck && pnpm lint`  
Expected: all pass.

- [ ] **Step 5: Commit the bootstrap**

```bash
git add package.json pnpm-workspace.yaml tsconfig.json vitest.config.ts eslint.config.js .gitignore .env.example README.md src tests
git commit -m "chore: initialize Keepword TypeScript service"
```

## Task 2: Create the database schema and migration pipeline

**Files:**
- Create: `drizzle.config.ts`, `src/db/client.ts`, `src/db/schema.ts`, `src/db/migrations/0000_initial.sql`, `tests/integration/schema.test.ts`

**Interfaces:**
- Produces a `Database` Drizzle client and tables `workspaces`, `chats`, `users`, `chat_memberships`, `source_messages`, `commitment_suggestions`, `commitments`, `commitment_sources`, `onboarding_tokens`, `notification_deliveries`, and `processed_updates`.
- `commitments.status` is one of `open | completed | overdue | cancelled | blocked`.

- [ ] **Step 1: Write a failing schema test**

```ts
test('prevents a duplicate Telegram update ID', async () => {
  await db.insert(processedUpdates).values({ telegramUpdateId: 42 });
  await expect(db.insert(processedUpdates).values({ telegramUpdateId: 42 })).rejects.toThrow();
});
```

- [ ] **Step 2: Run the integration test red against a disposable PostgreSQL database**

Run: `pnpm vitest run tests/integration/schema.test.ts`  
Expected: failure because the schema/migration is absent.

- [ ] **Step 3: Define the relational schema and generate SQL**

Define UUID primary keys, `created_at`/`updated_at` timestamps, foreign keys, and unique indexes:

```ts
export const processedUpdates = pgTable('processed_updates', {
  telegramUpdateId: bigint('telegram_update_id', { mode: 'number' }).primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('pending'),
  commitmentId: uuid('commitment_id'),
  userId: uuid('user_id'),
  chatId: uuid('chat_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  errorCode: text('error_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Add a unique `(chat_id, telegram_message_id)` source-message index, a unique `(chat_id, user_id)` membership index, a token hash unique index, and scoped commitment/suggestion indexes. Store onboarding token hashes—not raw tokens.

- [ ] **Step 4: Migrate and run green**

Run: `pnpm db:generate && pnpm db:migrate && pnpm vitest run tests/integration/schema.test.ts`  
Expected: migration applies and test passes.

- [ ] **Step 5: Commit the schema**

```bash
git add drizzle.config.ts src/db tests/integration/schema.test.ts
git commit -m "feat: add Keepword persistence schema"
```

## Task 3: Add scoped repositories, transactions, and safe logs

**Files:**
- Create: `src/domain/errors.ts`, `src/repositories/updates.ts`, `src/repositories/chats.ts`, `src/repositories/users.ts`, `src/repositories/messages.ts`, `src/repositories/commitments.ts`, `src/repositories/deliveries.ts`
- Create: `tests/unit/logger.test.ts`, `tests/integration/repositories.test.ts`

**Interfaces:**
- `recordUpdate(updateId: number): Promise<boolean>` returns `false` for a duplicate update.
- `findScopedCommitment(input: { workspaceId: string; chatId: string; commitmentId: string })` never returns cross-chat data.
- `claimDelivery(key: string): Promise<'claimed' | 'already-sent' | 'in-progress'>` is atomic.

- [ ] **Step 1: Write failing scope and log-redaction tests**

```ts
test('cannot read a commitment from another chat', async () => {
  await expect(findScopedCommitment({ workspaceId, chatId: otherChatId, commitmentId })).resolves.toBeNull();
});

test('logger does not serialize messageText', () => {
  expect(serializeLog('event', { messageText: 'private message', chatId: '1' }))
    .not.toContain('private message');
});
```

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/unit/logger.test.ts tests/integration/repositories.test.ts`  
Expected: missing modules/functions.

- [ ] **Step 3: Implement minimal scoped repository methods**

Use parameterized Drizzle queries with workspace/chat predicates in every lookup. Implement errors as `AppError` with codes `INVALID_PAYLOAD`, `UNAUTHORIZED`, `EXPIRED_TOKEN`, `DUPLICATE_CANDIDATE`, `EXTRACTION_FAILED`, and `DELIVERY_FAILED`. The logger accepts only an allowlisted metadata shape:

```ts
export type LogMetadata = Readonly<{
  requestId?: string; workspaceId?: string; telegramChatId?: string; telegramUserId?: string;
  messageId?: string; commitmentId?: string; durationMs?: number; result?: string; errorCode?: string;
}>;
```

- [ ] **Step 4: Run green**

Run: `pnpm vitest run tests/unit/logger.test.ts tests/integration/repositories.test.ts && pnpm typecheck`  
Expected: all pass.

- [ ] **Step 5: Commit the persistence boundary**

```bash
git add src/domain src/repositories src/observability tests
git commit -m "feat: add scoped repositories and safe logging"
```

## Task 4: Build Telegram webhook, update deduplication, and chat connection

**Files:**
- Create: `src/telegram/bot.ts`, `src/telegram/handlers/group.ts`, `src/services/connect-chat.ts`, `tests/integration/webhook.test.ts`, `tests/helpers/fake-telegram.ts`
- Modify: `src/app.ts`, `src/repositories/chats.ts`, `src/repositories/updates.ts`

**Interfaces:**
- `POST /telegram/webhook` validates the `x-telegram-bot-api-secret-token` header and returns `200` for valid duplicate updates.
- `connectChat(input: { telegramChatId: string; title: string; adminTelegramUserId: string; timezone: string }): Promise<ConnectedChat>` is idempotent.

- [ ] **Step 1: Write failing webhook tests**

```ts
test('rejects a webhook with an invalid secret', async () => {
  const response = await app.inject({ method: 'POST', url: '/telegram/webhook', payload: update });
  expect(response.statusCode).toBe(401);
});

test('connects a new group once and ignores a repeated update', async () => {
  await sendWebhook(update);
  await sendWebhook(update);
  expect(await countChats()).toBe(1);
});
```

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/integration/webhook.test.ts`  
Expected: routes and handlers are missing.

- [ ] **Step 3: Implement webhook routing and connection onboarding**

Create a grammY bot with no polling. Verify the webhook header before calling `bot.handleUpdate`. Atomically call `recordUpdate`; skip handler dispatch on duplicates. On bot-added-to-group events, create the workspace/chat and admin membership, then send the onboarding card explaining new-message-only analysis and its notification deep-link button.

- [ ] **Step 4: Run green**

Run: `pnpm vitest run tests/integration/webhook.test.ts`  
Expected: invalid headers reject; valid updates are idempotent and create one chat.

- [ ] **Step 5: Commit webhook ingress**

```bash
git add src/app.ts src/telegram src/services/connect-chat.ts tests
git commit -m "feat: receive Telegram webhook updates"
```

## Task 5: Implement pre-filtering, context, and typed OpenAI extraction

**Files:**
- Create: `src/domain/extraction.ts`, `src/ai/prefilter.ts`, `src/ai/context.ts`, `src/ai/extractor.ts`, `tests/unit/prefilter.test.ts`, `tests/unit/extractor.test.ts`, `tests/helpers/fake-openai.ts`

**Interfaces:**
- `isPotentialCommitment(text: string): boolean` is intentionally recall-oriented and never invokes OpenAI.
- `extractCandidate(input: ExtractionInput): Promise<CommitmentCandidate>` returns a Zod-validated result.
- `CommitmentCandidate` matches the `AGENTS.md` structured contract and uses `high | medium | low` confidence.

- [ ] **Step 1: Write failing behavior tests**

```ts
test.each(['Я отправлю КП сегодня', 'Настя, проверь бюджет до завтра'])('flags a likely commitment: %s', (text) => {
  expect(isPotentialCommitment(text)).toBe(true);
});

test('rejects an invalid AI response instead of inventing a candidate', async () => {
  await expect(extractCandidate(inputWithInvalidModelOutput)).rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
});
```

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/unit/prefilter.test.ts tests/unit/extractor.test.ts`  
Expected: functions are absent.

- [ ] **Step 3: Implement bounded extraction**

Use a small Russian/English trigger list and normalize whitespace/case. Select at most the configured recent messages from the same chat. Define Zod schema fields exactly as:

```ts
const candidateSchema = z.object({
  is_commitment: z.boolean(),
  category: z.enum(['promise', 'assignment', 'follow_up', 'none']),
  title: z.string().nullable(), description: z.string().nullable(),
  assignee_telegram_user_id: z.string().nullable(), due_at: z.string().datetime().nullable(),
  due_date_text: z.string().nullable(), confidence: z.enum(['high', 'medium', 'low']),
  source_message_ids: z.array(z.string()), needs_assignee_clarification: z.boolean(),
  needs_due_date_clarification: z.boolean(), reasoning_short: z.string().max(300),
});
```

Send a fixed extraction instruction that forbids invented dates/assignees and demands `null` for unknown facts. Never log prompt or completion message content.

- [ ] **Step 4: Run green**

Run: `pnpm vitest run tests/unit/prefilter.test.ts tests/unit/extractor.test.ts`  
Expected: all cases pass, including invalid output rejection.

- [ ] **Step 5: Commit AI boundary**

```bash
git add src/ai src/domain/extraction.ts tests
git commit -m "feat: add bounded commitment extraction"
```

## Task 6: Create suggestions, duplicate checks, and public cards

**Files:**
- Create: `src/services/analyze-message.ts`, `src/services/create-suggestion.ts`, `src/telegram/messages.ts`, `tests/integration/suggestions.test.ts`
- Modify: `src/telegram/handlers/group.ts`, `src/repositories/commitments.ts`, `src/repositories/messages.ts`

**Interfaces:**
- `analyzeGroupMessage(input): Promise<'skipped' | 'suggested' | 'clarification-requested'>`.
- `createSuggestion(input): Promise<{ id: string; duplicate: boolean }>`.
- `renderSuggestion(suggestion): { text: string; replyMarkup: InlineKeyboardMarkup }`.

- [ ] **Step 1: Write failing suggestion tests**

```ts
test('creates a reply suggestion for a high-confidence promise', async () => {
  await analyzeGroupMessage(highConfidenceMessage);
  expect(fakeTelegram.lastReply.text).toContain('Keepword заметил договорённость');
  expect(await countSuggestions()).toBe(1);
});

test('does not reply for low confidence or a duplicate commitment', async () => {
  await analyzeGroupMessage(lowConfidenceMessage);
  await analyzeGroupMessage(duplicateMessage);
  expect(fakeTelegram.replies).toHaveLength(0);
});
```

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/integration/suggestions.test.ts`  
Expected: analysis service is missing.

- [ ] **Step 3: Implement candidate gating and rendering**

Persist candidate source messages before extraction. Only high-confidence candidates with an action, determinable assignee, due date or explicit due-date clarification, and no active duplicate become suggestions. Compare normalized title + assignee + chat against open commitments/suggestions. Render `Подтвердить`, `Изменить`, and `Не фиксировать` buttons as opaque signed callback actions. For medium-confidence follow-up, ask only the documented concise question and create no commitment.

- [ ] **Step 4: Run green**

Run: `pnpm vitest run tests/integration/suggestions.test.ts`  
Expected: high-confidence candidate replies once; low/duplicate candidates stay silent.

- [ ] **Step 5: Commit suggestions**

```bash
git add src/services src/telegram/messages.ts src/telegram/handlers/group.ts src/repositories tests
git commit -m "feat: suggest high-confidence commitments"
```

## Task 7: Authorize confirmation, editing, rejection, and task status actions

**Files:**
- Create: `src/telegram/callback-data.ts`, `src/telegram/handlers/callback.ts`, `src/services/authorize-action.ts`, `src/services/confirm-suggestion.ts`, `src/services/update-commitment.ts`
- Create: `tests/integration/authorization.test.ts`, `tests/integration/commitment-actions.test.ts`

**Interfaces:**
- `authorizeSuggestionAction(input): Promise<'source-author' | 'chat-admin'>` throws `UNAUTHORIZED` otherwise.
- `confirmSuggestion(input): Promise<Commitment>` converts exactly one pending suggestion in a transaction.
- Commitment transitions: `open → completed | overdue | cancelled | blocked`; `blocked → open | completed | cancelled`; terminal states cannot be reopened except explicit due-date reschedule policy.

- [ ] **Step 1: Write failing authorization tests**

```ts
test('allows the source author to confirm their suggestion', async () => {
  await callbackAs(sourceAuthorId, confirmPayload);
  expect(await getCommitmentStatus()).toBe('open');
});

test('rejects a normal participant confirming another persons suggestion', async () => {
  await callbackAs(participantId, confirmPayload);
  expect(fakeTelegram.lastCallbackAnswer).toContain('нет прав');
  expect(await countCommitments()).toBe(0);
});
```

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/integration/authorization.test.ts tests/integration/commitment-actions.test.ts`  
Expected: callback handling and transitions are missing.

- [ ] **Step 3: Implement server-owned callback actions**

Encode only an action and random signed nonce in callback data; resolve suggestion/commitment IDs on the server. Refresh administrator status through Telegram before privileged action. Confirm with transactionally locked pending suggestion, create commitment/source links, and mark suggestion confirmed. Support edit fields through a short private/inline conversation with input validation; reject/cancel preserves audit state. Render group feedback without exposing sensitive private state.

- [ ] **Step 4: Run green**

Run: `pnpm vitest run tests/integration/authorization.test.ts tests/integration/commitment-actions.test.ts`  
Expected: author/admin are allowed; ordinary member, expired, malformed, and replayed callbacks are rejected.

- [ ] **Step 5: Commit authenticated commitment management**

```bash
git add src/telegram/callback-data.ts src/telegram/handlers/callback.ts src/services tests
git commit -m "feat: authorize commitment confirmation and updates"
```

## Task 8: Implement private onboarding and notification connection

**Files:**
- Create: `src/services/onboarding.ts`, `src/telegram/handlers/private.ts`, `tests/integration/onboarding.test.ts`
- Modify: `src/services/connect-chat.ts`, `src/telegram/messages.ts`, `src/repositories/users.ts`

**Interfaces:**
- `createOnboardingLink(chatId: string): Promise<string>` returns a deep link containing an opaque raw token.
- `redeemOnboardingToken(input: { token: string; telegramUserId: string }): Promise<ChatMembership>` atomically consumes a valid token.

- [ ] **Step 1: Write failing token-flow tests**

```ts
test('activates notifications for a valid unused chat-scoped token', async () => {
  await privateStart(userId, `join_${token}`);
  expect(await notificationsActive(chatId, userId)).toBe(true);
});

test.each(['expired', 'used', 'wrong-chat'])('does not activate notifications for a %s token', async (kind) => {
  await expect(redeemFixtureToken(kind)).rejects.toMatchObject({ code: 'EXPIRED_TOKEN' });
});
```

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/integration/onboarding.test.ts`  
Expected: onboarding service is absent.

- [ ] **Step 3: Implement token issuance/redeeming and anti-spam reminders**

Generate 32 random bytes encoded base64url, store a SHA-256 hash, bind it to one chat, and expire it after 24 hours. In one transaction verify the hash, active chat, expiry, and unused state; then set membership notifications active and mark consumed. `/start` without a valid join token remains helpful but creates no chat access. When assigning an unconnected user, post the group invitation only if `last_notification_invite_at` is older than 24 hours. Implement `/invite` and admin-only `/notifications`.

- [ ] **Step 4: Run green**

Run: `pnpm vitest run tests/integration/onboarding.test.ts`  
Expected: valid link works once; invalid variants and repeat invite limits are safe.

- [ ] **Step 5: Commit onboarding**

```bash
git add src/services/onboarding.ts src/telegram/handlers/private.ts src/services/connect-chat.ts src/telegram/messages.ts tests
git commit -m "feat: connect private notifications securely"
```

## Task 9: Deliver manual capture and required Telegram commands

**Files:**
- Create: `src/services/manual-capture.ts`, `src/telegram/handlers/commands.ts`, `tests/integration/commands.test.ts`, `tests/integration/manual-capture.test.ts`
- Modify: `src/telegram/handlers/private.ts`, `src/telegram/messages.ts`, `src/services/analyze-message.ts`

**Interfaces:**
- Commands: `/start`, `/help`, `/settings`, `/tasks`, `/privacy`, `/invite`, `/notifications`, and group `/keep`.
- `capturePrivateMessage(input): Promise<CommitmentSuggestion>` defaults assignee to private sender and still requires confirmation.

- [ ] **Step 1: Write failing command and fallback tests**

```ts
test('creates a private confirmation card for a forwarded promise', async () => {
  await receivePrivateForward('Я подготовлю бюджет к пятнице');
  expect(fakeTelegram.lastPrivateMessage.text).toContain('Я нашёл обязательство');
});

test('does not let a non-admin request chat notification status', async () => {
  await runGroupCommand('/notifications', normalMemberId);
  expect(fakeTelegram.lastReply.text).toContain('только администраторам');
});
```

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/integration/commands.test.ts tests/integration/manual-capture.test.ts`  
Expected: command handlers missing.

- [ ] **Step 3: Implement command contract**

Route commands separately from ordinary messages. `/tasks` lists only private sender commitments scoped to selected connected chat; `/settings` toggles allowed personal notification preferences; `/privacy` explains processing and provides chat deletion request routing; `/help` lists only supported MVP behavior. `/keep` accepts a replied-to group message and sends it through the same analysis and confirmation flow. Keep command UI concise and Telegram-native.

- [ ] **Step 4: Run green**

Run: `pnpm vitest run tests/integration/commands.test.ts tests/integration/manual-capture.test.ts`  
Expected: all required commands and fallback capture work with scope checks.

- [ ] **Step 5: Commit manual interactions**

```bash
git add src/services/manual-capture.ts src/telegram/handlers/commands.ts src/telegram/handlers/private.ts src/telegram/messages.ts tests
git commit -m "feat: add Keepword commands and manual capture"
```

## Task 10: Add reminders and private status controls

**Files:**
- Create: `src/jobs/reminders.ts`, `src/services/send-reminder.ts`, `tests/integration/reminders.test.ts`
- Modify: `src/services/update-commitment.ts`, `src/telegram/messages.ts`, `src/repositories/deliveries.ts`

**Interfaces:**
- `runReminderJob(now: Date): Promise<JobResult>` claims and delivers each eligible reminder once.
- Reminder action callbacks support `completed`, `reschedule`, `blocked`, and `cancelled` only for the assignee or chat admin.

- [ ] **Step 1: Write failing privacy/idempotency tests**

```ts
test('sends a due reminder only to an onboarded assignee', async () => {
  await runReminderJob(dueNow);
  expect(fakeTelegram.privateMessagesFor(assigneeTelegramId)).toHaveLength(1);
  expect(fakeTelegram.groupMessages).toHaveLength(0);
});

test('does not deliver the same reminder twice when the job repeats', async () => {
  await runReminderJob(dueNow); await runReminderJob(dueNow);
  expect(fakeTelegram.privateMessagesFor(assigneeTelegramId)).toHaveLength(1);
});
```

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/integration/reminders.test.ts`  
Expected: reminder job does not exist.

- [ ] **Step 3: Implement due/overdue delivery**

Select open commitments at reminder time in the chat timezone. Claim the delivery idempotency key before bot API send, mark sent only after success, and record safe failure code on failure. Render overdue text only in the assignee’s private chat. If the assignee is unconnected, send no group overdue notice; leave it for administrator risk digest. Implement rescheduling with validated future due time and cancelled/blocked/completed state changes.

- [ ] **Step 4: Run green**

Run: `pnpm vitest run tests/integration/reminders.test.ts`  
Expected: privacy, lifecycle, retry, and idempotency assertions pass.

- [ ] **Step 5: Commit reminders**

```bash
git add src/jobs/reminders.ts src/services/send-reminder.ts src/services/update-commitment.ts src/telegram/messages.ts src/repositories/deliveries.ts tests
git commit -m "feat: send idempotent private commitment reminders"
```

## Task 11: Add individual and administrator daily digests

**Files:**
- Create: `src/jobs/digests.ts`, `src/services/send-digest.ts`, `tests/integration/digests.test.ts`
- Modify: `src/worker.ts`, `src/telegram/messages.ts`, `src/repositories/deliveries.ts`

**Interfaces:**
- `runDigestJob(now: Date): Promise<JobResult>` sends per-recipient once per chat-local date.
- `buildUserDigest(input): DigestSummary` never includes another user’s commitment.
- `buildAdminDigest(input): TeamRiskSummary` contains aggregates/risk titles but no private delivery state.

- [ ] **Step 1: Write failing digest tests**

```ts
test('personal digest includes only the recipients commitments', async () => {
  const digest = await buildUserDigest({ chatId, userId: userA, date });
  expect(digest.items.map((item) => item.commitmentId)).toEqual([commitmentForUserA]);
});

test('re-running daily digest sends one message per recipient', async () => {
  await runDigestJob(atDigestTime); await runDigestJob(atDigestTime);
  expect(fakeTelegram.privateMessagesFor(userATelegramId)).toHaveLength(1);
});
```

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/integration/digests.test.ts`  
Expected: digest modules missing.

- [ ] **Step 3: Implement timezone-aware summaries**

Use the chat’s IANA timezone and configured daily time. Personal digest counts completed today, open, overdue, and due tomorrow and lists attention items. Admin digest counts team totals and names task-level risks (overdue/no deadline) without exposing a person’s notification state. Create delivery key `digest:<chatId>:<userId>:<localDate>:<kind>` before delivery. Skip recipients who have not started the private chat.

- [ ] **Step 4: Run green**

Run: `pnpm vitest run tests/integration/digests.test.ts`  
Expected: correct audience, local-date selection, and idempotency pass.

- [ ] **Step 5: Commit digests**

```bash
git add src/jobs/digests.ts src/services/send-digest.ts src/worker.ts src/telegram/messages.ts src/repositories/deliveries.ts tests
git commit -m "feat: send private and team daily digests"
```

## Task 12: Implement settings, retention deletion, and chat modes

**Files:**
- Create: `src/services/chat-settings.ts`, `src/services/delete-chat-data.ts`, `tests/integration/privacy.test.ts`, `tests/integration/chat-modes.test.ts`
- Modify: `src/telegram/handlers/commands.ts`, `src/telegram/handlers/group.ts`, `src/repositories/chats.ts`, `src/repositories/commitments.ts`

**Interfaces:**
- Modes are `suggest | manual | silent_digest`; `auto_capture` is rejected as not-MVP.
- `deleteChatData(input: { workspaceId: string; chatId: string; requestedByTelegramUserId: string }): Promise<void>` requires current admin authority.

- [ ] **Step 1: Write failing configuration/deletion tests**

```ts
test('manual mode ignores ordinary group messages but accepts /keep', async () => {
  await setMode('manual'); await receiveGroupMessage(promise);
  expect(await countSuggestions()).toBe(0);
  await runKeepOnMessage(promise); expect(await countSuggestions()).toBe(1);
});

test('chat deletion removes chat-scoped messages, commitments, reminders, and onboarding tokens', async () => {
  await deleteChatData(adminRequest);
  await expect(allRecordsForChat(chatId)).resolves.toEqual([]);
});
```

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/integration/privacy.test.ts tests/integration/chat-modes.test.ts`  
Expected: settings/deletion paths absent.

- [ ] **Step 3: Implement admin-only settings and deletion transaction**

Support Selectable `Suggest`, `Manual`, and `Silent Digest` modes. In silent digest, collect potential candidates but do not publicly reply; include eligible candidates in the admin digest review section. On validated deletion request, transactionally remove source/context, suggestions, commitment links, commitments, deliveries, memberships, tokens, and mark the chat deleted; maintain only non-identifying operational audit metadata if required for legal/abuse prevention.

- [ ] **Step 4: Run green**

Run: `pnpm vitest run tests/integration/privacy.test.ts tests/integration/chat-modes.test.ts`  
Expected: mode gates and complete scoped deletion pass.

- [ ] **Step 5: Commit settings and privacy controls**

```bash
git add src/services/chat-settings.ts src/services/delete-chat-data.ts src/telegram/handlers src/repositories tests
git commit -m "feat: add chat settings and data deletion"
```

## Task 13: Wire the worker, operational endpoints, and deployment assets

**Files:**
- Create: `Dockerfile`, `railway.toml`, `scripts/run-worker.ts`, `tests/integration/worker-auth.test.ts`
- Modify: `src/app.ts`, `src/main.ts`, `src/worker.ts`, `README.md`, `.env.example`

**Interfaces:**
- `GET /health` returns `{ "status": "ok" }` without database secrets.
- `POST /internal/run-jobs` requires `Authorization: Bearer <WORKER_SECRET>` and runs reminders and digests safely.

- [ ] **Step 1: Write failing endpoint tests**

```ts
test('reports health without exposing configuration', async () => {
  const response = await app.inject({ method: 'GET', url: '/health' });
  expect(response.json()).toEqual({ status: 'ok' });
});

test('rejects unauthenticated job execution', async () => {
  expect((await app.inject({ method: 'POST', url: '/internal/run-jobs' })).statusCode).toBe(401);
});
```

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/integration/worker-auth.test.ts`  
Expected: operational endpoints are missing.

- [ ] **Step 3: Implement deployment contract**

Add health/readiness handling, protected job route, and worker entry that calls the same `runReminderJob`/`runDigestJob` services. Add a minimal multi-stage Node Dockerfile and Railway configuration with separate `web` and `worker` start commands. Document exact Railway variables, PostgreSQL migration command, webhook URL/secret configuration, and staging smoke test—without recording secret values.

- [ ] **Step 4: Run green and build production artifact**

Run: `pnpm vitest run tests/integration/worker-auth.test.ts && pnpm build`  
Expected: endpoint tests and build pass.

- [ ] **Step 5: Commit operational deployment files**

```bash
git add Dockerfile railway.toml scripts src README.md .env.example tests
git commit -m "feat: add Railway deployment and job runner"
```

## Task 14: Execute MVP regression suite and release documentation

**Files:**
- Create: `tests/integration/mvp-flow.test.ts`, `docs/release-checklist.md`
- Modify: `PROJECT.md` only if delivered behavior deviates from the documented MVP; `CHANGELOG.md`, `HANDOFF.md`, `OPEN_QUESTIONS.md`, `README.md`

**Interfaces:**
- The regression fixture executes group connect → onboarding → high-confidence message → author/admin confirmation → reminder → completion/reschedule/blocker → personal/admin digest → scoped deletion.

- [ ] **Step 1: Write the end-to-end failing MVP-flow test**

```ts
test('supports the complete approved MVP without leaking private task state', async () => {
  await connectGroupAsAdmin(); await onboardAssignee(); await sendHighConfidencePromise();
  await confirmAsAuthor(); await runReminderJob(dueNow); await completeAsAssignee();
  await runDigestJob(digestTime); await deleteChatAsAdmin();
  expect(fakeTelegram.groupMessages.join('\n')).not.toContain('просрочена');
});
```

- [ ] **Step 2: Run red, if any integration gap remains**

Run: `pnpm vitest run tests/integration/mvp-flow.test.ts`  
Expected: either a known gap fails or all previously completed work passes; record any unexpected result before correcting it.

- [ ] **Step 3: Close gaps with test-first fixes and document release operation**

Fix every failing scenario with a new focused red-green test before changing production code. Add a release checklist covering database backup, migration, Railway variables, Telegram webhook secret, setWebhook request, worker schedule, logs, rollback, and the staging smoke test. Update `CHANGELOG.md` and `HANDOFF.md` with actual verification results and remaining explicit decisions; add only genuinely unresolved product/technical questions to `OPEN_QUESTIONS.md`.

- [ ] **Step 4: Run the complete release gate**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`  
Expected: all commands exit 0. Then run the documented staging webhook smoke test with a non-production bot.

- [ ] **Step 5: Commit release readiness**

```bash
git add tests/integration/mvp-flow.test.ts docs/release-checklist.md README.md CHANGELOG.md HANDOFF.md OPEN_QUESTIONS.md PROJECT.md
git commit -m "test: verify Keepword MVP release flow"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1–4 establish service/webhook/group connection; Tasks 5–7 implement AI extraction, suggestions, authorization, confirmation, editing, duplicates, and statuses; Tasks 8–9 cover onboarding, invitations, commands, and manual fallback; Tasks 10–11 provide reminders/digests; Task 12 implements all chat modes and deletion; Tasks 13–14 provide deployment, regression, documentation, and verification.
- **Scope exclusions:** No task introduces a dashboard, historical chat retrieval, third-party task integration, file/voice analysis, billing, or auto-capture.
- **Safety coverage:** Database scope constraints, callback/token validation, administrator re-check, delivery idempotency, and the private-overdue rule are implemented and tested before release.
- **Consistency:** `CommitmentCandidate`, delivery idempotency, workspace/chat scope, and the `suggest | manual | silent_digest` chat modes are defined once and used across all dependent tasks.
