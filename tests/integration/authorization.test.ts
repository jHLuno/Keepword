import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { chatMemberships, commitmentSources, commitmentSuggestions, commitments } from '../../src/db/schema.js';
import { createCommitmentActionCallbackHandler } from '../../src/telegram/handlers/callback.js';
import { renderSuggestion } from '../../src/telegram/messages.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createMessagesRepository } from '../../src/repositories/messages.js';
import { createSuggestion } from '../../src/services/create-suggestion.js';
import { createCallbackTokenService } from '../../src/services/callback-tokens.js';
import { buildApp } from '../../src/app.js';
import { createFakeTelegram } from '../helpers/fake-telegram.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

const callbackSigningSecret = 'callback-test-secret';

let database: PgliteTestDatabase;
let telegramChatId = 70_000;

type Fixture = Readonly<{
  callbackData: string;
  chatId: string;
  telegramChatId: number;
  workspaceId: string;
}>;

type CallbackResult = Readonly<{
  answers: string[];
}>;

function firstRow<Row>(rows: readonly Row[]): Row {
  const row = rows[0];
  if (!row) {
    throw new Error('Expected a database row');
  }
  return row;
}

async function createFixture(): Promise<Fixture> {
  telegramChatId += 1;
  const chat = await createConnectChat(database.db)({
    adminTelegramUserId: '8101',
    telegramChatId: String(telegramChatId),
    timezone: 'UTC',
    title: 'Authorization test chat',
  });
  const messages = createMessagesRepository(database.db);
  const source = await messages.persistCandidateSourceMessage({
    author: { firstName: 'Daniyar', telegramUserId: 8101 },
    chatId: chat.chatId,
    sentAt: new Date('2026-07-18T09:00:00.000Z'),
    telegramMessageId: 1,
    text: 'Сегодня отправлю КП клиенту',
    workspaceId: chat.workspaceId,
  });
  await messages.persistCandidateSourceMessage({
    author: { firstName: 'Participant', telegramUserId: 8102 },
    chatId: chat.chatId,
    sentAt: new Date('2026-07-18T09:01:00.000Z'),
    telegramMessageId: 2,
    text: 'Я читаю карточку',
    workspaceId: chat.workspaceId,
  });
  const sourceAuthor = firstRow(
    await database.db
      .select({ userId: chatMemberships.userId })
      .from(chatMemberships)
      .where(
        and(
          eq(chatMemberships.workspaceId, chat.workspaceId),
          eq(chatMemberships.chatId, chat.chatId),
        ),
      )
      .limit(1),
  );
  const suggestion = await createSuggestion(database.db)({
    assigneeUserId: sourceAuthor.userId,
    chatId: chat.chatId,
    confidence: 'high',
    language: 'ru',
    description: null,
    dueAt: null,
    dueDateText: 'сегодня',
    needsAssigneeClarification: false,
    needsDueDateClarification: false,
    sourceMessageId: source.id,
    title: 'Отправить КП клиенту',
    workspaceId: chat.workspaceId,
  });
  const callbackNonces = await createCallbackTokenService(database.db).issueSuggestionCallbacks({
    actions: ['confirm', 'edit', 'reject'],
    suggestionId: suggestion.id,
  });
  if (!callbackNonces.confirm || !callbackNonces.edit || !callbackNonces.reject) {
    throw new Error('Expected callback nonces');
  }
  const callbackData = renderSuggestion(
    'ru',
    { dueDateText: 'сегодня', id: suggestion.id, title: 'Отправить КП клиенту' },
    { confirm: callbackNonces.confirm, edit: callbackNonces.edit, reject: callbackNonces.reject },
    callbackSigningSecret,
  ).replyMarkup.inline_keyboard[0]?.[0]?.callback_data;

  if (!callbackData) {
    throw new Error('Expected a confirm callback');
  }

  return { callbackData, chatId: chat.chatId, telegramChatId, workspaceId: chat.workspaceId };
}

async function countCommitments(): Promise<number> {
  const rows = await database.db.select({ total: count() }).from(commitments);
  return Number(rows[0]?.total ?? 0);
}

async function getSuggestionStatus(fixture: Fixture): Promise<string> {
  const row = firstRow(
    await database.db
      .select({ status: commitmentSuggestions.status })
      .from(commitmentSuggestions)
      .where(
        and(
          eq(commitmentSuggestions.workspaceId, fixture.workspaceId),
          eq(commitmentSuggestions.chatId, fixture.chatId),
        ),
      )
      .limit(1),
  );
  return row.status;
}

