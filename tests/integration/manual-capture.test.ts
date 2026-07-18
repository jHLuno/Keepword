import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { CommitmentCandidate } from '../../src/domain/extraction.js';
import { chatMemberships, commitments, commitmentSuggestions, users } from '../../src/db/schema.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createManualCapture } from '../../src/services/manual-capture.js';
import { createCommitmentActionCallbackHandler } from '../../src/telegram/handlers/callback.js';
import { createPrivateUpdateHandler } from '../../src/telegram/handlers/private.js';
import { createFakeTelegram } from '../helpers/fake-telegram.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;

const forwardedPromise: CommitmentCandidate = {
  assignee_telegram_user_id: null,
  category: 'promise',
  confidence: 'high',
  description: 'Подготовить бюджет к пятнице.',
  due_at: null,
  due_date_text: 'к пятнице',
  is_commitment: true,
  needs_assignee_clarification: false,
  needs_due_date_clarification: false,
  reasoning_short: 'Автор обещает подготовить бюджет.',
  source_message_ids: [],
  title: 'Подготовить бюджет',
};

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('manual private capture', () => {
  test('creates a private confirmation card for a forwarded promise and defaults assignee to sender', async () => {
    const chat = await createConnectChat(database.db)({
      adminTelegramUserId: '9901',
      telegramChatId: '-1009901',
      timezone: 'UTC',
      title: 'Manual capture',
    });
    const senderTelegramUserId = 9902;
    await database.db.insert(users).values({ firstName: 'Aigerim', privateChatStartedAt: new Date(), telegramUserId: senderTelegramUserId });
    const sender = (await database.db.select().from(users).where(eq(users.telegramUserId, senderTelegramUserId)).limit(1))[0];
    if (!sender) throw new Error('Expected sender');
    await database.db.insert(chatMemberships).values({
      chatId: chat.chatId,
      notificationsConnectedAt: new Date(),
      notificationsEnabled: true,
      userId: sender.id,
      workspaceId: chat.workspaceId,
    });

    const privateCards: string[] = [];
    const capture = createManualCapture(database.db, {
      extractCandidate: () => Promise.resolve(forwardedPromise),
    }, 'callback-test-secret');

    await expect(capture.capturePrivateMessage({
      messenger: {
        sendPrivateSuggestion: ({ text }) => {
          privateCards.push(text);
          return Promise.resolve();
        },
      },
      sender: { firstName: 'Aigerim', telegramUserId: senderTelegramUserId },
      sentAt: new Date('2026-07-18T10:00:00.000Z'),
      telegramMessageId: '31',
      text: 'Я подготовлю бюджет к пятнице',
    })).resolves.toMatchObject({ status: 'suggested' });

    expect(privateCards).toEqual([expect.stringContaining('Я нашёл обязательство')]);
    const suggestion = (await database.db
      .select({ assigneeTelegramUserId: users.telegramUserId, status: commitmentSuggestions.status })
      .from(commitmentSuggestions)
      .innerJoin(users, eq(commitmentSuggestions.assigneeUserId, users.id))
      .where(and(eq(commitmentSuggestions.chatId, chat.chatId), eq(commitmentSuggestions.workspaceId, chat.workspaceId)))
      .limit(1))[0];
    expect(suggestion).toEqual({ assigneeTelegramUserId: senderTelegramUserId, status: 'pending' });
  });

  test('routes a forwarded message through the private handler and fake Telegram card', async () => {
    const chat = await createConnectChat(database.db)({
      adminTelegramUserId: '9905', telegramChatId: '-1009905', timezone: 'UTC', title: 'Forwarded capture',
    });
    const senderTelegramUserId = 9906;
    const sender = (await database.db.insert(users).values({
      firstName: 'Aigerim', privateChatStartedAt: new Date(), telegramUserId: senderTelegramUserId,
    }).returning())[0];
    if (!sender) throw new Error('Expected sender');
    await database.db.insert(chatMemberships).values({
      chatId: chat.chatId, notificationsEnabled: true, userId: sender.id, workspaceId: chat.workspaceId,
    });
    const handler = createPrivateUpdateHandler({
      database: database.db,
      manualCapture: createManualCapture(database.db, { extractCandidate: () => Promise.resolve(forwardedPromise) }, 'callback-test-secret'),
    });
    const fakeTelegram = createFakeTelegram();

    await fakeTelegram.telegramAdapterFactory(() => Promise.resolve(), undefined, handler).handleUpdate({
      payload: {
        message: {
          chat: { id: senderTelegramUserId, type: 'private' },
          date: 1_784_365_200,
          forward_origin: { chat: { id: Number(chat.telegramChatId) }, type: 'chat' },
          from: { first_name: 'Aigerim', id: senderTelegramUserId, is_bot: false },
          message_id: 33,
          text: 'Я подготовлю бюджет к пятнице',
        },
      },
      updateId: 9906,
    });

    expect(fakeTelegram.privateSuggestionReplies).toHaveLength(1);
    expect(fakeTelegram.privateSuggestionReplies[0]?.text).toContain('Я нашёл обязательство');
    expect(fakeTelegram.privateSuggestionReplies[0]?.replyToTelegramMessageId).toBe('33');
  });

  test('confirms a private capture only for its source author', async () => {
    const chat = await createConnectChat(database.db)({
      adminTelegramUserId: '9911',
      telegramChatId: '-1009911',
      timezone: 'UTC',
      title: 'Private confirmation',
    });
    const senderTelegramUserId = 9912;
    const sender = (await database.db.insert(users).values({
      firstName: 'Aigerim', privateChatStartedAt: new Date(), telegramUserId: senderTelegramUserId,
    }).returning())[0];
    if (!sender) throw new Error('Expected sender');
    await database.db.insert(chatMemberships).values({
      chatId: chat.chatId, notificationsEnabled: true, userId: sender.id, workspaceId: chat.workspaceId,
    });
    const cards: Readonly<{ replyMarkup: { inline_keyboard: { callback_data: string; text: string }[][] } }>[] = [];
    const capture = createManualCapture(database.db, { extractCandidate: () => Promise.resolve(forwardedPromise) }, 'callback-test-secret');
    await capture.capturePrivateMessage({
      messenger: { sendPrivateSuggestion: (card) => { cards.push(card); return Promise.resolve(); } },
      sender: { firstName: 'Aigerim', telegramUserId: senderTelegramUserId },
      sentAt: new Date('2026-07-18T10:00:00.000Z'), telegramMessageId: '32', text: 'Я подготовлю бюджет к пятнице',
    });
    const confirmData = cards[0]?.replyMarkup.inline_keyboard.flat().find((button) => button.text === 'Подтвердить')?.callback_data;
    if (!confirmData) throw new Error('Expected private confirm callback');
    const answers: string[] = [];
    const handler = createCommitmentActionCallbackHandler({ callbackSigningSecret: 'callback-test-secret', database: database.db });

    await handler({
      payload: {
        callback_query: {
          data: confirmData,
          from: { first_name: 'Aigerim', id: senderTelegramUserId },
          id: 'private-confirm',
          message: { chat: { id: senderTelegramUserId, type: 'private' } },
        },
      },
      updateId: 9912,
    }, { answerCallbackQuery: ({ text }) => { answers.push(text); return Promise.resolve(); } });

    const confirmed = await database.db.select().from(commitments).where(eq(commitments.chatId, chat.chatId));
    expect(confirmed).toHaveLength(1);
    expect(answers).toEqual(['Договорённость сохранена.']);
  });
});
