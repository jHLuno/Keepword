import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  chatMemberships,
  chats,
  commitmentSources,
  commitments,
  commitmentSuggestions,
  manualCaptureSources,
  notificationDeliveries,
  onboardingTokens,
  sourceMessages,
  users,
} from '../../src/db/schema.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { ChatDataDeletionError, createDeleteChatData } from '../../src/services/delete-chat-data.js';
import { createMessagesRepository } from '../../src/repositories/messages.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;
let nextTelegramChatId = 130_000;

async function countForChat(table: typeof sourceMessages | typeof commitmentSuggestions | typeof commitments | typeof commitmentSources | typeof notificationDeliveries | typeof onboardingTokens | typeof chatMemberships | typeof manualCaptureSources, chatId: string): Promise<number> {
  const rows = await database.db.select({ total: count() }).from(table).where(eq(table.chatId, chatId));
  return Number(rows[0]?.total ?? 0);
}

async function createPopulatedChat() {
  nextTelegramChatId += 1;
  const connected = await createConnectChat(database.db)({
    adminTelegramUserId: '130001',
    telegramChatId: String(nextTelegramChatId),
    timezone: 'UTC',
    title: 'Privacy test chat',
  });
  const admin = (await database.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.telegramUserId, 130001))
    .limit(1))[0];
  if (!admin) throw new Error('Expected admin');
  const source = await createMessagesRepository(database.db).persistCandidateSourceMessage({
    author: { firstName: 'Admin', telegramUserId: 130001 },
    chatId: connected.chatId,
    sentAt: new Date('2026-07-18T09:00:00.000Z'),
    telegramMessageId: 1,
    text: 'Полный текст рабочего сообщения',
    workspaceId: connected.workspaceId,
  });
  const suggestion = (await database.db.insert(commitmentSuggestions).values({
    assigneeUserId: admin.id,
    chatId: connected.chatId,
    confidence: 'high',
    needsAssigneeClarification: false,
    needsDueDateClarification: false,
    normalizedTitle: 'подготовить отчёт',
    sourceMessageId: source.id,
    title: 'Подготовить отчёт',
    workspaceId: connected.workspaceId,
  }).returning({ id: commitmentSuggestions.id }))[0];
  if (!suggestion) throw new Error('Expected suggestion');
  const commitment = (await database.db.insert(commitments).values({
    assigneeUserId: admin.id,
    chatId: connected.chatId,
    title: 'Подготовить отчёт',
    workspaceId: connected.workspaceId,
  }).returning({ id: commitments.id }))[0];
  if (!commitment) throw new Error('Expected commitment');
  await database.db.insert(commitmentSources).values({
    chatId: connected.chatId,
    commitmentId: commitment.id,
    sourceMessageId: source.id,
    workspaceId: connected.workspaceId,
  });
  await database.db.insert(notificationDeliveries).values({
    chatId: connected.chatId,
    commitmentId: commitment.id,
    idempotencyKey: `privacy:${connected.chatId}`,
    kind: 'reminder_due',
    userId: admin.id,
    workspaceId: connected.workspaceId,
  });
  await database.db.insert(onboardingTokens).values({
    chatId: connected.chatId,
    expiresAt: new Date('2026-07-19T09:00:00.000Z'),
    tokenHash: `token-${connected.chatId}`,
    workspaceId: connected.workspaceId,
  });
  await database.db.insert(manualCaptureSources).values({
    chatId: connected.chatId,
    privateTelegramMessageId: 2,
    senderTelegramUserId: 130001,
    workspaceId: connected.workspaceId,
  });
  return connected;
}

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('chat data deletion', () => {
  test('chat deletion removes chat-scoped messages, commitments, reminders, and onboarding tokens', async () => {
    const connected = await createPopulatedChat();
    const deleteChatData = createDeleteChatData(database.db, () => Promise.resolve(true));

    await deleteChatData({
      chatId: connected.chatId,
      requestedByTelegramUserId: '130001',
      workspaceId: connected.workspaceId,
    });

    await expect(Promise.all([
      countForChat(sourceMessages, connected.chatId),
      countForChat(commitmentSuggestions, connected.chatId),
      countForChat(commitments, connected.chatId),
      countForChat(commitmentSources, connected.chatId),
      countForChat(notificationDeliveries, connected.chatId),
      countForChat(onboardingTokens, connected.chatId),
      countForChat(chatMemberships, connected.chatId),
      countForChat(manualCaptureSources, connected.chatId),
    ])).resolves.toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    const deletedChat = (await database.db.select({ isActive: chats.isActive }).from(chats).where(and(
      eq(chats.id, connected.chatId),
      eq(chats.workspaceId, connected.workspaceId),
    )).limit(1))[0];
    expect(deletedChat).toEqual({ isActive: false });
  });

  test('requires current Telegram administrator authority even when the requester has an old admin membership', async () => {
    const connected = await createPopulatedChat();
    const deleteChatData = createDeleteChatData(database.db, () => Promise.resolve(false));

    await expect(deleteChatData({
      chatId: connected.chatId,
      requestedByTelegramUserId: '130001',
      workspaceId: connected.workspaceId,
    })).rejects.toBeInstanceOf(ChatDataDeletionError);
    expect(await countForChat(sourceMessages, connected.chatId)).toBe(1);
  });
});