async function callbackAs(
  fixture: Fixture,
  actorTelegramUserId: number,
  callbackData: string,
  currentAdminIds: readonly number[] = [],
): Promise<CallbackResult> {
  const answers: string[] = [];
  const handler = createCommitmentActionCallbackHandler({
    callbackSigningSecret,
    database: database.db,
    isCurrentChatAdmin: ({ telegramChatId: requestedChatId, telegramUserId }) =>
      Promise.resolve(requestedChatId === String(fixture.telegramChatId) && currentAdminIds.includes(telegramUserId)),
  });

  await handler(
    {
      payload: {
        callback_query: {
          data: callbackData,
          from: { language_code: 'ru', first_name: 'Callback user', id: actorTelegramUserId, is_bot: false },
          id: `callback-${actorTelegramUserId}`,
          message: {
            chat: { id: fixture.telegramChatId, type: 'supergroup' },
            message_id: 99,
          },
        },
      },
      updateId: actorTelegramUserId,
    },
    {
      answerCallbackQuery: ({ text }) => {
        answers.push(text);
        return Promise.resolve();
      },
    },
  );

  return { answers };
}

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('suggestion callback authorization', () => {
  test('allows the source author to confirm their suggestion', async () => {
    const fixture = await createFixture();

    await callbackAs(fixture, 8101, fixture.callbackData);

    expect(await getSuggestionStatus(fixture)).toBe('confirmed');
    expect(await countCommitments()).toBe(1);
    const sourceLinks = await database.db
      .select({ commitmentId: commitmentSources.commitmentId })
      .from(commitmentSources)
      .where(
        and(
          eq(commitmentSources.workspaceId, fixture.workspaceId),
          eq(commitmentSources.chatId, fixture.chatId),
        ),
      );
    expect(sourceLinks).toHaveLength(1);
  });

  test('allows a current Telegram administrator to confirm a suggestion', async () => {
    const fixture = await createFixture();

    await callbackAs(fixture, 8102, fixture.callbackData, [8102]);

    expect(await getSuggestionStatus(fixture)).toBe('confirmed');
    expect(await countCommitments()).toBe(2);
  });

  test('rejects a normal participant confirming another persons suggestion', async () => {
    const fixture = await createFixture();

    const result = await callbackAs(fixture, 8102, fixture.callbackData);

    expect(result.answers).toContain('У вас нет прав на это действие.');
    expect(await getSuggestionStatus(fixture)).toBe('pending');
  });

  test('does not consume a callback token when an ordinary participant is denied', async () => {
    const fixture = await createFixture();

    const denied = await callbackAs(fixture, 8102, fixture.callbackData);
    const confirmed = await callbackAs(fixture, 8101, fixture.callbackData);

    expect(denied.answers).toContain('У вас нет прав на это действие.');
    expect(confirmed.answers).toContain('Договорённость сохранена.');
    expect(await getSuggestionStatus(fixture)).toBe('confirmed');
  });

  test('rejects malformed and replayed callbacks without creating another commitment', async () => {
    const fixture = await createFixture();

    const malformed = await callbackAs(fixture, 8101, 'kw:confirm:not-a-uuid:bad');
    const forged = await callbackAs(
      fixture,
      8101,
      fixture.callbackData.replace(/:[A-Za-z0-9_-]{16}$/, ':forged_signature'),
    );
    await callbackAs(fixture, 8101, fixture.callbackData);
    const replay = await callbackAs(fixture, 8101, fixture.callbackData);

    expect(malformed.answers).toContain('Действие недоступно.');
    expect(forged.answers).toContain('Действие недоступно.');
    expect(replay.answers).toContain('Действие недоступно.');
    expect(await countCommitments()).toBe(4);
  });

  test('converts a pending suggestion exactly once when confirm callbacks race', async () => {
    const fixture = await createFixture();
    const commitmentsBefore = await countCommitments();

    const results = await Promise.all([
      callbackAs(fixture, 8101, fixture.callbackData),
      callbackAs(fixture, 8101, fixture.callbackData),
    ]);

    expect(results.flatMap((result) => result.answers)).toContain('Договорённость сохранена.');
    expect(results.flatMap((result) => result.answers)).toContain('Действие недоступно.');
    expect(await countCommitments()).toBe(commitmentsBefore + 1);
  });

  test('routes callback updates through the fake Telegram adapter', async () => {
    const fixture = await createFixture();
    const fakeTelegram = createFakeTelegram({ currentAdminTelegramUserIds: [8101] });
    const app = buildApp(
      {
        callbackSigningSecret,
        databaseUrl: 'postgres://unused/test',
        openRouterApiKey: 'unused',
        port: 3_000,
        telegramBotToken: 'unused',
        telegramBotUsername: 'keepword_test_bot',
        telegramWebhookSecret: 'callback-webhook-secret',
        workerSecret: 'unused',
      },
      { database: database.db, telegramAdapterFactory: fakeTelegram.telegramAdapterFactory },
    );

    const response = await app.inject({
      headers: { 'x-telegram-bot-api-secret-token': 'callback-webhook-secret' },
      method: 'POST',
      payload: {
        callback_query: {
          data: fixture.callbackData,
          from: { language_code: 'ru', first_name: 'Daniyar', id: 8101, is_bot: false },
          id: 'callback-webhook-id',
          message: { chat: { id: fixture.telegramChatId, type: 'supergroup' }, message_id: 99 },
        },
        update_id: 99_001,
      },
      url: '/telegram/webhook',
    });

    expect(response.statusCode).toBe(200);
    expect(fakeTelegram.callbackAnswers).toEqual(['Договорённость сохранена.']);
    await app.close();
  });
});
