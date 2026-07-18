import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  chatMemberships,
  chats,
  commitments,
  commitmentSuggestions,
  notificationDeliveries,
  sourceMessages,
  suggestionEvents,
  users,
} from '../../src/db/schema.js';
import { createDigestJob } from '../../src/jobs/digests.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createFakeTelegram } from '../helpers/fake-telegram.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;
let nextTelegramChatId = 96_000;
let nextTelegramMessageId = 1;

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
  status?: 'blocked' | 'cancelled' | 'completed' | 'open' | 'overdue';
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

async function enableAdminDigest(fixture: DigestFixture): Promise<void> {
  await database.db.update(users).set({ privateChatStartedAt: new Date('2026-07-18T09:00:00.000Z') })
    .where(eq(users.id, fixture.owner.id));
  await database.db.update(chatMemberships).set({
    notificationsConnectedAt: new Date('2026-07-18T09:00:00.000Z'),
    notificationsEnabled: true,
  }).where(and(
    eq(chatMemberships.chatId, fixture.chatId),
    eq(chatMemberships.workspaceId, fixture.workspaceId),
    eq(chatMemberships.userId, fixture.owner.id),
  ));
}

async function addResolvedSuggestion(input: Readonly<{
  chatId: string;
  edited?: boolean;
  editedAt?: Date;
  eventAt: Date;
  eventType: 'confirmed' | 'rejected';
  suggestedAt?: Date;
  title: string;
  userId: string;
  workspaceId: string;
}>): Promise<void> {
  const messageId = nextTelegramMessageId++;
  const suggestedAt = input.suggestedAt ?? new Date(input.eventAt.getTime() - 2_000);
  const editedAt = input.editedAt ?? new Date(input.eventAt.getTime() - 500);
  const source = (await database.db.insert(sourceMessages).values({
    authorUserId: input.userId,
    chatId: input.chatId,
    messageText: 'masked test source',
    sentAt: new Date(suggestedAt.getTime() - 1_000),
    telegramMessageId: messageId,
    usedAsSource: true,
    workspaceId: input.workspaceId,
  }).returning({ id: sourceMessages.id }))[0];
  if (!source) throw new Error('Expected source message');
  const suggestion = (await database.db.insert(commitmentSuggestions).values({
    assigneeUserId: input.userId,
    chatId: input.chatId,
    confidence: 'high',
    needsAssigneeClarification: false,
    needsDueDateClarification: false,
    normalizedTitle: `${input.title}-${messageId}`.toLowerCase(),
    sourceMessageId: source.id,
    status: input.eventType === 'confirmed' ? 'confirmed' : 'rejected',
    title: input.title,
    workspaceId: input.workspaceId,
  }).returning({ id: commitmentSuggestions.id }))[0];
  if (!suggestion) throw new Error('Expected suggestion');
  await database.db.insert(suggestionEvents).values({
    actorUserId: input.userId,
    chatId: input.chatId,
    createdAt: suggestedAt,
    eventType: 'suggested',
    snapshot: { original: { title: input.title } },
    suggestionId: suggestion.id,
    workspaceId: input.workspaceId,
  });
  if (input.edited) {
    await database.db.insert(suggestionEvents).values({
      actorUserId: input.userId,
      chatId: input.chatId,
      createdAt: editedAt,
      eventType: 'edited',
      snapshot: { after: { title: input.title }, before: { title: input.title } },
      suggestionId: suggestion.id,
      workspaceId: input.workspaceId,
    });
  }
  await database.db.insert(suggestionEvents).values({
    actorUserId: input.userId,
    chatId: input.chatId,
    createdAt: input.eventAt,
    eventType: input.eventType,
    snapshot: { final: { title: input.title } },
    suggestionId: suggestion.id,
    workspaceId: input.workspaceId,
  });
}

