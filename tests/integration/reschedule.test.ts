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

  await expect(service.apply({ actor: { firstName: 'Daniyar', telegramUserId: 9301 }, dueDateText: 'завтра' }))
    .resolves.toMatchObject({ dueDateText: 'завтра', status: 'open' });
});
