import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type { CurrentChatAdminChecker } from './authorize-action.js';
import { chats as chatsTable } from '../db/schema.js';
import { createChatsRepository, type ChatMode } from '../repositories/chats.js';
import type { RepositoryDatabase } from '../repositories/database.js';
import { isChatLanguagePreference, type ChatLanguagePreference } from '../i18n/index.js';

export const chatModes = ['suggest', 'manual', 'silent_digest'] as const;

export type ChatSettingsErrorCode =
  | 'CHAT_UNAVAILABLE'
  | 'INVALID_CHAT_MODE'
  | 'INVALID_LANGUAGE'
  | 'INVALID_TIMEZONE'
  | 'INVALID_DIGEST_TIME'
  | 'UNAUTHORIZED';

export class ChatSettingsError extends Error {
  readonly code: ChatSettingsErrorCode;

  constructor(code: ChatSettingsErrorCode) {
    super(code);
    this.code = code;
  }
}

type BaseSettingInput = Readonly<{
  chatId: string;
  requestedByTelegramUserId: string;
  workspaceId: string;
}>;

export type SetChatModeInput = BaseSettingInput & Readonly<{ mode: string }>;
export type SetChatLanguageInput = BaseSettingInput & Readonly<{ language: string }>;
export type SetChatTimezoneInput = BaseSettingInput & Readonly<{ timezone: string }>;
export type SetChatDigestTimeInput = BaseSettingInput & Readonly<{ time: string }>;

export type ChatSettingsService = Readonly<{
  setMode: (input: SetChatModeInput) => Promise<ChatMode>;
  setLanguage: (input: SetChatLanguageInput) => Promise<ChatLanguagePreference>;
  setTimezone: (input: SetChatTimezoneInput) => Promise<string>;
  setDigestTime: (input: SetChatDigestTimeInput) => Promise<string>;
}>;

function isChatMode(mode: string): mode is ChatMode {
  return (chatModes as readonly string[]).includes(mode);
}

export function isValidTimezone(timezone: string): boolean {
  if (!timezone || timezone.length > 64) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const digestTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function createChatSettingsService<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
  isCurrentChatAdmin: CurrentChatAdminChecker,
): ChatSettingsService {
  const chats = createChatsRepository(database);

  async function requireAdminChat(input: BaseSettingInput) {
    const requestedByTelegramUserId = Number(input.requestedByTelegramUserId);
    if (!Number.isSafeInteger(requestedByTelegramUserId)) {
      throw new ChatSettingsError('UNAUTHORIZED');
    }
    const chat = await chats.findScopedChat({ chatId: input.chatId, workspaceId: input.workspaceId });
    if (!chat || !chat.isActive) {
      throw new ChatSettingsError('CHAT_UNAVAILABLE');
    }
    if (!(await isCurrentChatAdmin({
      telegramChatId: String(chat.telegramChatId),
      telegramUserId: requestedByTelegramUserId,
    }))) {
      throw new ChatSettingsError('UNAUTHORIZED');
    }
    return chat;
  }

  async function updateChat(chatId: string, workspaceId: string, values: Partial<typeof chatsTable.$inferInsert>) {
    await database
      .update(chatsTable)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(chatsTable.id, chatId), eq(chatsTable.workspaceId, workspaceId)));
  }

  return {
    async setMode(input) {
      if (!isChatMode(input.mode)) {
        throw new ChatSettingsError('INVALID_CHAT_MODE');
      }
      const chat = await requireAdminChat(input);
      await chats.setMode({ chatId: chat.id, mode: input.mode, workspaceId: chat.workspaceId });
      return input.mode;
    },

    async setLanguage(input) {
      const language = input.language.trim().toLowerCase();
      if (!isChatLanguagePreference(language)) {
        throw new ChatSettingsError('INVALID_LANGUAGE');
      }
      const chat = await requireAdminChat(input);
      await updateChat(chat.id, chat.workspaceId, { language });
      return language;
    },

    async setTimezone(input) {
      const timezone = input.timezone.trim();
      if (!isValidTimezone(timezone)) {
        throw new ChatSettingsError('INVALID_TIMEZONE');
      }
      const chat = await requireAdminChat(input);
      await updateChat(chat.id, chat.workspaceId, { timezone });
      return timezone;
    },

    async setDigestTime(input) {
      const time = input.time.trim();
      if (!digestTimePattern.test(time)) {
        throw new ChatSettingsError('INVALID_DIGEST_TIME');
      }
      const chat = await requireAdminChat(input);
      await updateChat(chat.id, chat.workspaceId, { dailyDigestTime: `${time}:00` });
      return time;
    },
  };
}