async function addSameWorkspaceChat(fixture: DigestFixture): Promise<Readonly<{ chatId: string; workspaceId: string }>> {
  nextTelegramChatId += 1;
  const chat = (await database.db.insert(chats).values({
    dailyDigestTime: '18:00:00',
    telegramChatId: nextTelegramChatId,
    timezone: 'Asia/Almaty',
    title: 'Second digest test',
    workspaceId: fixture.workspaceId,
  }).returning({ id: chats.id, workspaceId: chats.workspaceId }))[0];
  if (!chat) throw new Error('Expected second chat');
  await database.db.insert(chatMemberships).values({
    chatId: chat.id,
    notificationsConnectedAt: new Date('2026-07-18T09:00:00.000Z'),
    notificationsEnabled: true,
    role: 'admin',
    userId: fixture.owner.id,
    workspaceId: fixture.workspaceId,
  });
  return { chatId: chat.id, workspaceId: chat.workspaceId };
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
    const runDigestJob = createDigestJob({ database: database.db, isCurrentChatAdmin: () => Promise.resolve(true), messenger: fixture.telegram });

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
    const runDigestJob = createDigestJob({ database: database.db, isCurrentChatAdmin: () => Promise.resolve(true), messenger: fixture.telegram });

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
    const runDigestJob = createDigestJob({ database: database.db, isCurrentChatAdmin: () => Promise.resolve(true), messenger: fixture.telegram });

    await runDigestJob(new Date('2026-07-18T13:00:00.000Z'));

    const messages = fixture.telegram.privateMessagesFor(fixture.owner.telegramUserId);
    expect(messages).toHaveLength(2);
    const adminDigest = messages.find((message) => message.includes('Риски команды'));
    expect(adminDigest).toContain('Просроченный риск');
    expect(adminDigest).toContain('Без срока');
    expect(adminDigest).not.toContain('Connected');
    expect(adminDigest).not.toContain('Not connected');
  });

  test('renders each source chat reliability only for a current admin and excludes ineligible commitments', async () => {
    const fixture = await createFixture();
    await enableAdminDigest(fixture);
    const otherChat = await addSameWorkspaceChat(fixture);
    await database.db.insert(chatMemberships).values({
      chatId: otherChat.chatId,
      userId: fixture.userA.id,
      workspaceId: otherChat.workspaceId,
    });
    const now = new Date('2026-07-18T13:00:00.000Z');
    await Promise.all([
      addCommitment({
        assigneeUserId: fixture.userA.id,
        chatId: fixture.chatId,
        completedAt: new Date('2026-07-10T12:00:00.000Z'),
        dueAt: new Date('2026-07-10T12:00:00.000Z'),
        status: 'completed',
        title: 'On time in first chat',
        workspaceId: fixture.workspaceId,
      }),
      addCommitment({
        assigneeUserId: fixture.userA.id,
        chatId: fixture.chatId,
        completedAt: new Date('2026-07-11T13:00:00.000Z'),
        dueAt: new Date('2026-07-11T12:00:00.000Z'),
        status: 'completed',
        title: 'Late in first chat',
        workspaceId: fixture.workspaceId,
      }),
      addCommitment({
        assigneeUserId: fixture.userA.id,
        chatId: fixture.chatId,
        dueAt: new Date('2026-07-12T12:00:00.000Z'),
        status: 'open',
        title: 'Overdue in first chat',
        workspaceId: fixture.workspaceId,
      }),
      addCommitment({
        assigneeUserId: fixture.userA.id,
        chatId: fixture.chatId,
        dueAt: new Date('2026-07-13T12:00:00.000Z'),
        status: 'cancelled',
        title: 'Cancelled in first chat',
        workspaceId: fixture.workspaceId,
      }),
      addCommitment({
        assigneeUserId: fixture.userA.id,
        chatId: fixture.chatId,
        status: 'open',
        title: 'No deadline in first chat',
        workspaceId: fixture.workspaceId,
      }),
      addCommitment({
        assigneeUserId: fixture.userA.id,
        chatId: fixture.chatId,
        completedAt: new Date('2026-06-18T12:59:58.000Z'),
        dueAt: new Date('2026-06-18T12:59:59.000Z'),
        status: 'completed',
        title: 'Outside 30 days',
        workspaceId: fixture.workspaceId,
      }),
      ...Array.from({ length: 3 }, (_, index) => addCommitment({
        assigneeUserId: fixture.userA.id,
        chatId: otherChat.chatId,
        completedAt: new Date(`2026-07-${14 + index}T11:00:00.000Z`),
        dueAt: new Date(`2026-07-${14 + index}T12:00:00.000Z`),
        status: 'completed',
        title: `Other chat ${index + 1}`,
        workspaceId: otherChat.workspaceId,
      })),
    ]);
    const runDigestJob = createDigestJob({
      database: database.db,
      isCurrentChatAdmin: ({ telegramChatId }) => Promise.resolve(telegramChatId === String(nextTelegramChatId - 1)),
      messenger: fixture.telegram,
    });

    await runDigestJob(now);

    const adminDigests = fixture.telegram.privateMessagesFor(fixture.owner.telegramUserId)
      .filter((message) => message.includes('📊 Риски команды'));
    expect(adminDigests).toHaveLength(1);
    expect(adminDigests[0]).toContain('🤝 Надёжность · последние 30 дней');
    expect(adminDigests[0]).toContain('Aigerim: 1/3 вовремя · 1 с опозданием · 1 риск');
    expect(adminDigests[0]).not.toContain('4/6 вовремя');
    expect(adminDigests[0]).not.toContain('Other chat 1');
    expect(adminDigests[0]).not.toContain('Cancelled in first chat');
  });

  test('renders chat-scoped calibration only in the matching admin digest', async () => {
    const fixture = await createFixture();
    await enableAdminDigest(fixture);
    const otherChat = await addSameWorkspaceChat(fixture);
    const now = new Date('2026-07-18T13:00:00.000Z');
    await Promise.all([
      ...Array.from({ length: 15 }, (_, index) => addResolvedSuggestion({
        chatId: fixture.chatId,
        eventAt: now,
        eventType: 'confirmed',
        title: `Без правок ${index + 1}`,
        userId: fixture.owner.id,
        workspaceId: fixture.workspaceId,
      })),
      ...Array.from({ length: 10 }, (_, index) => addResolvedSuggestion({
        chatId: fixture.chatId,
        edited: true,
        eventAt: now,
        eventType: 'confirmed',
        title: `С правкой ${index + 1}`,
        userId: fixture.owner.id,
        workspaceId: fixture.workspaceId,
      })),
      ...Array.from({ length: 5 }, (_, index) => addResolvedSuggestion({
        chatId: fixture.chatId,
        eventAt: now,
        eventType: 'rejected',
        title: `Отклонено ${index + 1}`,
        userId: fixture.owner.id,
        workspaceId: fixture.workspaceId,
      })),
      ...Array.from({ length: 30 }, (_, index) => addResolvedSuggestion({
        chatId: otherChat.chatId,
        eventAt: now,
        eventType: 'rejected',
        title: `Другой чат ${index + 1}`,
        userId: fixture.owner.id,
        workspaceId: fixture.workspaceId,
      })),
    ]);
    const runDigestJob = createDigestJob({ database: database.db, isCurrentChatAdmin: () => Promise.resolve(true), messenger: fixture.telegram });

    await runDigestJob(now);

    const adminDigests = fixture.telegram.privateMessagesFor(fixture.owner.telegramUserId)
      .filter((message) => message.includes('📊 Риски команды'));
    expect(adminDigests).toHaveLength(2);
    expect(adminDigests).toEqual(expect.arrayContaining([
      expect.stringContaining('Без правок: 15 (50%)'),
      expect.stringContaining('После правок: 10 (33%)'),
      expect.stringContaining('Отклонено: 5 (17%)'),
      expect.stringContaining('Отклонено: 30 (100%)'),
    ]));
    expect(adminDigests.find((message) => message.includes('Без правок: 15 (50%)'))).not.toContain('Отклонено: 30 (100%)');
  });

  test('hides calibration before 30 in-window decisions and ignores older or future decisions', async () => {
    const fixture = await createFixture();
    await enableAdminDigest(fixture);
    const now = new Date('2026-07-18T13:00:00.000Z');
    await Promise.all([
      ...Array.from({ length: 29 }, (_, index) => addResolvedSuggestion({
        chatId: fixture.chatId,
        eventAt: now,
        eventType: 'confirmed',
        title: `Recent ${index + 1}`,
        userId: fixture.owner.id,
        workspaceId: fixture.workspaceId,
      })),
      addResolvedSuggestion({
        chatId: fixture.chatId,
        eventAt: new Date('2026-04-18T12:59:59.000Z'),
        eventType: 'rejected',
        title: 'Old decision',
        userId: fixture.owner.id,
        workspaceId: fixture.workspaceId,
      }),
      addResolvedSuggestion({
        chatId: fixture.chatId,
        eventAt: new Date('2026-07-18T13:00:01.000Z'),
        eventType: 'rejected',
        title: 'Future decision',
        userId: fixture.owner.id,
        workspaceId: fixture.workspaceId,
      }),
    ]);
    const runDigestJob = createDigestJob({ database: database.db, isCurrentChatAdmin: () => Promise.resolve(true), messenger: fixture.telegram });

    await runDigestJob(now);

    const firstAdminDigest = fixture.telegram.privateMessagesFor(fixture.owner.telegramUserId)
      .find((message) => message.includes('📊 Риски команды'));
    expect(firstAdminDigest).not.toContain('Точность Keepword');
  });

  test('counts an in-window confirmation as edited when its edit predates the calibration window', async () => {
    const fixture = await createFixture();
    await enableAdminDigest(fixture);
    const now = new Date('2026-07-18T13:00:00.000Z');
    const oldEditAt = new Date('2026-04-19T12:59:59.000Z');
    await Promise.all([
      ...Array.from({ length: 29 }, (_, index) => addResolvedSuggestion({
        chatId: fixture.chatId,
        eventAt: now,
        eventType: 'confirmed',
        title: `Unedited ${index + 1}`,
        userId: fixture.owner.id,
        workspaceId: fixture.workspaceId,
      })),
      addResolvedSuggestion({
        chatId: fixture.chatId,
        edited: true,
        editedAt: oldEditAt,
        eventAt: now,
        eventType: 'confirmed',
        suggestedAt: new Date(oldEditAt.getTime() - 1_000),
        title: 'Edited before window',
        userId: fixture.owner.id,
        workspaceId: fixture.workspaceId,
      }),
    ]);
    const runDigestJob = createDigestJob({ database: database.db, isCurrentChatAdmin: () => Promise.resolve(true), messenger: fixture.telegram });

    await runDigestJob(now);

    const adminDigest = fixture.telegram.privateMessagesFor(fixture.owner.telegramUserId)
      .find((message) => message.includes('📊 Риски команды'));
    expect(adminDigest).toContain('Без правок: 29 (97%)');
    expect(adminDigest).toContain('После правок: 1 (3%)');
    expect(adminDigest).not.toContain('Без правок: 30 (100%)');
  });

  test('never discloses calibration to a non-admin personal digest or a group', async () => {
    const fixture = await createFixture();
    const now = new Date('2026-07-18T13:00:00.000Z');
    await Promise.all(Array.from({ length: 30 }, (_, index) => addResolvedSuggestion({
      chatId: fixture.chatId,
      eventAt: now,
      eventType: 'confirmed',
      title: `Admin-only ${index + 1}`,
      userId: fixture.owner.id,
      workspaceId: fixture.workspaceId,
    })));
    const runDigestJob = createDigestJob({ database: database.db, isCurrentChatAdmin: () => Promise.resolve(true), messenger: fixture.telegram });

    await runDigestJob(now);

    const memberMessages = fixture.telegram.privateMessagesFor(fixture.userA.telegramUserId);
    expect(memberMessages).toHaveLength(1);
    expect(memberMessages[0]).not.toContain('Точность Keepword');
    expect(fixture.telegram.groupMessages).not.toContain('Точность Keepword');
  });

  test('does not send an admin calibration digest when current Telegram admin access is gone', async () => {
    const fixture = await createFixture();
    await enableAdminDigest(fixture);
    const now = new Date('2026-07-18T13:00:00.000Z');
    await Promise.all(Array.from({ length: 30 }, (_, index) => addResolvedSuggestion({
      chatId: fixture.chatId,
      eventAt: now,
      eventType: 'confirmed',
      title: `Former admin ${index + 1}`,
      userId: fixture.owner.id,
      workspaceId: fixture.workspaceId,
    })));
    const runDigestJob = createDigestJob({
      database: database.db,
      isCurrentChatAdmin: () => Promise.resolve(false),
      messenger: fixture.telegram,
    });

    await runDigestJob(now);

    const formerAdminMessages = fixture.telegram.privateMessagesFor(fixture.owner.telegramUserId);
    expect(formerAdminMessages).toHaveLength(1);
    expect(formerAdminMessages[0]).not.toContain('Точность Keepword');
    await database.db.update(chatMemberships).set({ notificationsEnabled: false }).where(and(
      eq(chatMemberships.chatId, fixture.chatId),
      eq(chatMemberships.workspaceId, fixture.workspaceId),
      eq(chatMemberships.userId, fixture.owner.id),
    ));
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
      isCurrentChatAdmin: () => Promise.resolve(true),
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
