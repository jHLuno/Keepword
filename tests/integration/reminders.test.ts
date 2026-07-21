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
        createdAt: new Date(input.dueAt.getTime() - 24 * 60 * 60 * 1_000),
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
  test('sends an upcoming reminder ten minutes before an onboarded assignee deadline', async () => {
    const dueAt = new Date('2026-07-18T12:10:00.000Z');
    const fixture = await createFixture({ dueAt });
    const runReminderJob = createReminderJob({
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      messenger: fixture.telegram,
    });

    await runReminderJob(new Date('2026-07-18T12:00:00.000Z'));

    expect(fixture.telegram.privateMessagesFor(fixture.assigneeTelegramUserId)).toHaveLength(1);
    expect(fixture.telegram.groupMessages).toHaveLength(0);
  });

  test('does not send a second reminder at the deadline after the upcoming reminder', async () => {
    const dueAt = new Date('2026-07-18T13:10:00.000Z');
    const fixture = await createFixture({ dueAt });
    const runReminderJob = createReminderJob({
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      messenger: fixture.telegram,
    });

    await runReminderJob(new Date('2026-07-18T13:00:00.000Z'));
    await runReminderJob(dueAt);

    expect(fixture.telegram.privateMessagesFor(fixture.assigneeTelegramUserId)).toHaveLength(1);
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

  test('does not retry a reminder when Telegram rejects after sending begins', async () => {
    const dueAt = new Date('2026-07-18T14:10:00.000Z');
    const fixture = await createFixture({ dueAt });
    let telegramAttempts = 0;
    const runReminderJob = createReminderJob({
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      messenger: { sendPrivateMessage: ({ text }) => {
        void text;
        telegramAttempts += 1;
        return Promise.reject(new Error('Telegram may have accepted the reminder'));
      } },
    });

    await runReminderJob(new Date('2026-07-18T14:00:00.000Z'));
    await runReminderJob(new Date('2026-07-18T14:00:00.000Z'));

    expect(telegramAttempts).toBe(1);
    expect((await database.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.commitmentId, fixture.commitmentId)))[0])
      .toMatchObject({ status: 'processing', errorCode: null });
  });

  test('retries when starting delivery fails before Telegram is called', async () => {
    const dueAt = new Date('2026-07-18T14:40:00.000Z');
    const fixture = await createFixture({ dueAt });
    const deliveries = createDeliveriesRepository(database.db);
    let telegramSends = 0;
    const failedStartConfig = {
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      deliveries: { ...deliveries, markSending: () => Promise.reject(new Error('Could not start delivery')) },
      messenger: { sendPrivateMessage: () => { telegramSends += 1; return Promise.resolve(); } },
    };
    const withFailedStart = createReminderJob(failedStartConfig);

    await withFailedStart(new Date('2026-07-18T14:30:00.000Z'));
    expect(telegramSends).toBe(0);
    expect((await database.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.commitmentId, fixture.commitmentId)))[0])
      .toMatchObject({ errorCode: 'DELIVERY_START_FAILED', status: 'failed' });

    const retry = createReminderJob({
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      messenger: { sendPrivateMessage: () => { telegramSends += 1; return Promise.resolve(); } },
    });
    await retry(new Date('2026-07-18T14:30:00.000Z'));

    expect(telegramSends).toBe(1);
  });

  test('does not retry after Telegram succeeds when marking delivery sent fails', async () => {
    const dueAt = new Date('2026-07-18T15:10:00.000Z');
    const fixture = await createFixture({ dueAt });
    const deliveries = createDeliveriesRepository(database.db);
    let telegramSends = 0;
    const failingPersistenceConfig = {
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      deliveries: { ...deliveries, markSent: () => Promise.reject(new Error('Database persistence failed')) },
      messenger: { sendPrivateMessage: () => { telegramSends += 1; return Promise.resolve(); } },
    };
    const sendWithFailedPersistence = createReminderJob(failingPersistenceConfig);

    await sendWithFailedPersistence(new Date('2026-07-18T15:00:00.000Z'));
    expect(telegramSends).toBe(1);
    expect((await database.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.commitmentId, fixture.commitmentId)))[0])
      .toMatchObject({ errorCode: null, status: 'processing' });

    const retry = createReminderJob({
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      messenger: { sendPrivateMessage: () => { telegramSends += 1; return Promise.resolve(); } },
    });
    await retry(new Date('2026-07-18T15:00:00.000Z'));
    expect(telegramSends).toBe(1);
  });
});
