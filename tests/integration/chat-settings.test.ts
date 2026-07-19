import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { chats } from '../../src/db/schema.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { ChatSettingsError, createChatSettingsService } from '../../src/services/chat-settings.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;
let nextTelegramChatId = 220_000;

async function connectChat() {
  nextTelegramChatId += 1;
  return createConnectChat(database.db)({
    adminTelegramUserId: '220001',
    telegramChatId: String(nextTelegramChatId),
    timezone: 'UTC',
    title: 'Settings test chat',
  });
}

async function readChat(chatId: string) {
  return (await database.db.select().from(chats).where(eq(chats.id, chatId)).limit(1))[0];
}

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('chat settings subcommands', () => {
  test('a current admin can set language, timezone, and digest time', async () => {
    const connected = await connectChat();
    const settings = createChatSettingsService(database.db, () => Promise.resolve(true));
    const scope = { chatId: connected.chatId, requestedByTelegramUserId: '220001', workspaceId: connected.workspaceId };

    await expect(settings.setLanguage({ ...scope, language: 'ES' })).resolves.toBe('es');
    await expect(settings.setTimezone({ ...scope, timezone: 'Asia/Almaty' })).resolves.toBe('Asia/Almaty');
    await expect(settings.setDigestTime({ ...scope, time: '21:30' })).resolves.toBe('21:30');

    const chat = await readChat(connected.chatId);
    expect(chat?.language).toBe('es');
    expect(chat?.timezone).toBe('Asia/Almaty');
    expect(chat?.dailyDigestTime).toBe('21:30:00');
  });

  test('invalid values are rejected without changing the chat', async () => {
    const connected = await connectChat();
    const settings = createChatSettingsService(database.db, () => Promise.resolve(true));
    const scope = { chatId: connected.chatId, requestedByTelegramUserId: '220001', workspaceId: connected.workspaceId };

    await expect(settings.setLanguage({ ...scope, language: 'fr' })).rejects.toMatchObject({ code: 'INVALID_LANGUAGE' });
    await expect(settings.setTimezone({ ...scope, timezone: 'Not/AZone' })).rejects.toMatchObject({ code: 'INVALID_TIMEZONE' });
    await expect(settings.setDigestTime({ ...scope, time: '25:00' })).rejects.toMatchObject({ code: 'INVALID_DIGEST_TIME' });

    const chat = await readChat(connected.chatId);
    expect(chat?.language).toBe('auto');
    expect(chat?.timezone).toBe('UTC');
  });

  test('a non-admin cannot change settings', async () => {
    const connected = await connectChat();
    const settings = createChatSettingsService(database.db, () => Promise.resolve(false));
    const scope = { chatId: connected.chatId, requestedByTelegramUserId: '220999', workspaceId: connected.workspaceId };

    await expect(settings.setLanguage({ ...scope, language: 'ru' })).rejects.toBeInstanceOf(ChatSettingsError);
    const chat = await readChat(connected.chatId);
    expect(chat?.language).toBe('auto');
  });
});
