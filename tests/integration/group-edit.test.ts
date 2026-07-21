import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { chatMemberships, commitmentSuggestions } from '../../src/db/schema.js';
import { createMessagesRepository } from '../../src/repositories/messages.js';
import { createCallbackTokenService } from '../../src/services/callback-tokens.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createSuggestion } from '../../src/services/create-suggestion.js';
import { createOnboardingInvitationService } from '../../src/services/onboarding-invitation.js';
import { createCommitmentActionCallbackHandler } from '../../src/telegram/handlers/callback.js';
import { createGroupUpdateHandler } from '../../src/telegram/handlers/group.js';
import { renderSuggestion } from '../../src/telegram/messages.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

const callbackSigningSecret = 'group-edit-test-secret';
let database: PgliteTestDatabase;

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('group suggestion editing', () => {
  test('accepts only the source author reply to the exact group instruction and posts a revised card', async () => {
    const chat = await createConnectChat(database.db)({
      adminTelegramUserId: '9301', telegramChatId: '-1009301', timezone: 'Asia/Almaty', title: 'Group edit test',
    });
    const source = await createMessagesRepository(database.db).persistCandidateSourceMessage({
      author: { firstName: 'Daniyar', telegramUserId: 9301 }, chatId: chat.chatId,
      sentAt: new Date('2026-07-20T09:00:00.000Z'), telegramMessageId: 1,
      text: 'Сегодня отправлю КП', workspaceId: chat.workspaceId,
    });
    const membership = (await database.db.select({ userId: chatMemberships.userId }).from(chatMemberships)
      .where(and(eq(chatMemberships.chatId, chat.chatId), eq(chatMemberships.workspaceId, chat.workspaceId))).limit(1))[0];
    if (!membership) throw new Error('Expected source author membership');
    const suggestion = await createSuggestion(database.db)({
      assigneeUserId: membership.userId, chatId: chat.chatId, confidence: 'high', description: null,
      dueAt: null, dueDateText: 'сегодня', language: 'ru', needsAssigneeClarification: false,
      needsDueDateClarification: false, sourceMessageId: source.id, title: 'Отправить КП', workspaceId: chat.workspaceId,
    });
    const nonces = await createCallbackTokenService(database.db).issueSuggestionCallbacks({
      actions: ['confirm', 'edit', 'reject'], suggestionId: suggestion.id,
    });
    if (!nonces.edit) throw new Error('Expected edit callback');
    const editCallback = renderSuggestion('ru', { dueDateText: 'сегодня', id: suggestion.id, title: 'Отправить КП' }, {
      confirm: nonces.confirm!, edit: nonces.edit, reject: nonces.reject!,
    }, callbackSigningSecret).replyMarkup.inline_keyboard[0]![1]!.callback_data;
    const removedCards: string[] = [];
    const callbackHandler = createCommitmentActionCallbackHandler({ callbackSigningSecret, database: database.db });
    await callbackHandler({
      payload: { callback_query: {
        data: editCallback, from: { first_name: 'Daniyar', id: 9301 }, id: 'edit-callback',
        message: { chat: { id: -1009301, type: 'supergroup' }, message_id: 20 },
      } }, updateId: 1,
    }, {
      answerCallbackQuery: () => Promise.resolve(),
      editCallbackMessage: ({ telegramMessageId }) => { removedCards.push(telegramMessageId); return Promise.resolve(); },
      sendGroupEditInstruction: () => Promise.resolve('21'),
    });
    expect(removedCards).toEqual(['20']);

    const revisedCards: string[] = [];
    const groupHandler = createGroupUpdateHandler({
      botUsername: 'keepword_test_bot', callbackSigningSecret, connectChat: createConnectChat(database.db),
      database: database.db, onboardingInvitations: createOnboardingInvitationService(database.db),
    });
    const messenger = {
      sendClarificationRequest: () => Promise.resolve(),
      sendOnboardingCard: () => Promise.resolve(),
      sendSuggestionReply: ({ text }: { text: string }) => { revisedCards.push(text); return Promise.resolve(); },
    };
    await groupHandler({
      payload: { message: {
        chat: { id: -1009301, type: 'supergroup' }, date: 1_785_000_000,
        from: { first_name: 'Other', id: 9302, is_bot: false }, message_id: 22,
        reply_to_message: { date: 1_785_000_000, from: { first_name: 'Keepword', id: 1, is_bot: true }, message_id: 21, text: 'edit' },
        text: 'название: Нельзя менять',
      } }, updateId: 2,
    }, messenger);
    expect(revisedCards).toEqual([]);

    await groupHandler({
      payload: { message: {
        chat: { id: -1009301, type: 'supergroup' }, date: 1_785_000_000,
        from: { first_name: 'Daniyar', id: 9301, is_bot: false }, message_id: 23,
        reply_to_message: { date: 1_785_000_000, from: { first_name: 'Keepword', id: 1, is_bot: true }, message_id: 21, text: 'edit' },
        text: 'название: Отправить обновлённое КП\nсрок: завтра 18:00',
      } }, updateId: 3,
    }, messenger);
    const edited = (await database.db.select().from(commitmentSuggestions).where(eq(commitmentSuggestions.id, suggestion.id)).limit(1))[0];
    expect(edited).toMatchObject({ dueDateText: 'завтра 18:00', title: 'Отправить обновлённое КП' });
    expect(revisedCards).toHaveLength(1);
  });
});
