import { count } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildApp } from '../../src/app.js';
import { chatMemberships, chats, onboardingTokens, workspaces } from '../../src/db/schema.js';
import { createFakeTelegram, type FakeTelegramOptions } from '../helpers/fake-telegram.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;

const webhookSecret = 'webhook-test-secret';

const botAddedToGroupUpdate = {
  update_id: 2_001,
  my_chat_member: {
    chat: {
      id: -1_001_234_567_890,
      title: 'Case Lab Team',
      type: 'supergroup',
    },
    date: 1_752_000_000,
    from: {
      first_name: 'Ada',
      id: 7_001,
      is_bot: false,
    },
    new_chat_member: {
      status: 'member',
      user: {
        first_name: 'Keepword',
        id: 9_001,
        is_bot: true,
      },
    },
    old_chat_member: {
      status: 'left',
      user: {
        first_name: 'Keepword',
        id: 9_001,
        is_bot: true,
      },
    },
  },
} as const;

function buildWebhookApp(options?: FakeTelegramOptions) {
  const fakeTelegram = createFakeTelegram(options);
  const app = buildApp(
    {
      databaseUrl: 'postgres://unused/test',
      openAiApiKey: 'unused',
      port: 3_000,
      telegramBotToken: 'unused',
      telegramBotUsername: 'keepword_test_bot',
      telegramWebhookSecret: webhookSecret,
      workerSecret: 'unused',
    },
    {
      database: database.db,
      telegramAdapterFactory: fakeTelegram.telegramAdapterFactory,
    },
  );

  return { app, fakeTelegram };
}

async function countRows(table: typeof chats | typeof workspaces | typeof chatMemberships | typeof onboardingTokens) {
  const rows = await database.db.select({ total: count() }).from(table);
  return Number(rows[0]?.total ?? 0);
}

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('Telegram webhook', () => {
  test('rejects a webhook with an invalid secret before dispatching the update', async () => {
    const { app, fakeTelegram } = buildWebhookApp();

    const response = await app.inject({
      method: 'POST',
      payload: botAddedToGroupUpdate,
      url: '/telegram/webhook',
    });

    expect(response.statusCode).toBe(401);
    expect(fakeTelegram.handledUpdateIds).toEqual([]);
    await app.close();
  });

  test('connects a new group once and ignores a repeated update', async () => {
    const { app, fakeTelegram } = buildWebhookApp();
    const request = {
      headers: { 'x-telegram-bot-api-secret-token': webhookSecret },
      method: 'POST' as const,
      payload: botAddedToGroupUpdate,
      url: '/telegram/webhook',
    };

    expect((await app.inject(request)).statusCode).toBe(200);
    expect((await app.inject(request)).statusCode).toBe(200);

    expect(await countRows(chats)).toBe(1);
    expect(await countRows(workspaces)).toBe(1);
    expect(await countRows(chatMemberships)).toBe(1);
    expect(await countRows(onboardingTokens)).toBe(1);
    expect(fakeTelegram.handledUpdateIds).toEqual([botAddedToGroupUpdate.update_id]);
    expect(fakeTelegram.onboardingCards).toHaveLength(1);

    const card = fakeTelegram.onboardingCards[0];
    expect(card?.text).toContain('только в новых сообщениях');
    expect(card?.onboardingDeepLink).toMatch(
      /^https:\/\/t\.me\/keepword_test_bot\?start=join_[A-Za-z0-9_-]+$/,
    );
    expect(card?.onboardingDeepLink).not.toContain(String(botAddedToGroupUpdate.my_chat_member.chat.id));

    await app.close();
  });

  test('retries a failed dispatch and suppresses only the later duplicate', async () => {
    const { app, fakeTelegram } = buildWebhookApp({ failuresBeforeSuccess: 1 });
    const retryUpdate = { ...botAddedToGroupUpdate, update_id: 2_002 };
    const request = {
      headers: { 'x-telegram-bot-api-secret-token': webhookSecret },
      method: 'POST' as const,
      payload: retryUpdate,
      url: '/telegram/webhook',
    };

    expect((await app.inject(request)).statusCode).toBe(500);
    expect(fakeTelegram.handledUpdateIds).toEqual([retryUpdate.update_id]);

    expect((await app.inject(request)).statusCode).toBe(200);
    expect(fakeTelegram.handledUpdateIds).toEqual([retryUpdate.update_id, retryUpdate.update_id]);

    expect((await app.inject(request)).statusCode).toBe(200);
    expect(fakeTelegram.handledUpdateIds).toEqual([retryUpdate.update_id, retryUpdate.update_id]);

    await app.close();
  });
});
