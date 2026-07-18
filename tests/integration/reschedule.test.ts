import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { chatMemberships, commitments } from '../../src/db/schema.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createCommitmentRescheduleService } from '../../src/services/commitment-reschedule-sessions.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

test('reschedules an overdue commitment only for its assignee and reopens it with a new due date', async () => {
  const chat = await createConnectChat(database.db)({
    adminTelegramUserId: '9301',
    telegramChatId: '-1009301',
    timezone: 'UTC',
    title: 'Reschedule test',
  });
  const membership = (
    await database.db
      .select({ userId: chatMemberships.userId })
      .from(chatMemberships)
      .where(and(eq(chatMemberships.chatId, chat.chatId), eq(chatMemberships.workspaceId, chat.workspaceId)))
      .limit(1)
  )[0];
  if (!membership) {
    throw new Error('Expected membership');
  }
  const commitment = (
    await database.db
      .insert(commitments)
      .values({
        assigneeUserId: membership.userId,
        chatId: chat.chatId,
        dueDateText: 'вчера',
        status: 'overdue',
        title: 'Отправить КП',
        workspaceId: chat.workspaceId,
      })
      .returning()
  )[0];
  if (!commitment) {
    throw new Error('Expected commitment');
  }
  const service = createCommitmentRescheduleService(database.db, () => Promise.resolve(false));
  await service.begin({ actorTelegramUserId: 9301, commitmentId: commitment.id, telegramChatId: '-1009301' });

  const futureDueAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
  await expect(service.apply({ actor: { firstName: 'Daniyar', telegramUserId: 9301 }, dueDateText: futureDueAt }))
    .resolves.toMatchObject({ dueDateText: futureDueAt, dueAt: new Date(futureDueAt), status: 'open' });
});

test('rejects a reschedule due time that is not a future ISO timestamp', async () => {
  const chat = await createConnectChat(database.db)({
    adminTelegramUserId: '9303',
    telegramChatId: '-1009303',
    timezone: 'UTC',
    title: 'Reschedule validation test',
  });
  const membership = (await database.db.select({ userId: chatMemberships.userId }).from(chatMemberships)
    .where(and(eq(chatMemberships.chatId, chat.chatId), eq(chatMemberships.workspaceId, chat.workspaceId))).limit(1))[0];
  if (!membership) throw new Error('Expected membership');
  const commitment = (await database.db.insert(commitments).values({
    assigneeUserId: membership.userId, chatId: chat.chatId, status: 'overdue', title: 'Проверить договор', workspaceId: chat.workspaceId,
  }).returning())[0];
  if (!commitment) throw new Error('Expected commitment');
  const service = createCommitmentRescheduleService(database.db, () => Promise.resolve(false));
  await service.begin({ actorTelegramUserId: 9303, commitmentId: commitment.id, telegramChatId: '-1009303' });

  await expect(service.apply({ actor: { firstName: 'Daniyar', telegramUserId: 9303 }, dueDateText: 'завтра' }))
    .rejects.toMatchObject({ code: 'RESCHEDULE_UNAVAILABLE' });
});

test('supersedes an earlier reschedule session for the same Telegram actor', async () => {
  const chat = await createConnectChat(database.db)({
    adminTelegramUserId: '9302',
    telegramChatId: '-1009302',
    timezone: 'UTC',
    title: 'Reschedule supersession test',
  });
  const membership = (await database.db.select({ userId: chatMemberships.userId }).from(chatMemberships)
    .where(and(eq(chatMemberships.chatId, chat.chatId), eq(chatMemberships.workspaceId, chat.workspaceId))).limit(1))[0];
  if (!membership) throw new Error('Expected membership');
  const createOverdue = (title: string) => database.db.insert(commitments).values({
    assigneeUserId: membership.userId, chatId: chat.chatId, dueDateText: 'вчера', status: 'overdue', title, workspaceId: chat.workspaceId,
  }).returning();
  const [firstRows, secondRows] = await Promise.all([createOverdue('Первое'), createOverdue('Второе')]);
  const first = firstRows[0];
  const second = secondRows[0];
  if (!first || !second) throw new Error('Expected commitments');
  const service = createCommitmentRescheduleService(database.db, () => Promise.resolve(false));
  await service.begin({ actorTelegramUserId: 9302, commitmentId: first.id, telegramChatId: '-1009302' });
  await service.begin({ actorTelegramUserId: 9302, commitmentId: second.id, telegramChatId: '-1009302' });

  const futureDueAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
  await service.apply({ actor: { firstName: 'Daniyar', telegramUserId: 9302 }, dueDateText: futureDueAt });

  const rows = await database.db.select().from(commitments).where(eq(commitments.chatId, chat.chatId));
  expect(rows.find((row) => row.id === first.id)).toMatchObject({ dueDateText: 'вчера', status: 'overdue' });
  expect(rows.find((row) => row.id === second.id)).toMatchObject({ dueDateText: futureDueAt, dueAt: new Date(futureDueAt), status: 'open' });
});
