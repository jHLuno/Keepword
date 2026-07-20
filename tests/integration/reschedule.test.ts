import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { chatMemberships, commitments } from '../../src/db/schema.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createCommitmentRescheduleService } from '../../src/services/commitment-reschedule-sessions.js';
import { resolveDueDate } from '../../src/domain/relative-date.js';
import { createPrivateUpdateHandler } from '../../src/telegram/handlers/private.js';
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

test('accepts a natural relative deadline and rejects an unresolvable one', async () => {
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

  // An unresolvable phrase is rejected without consuming the session.
  await service.begin({ actorTelegramUserId: 9303, commitmentId: commitment.id, telegramChatId: '-1009303' });
  await expect(service.apply({ actor: { firstName: 'Daniyar', telegramUserId: 9303 }, dueDateText: 'как-нибудь потом' }))
    .rejects.toMatchObject({ code: 'RESCHEDULE_UNAVAILABLE' });

  // A relative phrase resolves to a concrete future dueAt and reopens the commitment.
  const result = await service.apply({ actor: { firstName: 'Daniyar', telegramUserId: 9303 }, dueDateText: 'завтра 18:00' });
  expect(result.status).toBe('open');
  expect(result.dueDateText).toBe('завтра 18:00');
  expect(result.dueAt).not.toBeNull();
  expect(result.dueAt!.getTime()).toBeGreaterThan(Date.now());
});

test('resolves Russian and English relative deadlines in the source chat timezone', () => {
  const reference = new Date('2026-07-20T03:00:00.000Z'); // 08:00 in Asia/Almaty
  const timezone = 'Asia/Almaty';

  expect(resolveDueDate('сегодня в 22:00', reference, timezone)?.toISOString()).toBe('2026-07-20T17:00:00.000Z');
  expect(resolveDueDate('сегодня 22:00', reference, timezone)?.toISOString()).toBe('2026-07-20T17:00:00.000Z');
  expect(resolveDueDate('завтра 18:00', reference, timezone)?.toISOString()).toBe('2026-07-21T13:00:00.000Z');
  expect(resolveDueDate('в понедельник 18:00', reference, timezone)?.toISOString()).toBe('2026-07-20T13:00:00.000Z');
  expect(resolveDueDate('today 22:00', reference, timezone)?.toISOString()).toBe('2026-07-20T17:00:00.000Z');
  expect(resolveDueDate('tomorrow 18:00', reference, timezone)?.toISOString()).toBe('2026-07-21T13:00:00.000Z');
});

test('keeps a reschedule session active when a recognized deadline is already past', async () => {
  const chat = await createConnectChat(database.db)({
    adminTelegramUserId: '9304',
    telegramChatId: '-1009304',
    timezone: 'Asia/Almaty',
    title: 'Reschedule past deadline test',
  });
  const membership = (await database.db.select({ userId: chatMemberships.userId }).from(chatMemberships)
    .where(and(eq(chatMemberships.chatId, chat.chatId), eq(chatMemberships.workspaceId, chat.workspaceId))).limit(1))[0];
  if (!membership) throw new Error('Expected membership');
  const commitment = (await database.db.insert(commitments).values({
    assigneeUserId: membership.userId, chatId: chat.chatId, status: 'overdue', title: 'Просроченное обещание', workspaceId: chat.workspaceId,
  }).returning())[0];
  if (!commitment) throw new Error('Expected commitment');
  const service = createCommitmentRescheduleService(database.db, () => Promise.resolve(false));
  await service.begin({ actorTelegramUserId: 9304, commitmentId: commitment.id, telegramChatId: '-1009304' });

  await expect(service.apply({ actor: { firstName: 'Daniyar', telegramUserId: 9304 }, dueDateText: 'сегодня 00:00' }))
    .rejects.toMatchObject({ code: 'RESCHEDULE_PAST_DUE_DATE' });
  await expect(service.apply({ actor: { firstName: 'Daniyar', telegramUserId: 9304 }, dueDateText: 'завтра 18:00' }))
    .resolves.toMatchObject({ status: 'open', dueDateText: 'завтра 18:00' });
});

test('explains a recognized past deadline in private chat and keeps it retryable', async () => {
  const chat = await createConnectChat(database.db)({
    adminTelegramUserId: '9305',
    telegramChatId: '-1009305',
    timezone: 'Asia/Almaty',
    title: 'Private reschedule reply test',
  });
  const membership = (await database.db.select({ userId: chatMemberships.userId }).from(chatMemberships)
    .where(and(eq(chatMemberships.chatId, chat.chatId), eq(chatMemberships.workspaceId, chat.workspaceId))).limit(1))[0];
  if (!membership) throw new Error('Expected membership');
  const commitment = (await database.db.insert(commitments).values({
    assigneeUserId: membership.userId, chatId: chat.chatId, status: 'overdue', title: 'Личная проверка срока', workspaceId: chat.workspaceId,
  }).returning())[0];
  if (!commitment) throw new Error('Expected commitment');
  const service = createCommitmentRescheduleService(database.db, () => Promise.resolve(false));
  await service.begin({ actorTelegramUserId: 9305, commitmentId: commitment.id, telegramChatId: '-1009305' });
  const replies: string[] = [];
  const handler = createPrivateUpdateHandler({ database: database.db });
  const send = (text: string, updateId: number) => handler({
    payload: { message: {
      chat: { id: 9305, type: 'private' },
      from: { first_name: 'Daniyar', id: 9305, is_bot: false, language_code: 'ru' },
      message_id: updateId,
      text,
    } },
    updateId,
  }, {
    sendPrivateMessage: ({ text: reply }) => { replies.push(reply); return Promise.resolve(); },
  });

  await send('сегодня 00:00', 1);
  expect(replies.at(-1)).toContain('уже прошло');
  expect(await service.hasActive(9305)).toBe(true);

  await send('завтра 18:00', 2);
  expect(replies.at(-1)).toBe('Новый срок сохранён.');
  expect(await service.hasActive(9305)).toBe(false);
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
