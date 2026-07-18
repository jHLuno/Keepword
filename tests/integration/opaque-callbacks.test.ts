import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createCallbackTokenService } from '../../src/services/callback-tokens.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createSuggestion } from '../../src/services/create-suggestion.js';
import { createMessagesRepository } from '../../src/repositories/messages.js';
import { chatMemberships } from '../../src/db/schema.js';
import { and, eq } from 'drizzle-orm';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('opaque callback tokens', () => {
  test('resolves a signed nonce to its pending suggestion without exposing the suggestion UUID', async () => {
    const connectedChat = await createConnectChat(database.db)({
      adminTelegramUserId: '9101',
      telegramChatId: '-1009101',
      timezone: 'UTC',
      title: 'Opaque callback test',
    });
    const source = await createMessagesRepository(database.db).persistCandidateSourceMessage({
      author: { firstName: 'Daniyar', telegramUserId: 9101 },
      chatId: connectedChat.chatId,
      sentAt: new Date('2026-07-18T09:00:00.000Z'),
      telegramMessageId: 1,
      text: 'Сегодня отправлю КП',
      workspaceId: connectedChat.workspaceId,
    });
    const membership = (
      await database.db
        .select({ userId: chatMemberships.userId })
        .from(chatMemberships)
        .where(and(eq(chatMemberships.chatId, connectedChat.chatId), eq(chatMemberships.workspaceId, connectedChat.workspaceId)))
        .limit(1)
    )[0];
    if (!membership) {
      throw new Error('Expected source author membership');
    }
    const suggestion = await createSuggestion(database.db)({
      assigneeUserId: membership.userId,
      chatId: connectedChat.chatId,
      confidence: 'high',
      description: null,
      dueAt: null,
      dueDateText: 'сегодня',
      needsAssigneeClarification: false,
      needsDueDateClarification: false,
      sourceMessageId: source.id,
      title: 'Отправить КП',
      workspaceId: connectedChat.workspaceId,
    });
    const callbacks = await createCallbackTokenService(database.db).issueSuggestionCallbacks({
      actions: ['confirm', 'edit', 'reject'],
      suggestionId: suggestion.id,
    });
    const confirmNonce = callbacks.confirm;
    if (!confirmNonce) {
      throw new Error('Expected confirm callback nonce');
    }

    expect(confirmNonce).not.toContain(suggestion.id);
    await expect(
      createCallbackTokenService(database.db).resolve({ action: 'confirm', nonce: confirmNonce }),
    ).resolves.toMatchObject({ kind: 'suggestion', suggestionId: suggestion.id });
    await expect(
      createCallbackTokenService(database.db).resolve({ action: 'edit', nonce: confirmNonce }),
    ).rejects.toMatchObject({ code: 'CALLBACK_UNAVAILABLE' });
  });
});
