import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { chatMemberships, chats, commitments, notificationDeliveries, users } from '../../src/db/schema.js';
import { createDigestJob } from '../../src/jobs/digests.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createFakeTelegram } from '../helpers/fake-telegram.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;
let nextTelegramChatId = 96_000;

type ConnectedUser = Readonly<{
  id: string;
  telegramUserId: number;
}>;

type DigestFixture = Readonly<{
  chatId: string;
  owner: ConnectedUser;
  userA: ConnectedUser;
  userB: ConnectedUser;
  workspaceId: string;
  telegram: ReturnType<typeof createFakeTelegram>;
}>;

async function addConnectedMember(input: Readonly<{
  chatId: string;
  firstName: string;
  telegramUserId: number;
  workspaceId: string;
}>): Promise<ConnectedUser> {
  const user = (await database.db.insert(users).values({
    firstName: input.firstName,
    privateChatStartedAt: new Date('2026-07-18T09:00:00.000Z'),
    telegramUserId: input.telegramUserId,
  }).returning({ id: users.id, telegramUserId: users.telegramUserId }))[0];
  if (!user) {
    throw new Error('Expected user');
  }
  await database.db.insert(chatMemberships).values({
    chatId: input.chatId,
    notificationsConnectedAt: new Date('2026-07-18T09:00:00.000Z'),
    notificationsEnabled: true,
    userId: user.id,
    workspaceId: input.workspaceId,
  });
  return user;
}

async function createFixture(): Promise<DigestFixture> {
  nextTelegramChatId += 1;
  const ownerTelegramUserId = nextTelegramChatId;
  const chat = await createConnectChat(database.db)({
    adminTelegramUserId: String(ownerTelegramUserId),
    telegramChatId: String(nextTelegramChatId),
    timezone: 'Asia/Almaty',
    title: 'Digest test',
  });
  await database.db.update(chats).set({ dailyDigestTime: '18:00:00' }).where(eq(chats.id, chat.chatId));
  const owner = (await database.db
    .select({ id: users.id, telegramUserId: users.telegramUserId })
    .from(users)
    .innerJoin(chatMemberships, and(eq(chatMemberships.userId, users.id), eq(chatMemberships.chatId, chat.chatId)))
    .where(eq(chatMemberships.role, 'admin'))
    .limit(1))[0];
  if (!owner) {
    throw new Error('Expected chat owner');
  }
  const userA = await addConnectedMember({
    chatId: chat.chatId,
    firstName: 'Aigerim',
    telegramUserId: nextTelegramChatId + 10_000,
    workspaceId: chat.workspaceId,
  });
  const userB = await addConnectedMember({
    chatId: chat.chatId,
    firstName: 'Baurzhan',
    telegramUserId: nextTelegramChatId + 20_000,
    workspaceId: chat.workspaceId,
  });
  return { chatId: chat.chatId, owner, userA, userB, workspaceId: chat.workspaceId, telegram: createFakeTelegram() };
}

