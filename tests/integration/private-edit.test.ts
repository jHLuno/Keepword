import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { chatMemberships, commitmentSuggestions } from '../../src/db/schema.js';
import { createMessagesRepository } from '../../src/repositories/messages.js';
import { createSuggestion } from '../../src/services/create-suggestion.js';
import { createSuggestionEditSessionService } from '../../src/services/suggestion-edit-sessions.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createPrivateUpdateHandler } from '../../src/telegram/handlers/private.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('private suggestion editing', () => {
  test('applies validated private edit input to an authorized pending suggestion', async () => {
    const chat = await createConnectChat(database.db)({
      adminTelegramUserId: '9201',
      telegramChatId: '-1009201',
      timezone: 'UTC',
      title: 'Private edit test',
    });
    const source = await createMessagesRepository(database.db).persistCandidateSourceMessage({
      author: { firstName: 'Daniyar', telegramUserId: 9201 },
      chatId: chat.chatId,
      sentAt: new Date('2026-07-18T09:00:00.000Z'),
      telegramMessageId: 1,
      text: 'Сегодня отправлю КП',
      workspaceId: chat.workspaceId,
    });
    const membership = (
      await database.db
        .select({ userId: chatMemberships.userId })
        .from(chatMemberships)
        .where(and(eq(chatMemberships.chatId, chat.chatId), eq(chatMemberships.workspaceId, chat.workspaceId)))
        .limit(1)
    )[0];
    if (!membership) {
      throw new Error('Expected source author membership');
    }
    const suggestion = await createSuggestion(database.db)({
      assigneeUserId: membership.userId,
      chatId: chat.chatId,
      confidence: 'high',
      description: 'Старое описание',
      dueAt: null,
      dueDateText: 'сегодня',
      needsAssigneeClarification: false,
      needsDueDateClarification: false,
      sourceMessageId: source.id,
      title: 'Отправить КП',
      workspaceId: chat.workspaceId,
    });
    await createSuggestionEditSessionService(database.db).begin({
      actorUserId: membership.userId,
      suggestionId: suggestion.id,
    });
    const sentMessages: string[] = [];
    const handler = createPrivateUpdateHandler({
      database: database.db,
      isCurrentChatAdmin: () => Promise.resolve(false),
    });

    await handler(
      {
        payload: {
          message: {
            chat: { id: 9201, type: 'private' },
            from: { first_name: 'Daniyar', id: 9201, is_bot: false },
            message_id: 2,
            text: 'title: Обновить КП\ndescription: Новое описание\ndue: завтра',
          },
          update_id: 92_001,
        },
        updateId: 92_001,
      },
      { sendPrivateMessage: ({ text }) => { sentMessages.push(text); return Promise.resolve(); } },
    );

    const edited = (
      await database.db
        .select()
        .from(commitmentSuggestions)
        .where(eq(commitmentSuggestions.id, suggestion.id))
        .limit(1)
    )[0];
    expect(edited).toMatchObject({ description: 'Новое описание', dueDateText: 'завтра', title: 'Обновить КП' });
    expect(sentMessages).toEqual(['Изменения сохранены. Подтвердите карточку в группе.']);
  });

  test('does not accept edit input in a group chat', async () => {
    const sentMessages: string[] = [];
    const handler = createPrivateUpdateHandler({
      database: database.db,
      isCurrentChatAdmin: () => Promise.resolve(false),
    });

    await handler(
      {
        payload: {
          message: {
            chat: { id: -1009201, type: 'supergroup' },
            from: { first_name: 'Daniyar', id: 9201, is_bot: false },
            message_id: 3,
            text: 'title: Нельзя менять в группе',
          },
          update_id: 92_002,
        },
        updateId: 92_002,
      },
      { sendPrivateMessage: ({ text }) => { sentMessages.push(text); return Promise.resolve(); } },
    );

    expect(sentMessages).toEqual([]);
  });
});
