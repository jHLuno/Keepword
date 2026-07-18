import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { chatMemberships, commitments, notificationDeliveries, users } from '../../src/db/schema.js';
import { createReminderJob } from '../../src/jobs/reminders.js';
import { createDeliveriesRepository } from '../../src/repositories/deliveries.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createFakeTelegram } from '../helpers/fake-telegram.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;
let nextTelegramChatId = 95_000;

type Fixture = Readonly<{
  assigneeTelegramUserId: number;
  chatId: string;
  commitmentId: string;
  dueAt: Date;
  telegram: ReturnType<typeof createFakeTelegram>;
}>;

async function createFixture(input: Readonly<{
  dueAt: Date;
  onboarded?: boolean;
  timezone?: string;
}>): Promise<Fixture> {
  nextTelegramChatId += 1;
  const assigneeTelegramUserId = 9_501;
  const chat = await createConnectChat(database.db)({
    adminTelegramUserId: String(assigneeTelegramUserId),
    telegramChatId: String(nextTelegramChatId),
    timezone: input.timezone ?? 'UTC',
    title: 'Reminder test',
  });
  const membership = (
    await database.db
      .select({ userId: chatMemberships.userId })
      .from(chatMemberships)
      .where(and(eq(chatMemberships.chatId, chat.chatId), eq(chatMemberships.workspaceId, chat.workspaceId)))
      .limit(1)
  )[0];
  if (!membership) {
    throw new Error('Expected assignee membership');
  }
  if (input.onboarded ?? true) {
    await database.db
      .update(chatMemberships)
      .set({ notificationsConnectedAt: new Date('2026-07-18T09:00:00.000Z'), notificationsEnabled: true })
      .where(eq(chatMemberships.userId, membership.userId));
    await database.db
      .update(users)
      .set({ privateChatStartedAt: new Date('2026-07-18T09:00:00.000Z') })
      .where(eq(users.id, membership.userId));
  }
  const commitment = (
    await database.db
      .insert(commitments)
      .values({
        assigneeUserId: membership.userId,
        chatId: chat.chatId,
        dueAt: input.dueAt,
        dueDateText: 'сегодня',
        title: 'Отправить КП клиенту',
        workspaceId: chat.workspaceId,
      })
      .returning()
  )[0];
  if (!commitment) {
    throw new Error('Expected commitment');
  }
  return {
    assigneeTelegramUserId,
    chatId: chat.chatId,
    commitmentId: commitment.id,
    dueAt: input.dueAt,
    telegram: createFakeTelegram(),
  };
}

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('private commitment reminders', () => {
  test('sends a due reminder only to an onboarded assignee', async () => {
    const dueNow = new Date('2026-07-18T12:00:00.000Z');
    const fixture = await createFixture({ dueAt: dueNow });
    const runReminderJob = createReminderJob({
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      messenger: fixture.telegram,
    });

    await runReminderJob(dueNow);

    expect(fixture.telegram.privateMessagesFor(fixture.assigneeTelegramUserId)).toHaveLength(1);
    expect(fixture.telegram.groupMessages).toHaveLength(0);
  });

  test('does not deliver the same reminder twice when the job repeats', async () => {
    const dueNow = new Date('2026-07-18T13:00:00.000Z');
    await createFixture({ dueAt: dueNow });
    const messages: string[] = [];
    const runReminderJob = createReminderJob({
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      messenger: { sendPrivateMessage: ({ text }) => { messages.push(text); return Promise.resolve(); } },
    });

    await runReminderJob(dueNow);
    await runReminderJob(dueNow);

    expect(messages).toHaveLength(1);
  });

  test('does not send an overdue reminder to an assignee without private onboarding', async () => {
    const dueAt = new Date('2026-07-17T10:00:00.000Z');
    const fixture = await createFixture({ dueAt, onboarded: false });
    const messages: string[] = [];
    const runReminderJob = createReminderJob({
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      messenger: { sendPrivateMessage: ({ text }) => { messages.push(text); return Promise.resolve(); } },
    });

    await runReminderJob(new Date('2026-07-18T10:00:00.000Z'));

    expect(messages).toHaveLength(0);
    expect((await database.db.select().from(commitments).where(eq(commitments.id, fixture.commitmentId)))[0])
      .toMatchObject({ status: 'overdue' });
  });

  test('records a safe delivery failure and retries the claimed reminder', async () => {
    const dueNow = new Date('2026-07-18T14:00:00.000Z');
    const fixture = await createFixture({ dueAt: dueNow });
    let failuresRemaining = 1;
    const messages: string[] = [];
    const runReminderJob = createReminderJob({
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      messenger: { sendPrivateMessage: ({ text }) => {
        if (failuresRemaining > 0) {
          failuresRemaining -= 1;
          return Promise.reject(new Error('Fake Telegram delivery failure'));
        }
        messages.push(text);
        return Promise.resolve();
      } },
    });

    await runReminderJob(dueNow);
    await runReminderJob(dueNow);

    expect(messages).toHaveLength(1);
    expect((await database.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.commitmentId, fixture.commitmentId)))[0])
      .toMatchObject({ status: 'sent', errorCode: null });
  });

  test('does not retry after Telegram succeeds when marking delivery sent fails', async () => {
    const dueNow = new Date('2026-07-18T15:00:00.000Z');
    const fixture = await createFixture({ dueAt: dueNow });
    const deliveries = createDeliveriesRepository(database.db);
    let telegramSends = 0;
    const failingPersistenceConfig = {
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      deliveries: { ...deliveries, markSent: () => Promise.reject(new Error('Database persistence failed')) },
      messenger: { sendPrivateMessage: () => { telegramSends += 1; return Promise.resolve(); } },
    };
    const sendWithFailedPersistence = createReminderJob(failingPersistenceConfig);

    await sendWithFailedPersistence(dueNow);
    expect(telegramSends).toBe(1);
    expect((await database.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.commitmentId, fixture.commitmentId)))[0])
      .toMatchObject({ errorCode: null, status: 'processing' });

    const retry = createReminderJob({
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      messenger: { sendPrivateMessage: () => { telegramSends += 1; return Promise.resolve(); } },
    });
    await retry(dueNow);
    expect(telegramSends).toBe(1);
  });
});