async function addCommitment(input: Readonly<{
  assigneeUserId: string;
  chatId: string;
  completedAt?: Date;
  dueAt?: Date;
  status?: 'completed' | 'open' | 'overdue';
  title: string;
  workspaceId: string;
}>): Promise<string> {
  const commitment = (await database.db.insert(commitments).values({
    assigneeUserId: input.assigneeUserId,
    chatId: input.chatId,
    completedAt: input.completedAt,
    dueAt: input.dueAt,
    status: input.status ?? 'open',
    title: input.title,
    workspaceId: input.workspaceId,
  }).returning({ id: commitments.id }))[0];
  if (!commitment) {
    throw new Error('Expected commitment');
  }
  return commitment.id;
}

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('daily digests', () => {
  test('personal digest includes only the recipient commitments', async () => {
    const fixture = await createFixture();
    await addCommitment({
      assigneeUserId: fixture.userA.id,
      chatId: fixture.chatId,
      dueAt: new Date('2026-07-19T04:00:00.000Z'),
      title: 'Подготовить смету',
      workspaceId: fixture.workspaceId,
    });
    await addCommitment({
      assigneeUserId: fixture.userB.id,
      chatId: fixture.chatId,
      dueAt: new Date('2026-07-19T04:00:00.000Z'),
      title: 'Чужая задача',
      workspaceId: fixture.workspaceId,
    });
    const runDigestJob = createDigestJob({ database: database.db, messenger: fixture.telegram });

    await runDigestJob(new Date('2026-07-18T13:00:00.000Z'));

    const messages = fixture.telegram.privateMessagesFor(fixture.userA.telegramUserId);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Подготовить смету');
    expect(messages[0]).not.toContain('Чужая задача');
    expect(messages[0]).toContain('Срок: завтра');
  });

  test('uses each chat timezone and sends once per recipient and local date', async () => {
    const fixture = await createFixture();
    await addCommitment({
      assigneeUserId: fixture.userA.id,
      chatId: fixture.chatId,
      dueAt: new Date('2026-07-19T04:00:00.000Z'),
      title: 'Проверить договор',
      workspaceId: fixture.workspaceId,
    });
    const runDigestJob = createDigestJob({ database: database.db, messenger: fixture.telegram });

    await runDigestJob(new Date('2026-07-18T12:00:00.000Z'));
    const firstRun = await runDigestJob(new Date('2026-07-18T13:00:00.000Z'));
    await runDigestJob(new Date('2026-07-18T13:00:00.000Z'));

    expect(firstRun.delivered).toBe(2);
    expect(fixture.telegram.privateMessagesFor(fixture.userA.telegramUserId)).toHaveLength(1);
  });

  test('admin digest reports aggregate risk titles without notification delivery state', async () => {
    const fixture = await createFixture();
    await database.db.update(users).set({ privateChatStartedAt: new Date('2026-07-18T09:00:00.000Z') }).where(eq(users.id, fixture.owner.id));
    await database.db.update(chatMemberships).set({
      notificationsConnectedAt: new Date('2026-07-18T09:00:00.000Z'),
      notificationsEnabled: true,
    }).where(eq(chatMemberships.userId, fixture.owner.id));
    await addCommitment({
      assigneeUserId: fixture.userA.id,
      chatId: fixture.chatId,
      status: 'overdue',
      title: 'Просроченный риск',
      workspaceId: fixture.workspaceId,
    });
    await addCommitment({
      assigneeUserId: fixture.userB.id,
      chatId: fixture.chatId,
      title: 'Без срока',
      workspaceId: fixture.workspaceId,
    });
    const runDigestJob = createDigestJob({ database: database.db, messenger: fixture.telegram });

    await runDigestJob(new Date('2026-07-18T13:00:00.000Z'));

    const messages = fixture.telegram.privateMessagesFor(fixture.owner.telegramUserId);
    expect(messages).toHaveLength(2);
    const adminDigest = messages.find((message) => message.includes('Риски команды'));
    expect(adminDigest).toContain('Просроченный риск');
    expect(adminDigest).toContain('Без срока');
    expect(adminDigest).not.toContain('Connected');
    expect(adminDigest).not.toContain('Not connected');
  });

  test('does not retry a digest when Telegram rejects after sending begins', async () => {
    const fixture = await createFixture();
    await database.db.update(chatMemberships).set({ notificationsEnabled: false }).where(eq(chatMemberships.userId, fixture.userB.id));
    await addCommitment({
      assigneeUserId: fixture.userA.id,
      chatId: fixture.chatId,
      dueAt: new Date('2026-07-19T04:00:00.000Z'),
      title: 'Проверить договор',
      workspaceId: fixture.workspaceId,
    });
    let telegramAttempts = 0;
    const runDigestJob = createDigestJob({
      database: database.db,
      messenger: {
        sendPrivateMessage: () => {
          telegramAttempts += 1;
          return Promise.reject(new Error('Telegram may have accepted the digest'));
        },
      },
    });

    await runDigestJob(new Date('2026-07-18T13:00:00.000Z'));
    await runDigestJob(new Date('2026-07-18T13:00:00.000Z'));

    expect(telegramAttempts).toBe(1);
    expect((await database.db.select({ status: notificationDeliveries.status }).from(notificationDeliveries).where(eq(notificationDeliveries.chatId, fixture.chatId)))[0])
      .toEqual({ status: 'processing' });
  });
});
