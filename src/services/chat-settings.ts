import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type { CurrentChatAdminChecker } from './authorize-action.js';
import { createChatsRepository, type ChatMode } from '../repositories/chats.js';
import type { RepositoryDatabase } from '../repositories/database.js';

export const chatModes = ['suggest', 'manual', 'silent_digest'] as const;

export type ChatSettingsErrorCode = 'CHAT_UNAVAILABLE' | 'INVALID_CHAT_MODE' | 'UNAUTHORIZED';

export class ChatSettingsError extends Error {
  readonly code: ChatSettingsErrorCode;

  constructor(code: ChatSettingsErrorCode) {
    super(code);
    this.code = code;
  }
}

export type SetChatModeInput = Readonly<{
  chatId: string;
  mode: string;
  requestedByTelegramUserId: string;
  workspaceId: string;
}>;

export type ChatSettingsService = Readonly<{
  setMode: (input: SetChatModeInput) => Promise<ChatMode>;
}>;

function isChatMode(mode: string): mode is ChatMode {
  return (chatModes as readonly string[]).includes(mode);
}

export function createChatSettingsService<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
  isCurrentChatAdmin: CurrentChatAdminChecker,
): ChatSettingsService {
  const chats = createChatsRepository(database);

  return {
    async setMode(input) {
      if (!isChatMode(input.mode)) {
        throw new ChatSettingsError('INVALID_CHAT_MODE');
      }
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
      await chats.setMode({ chatId: chat.id, mode: input.mode, workspaceId: chat.workspaceId });
      return input.mode;
    },
  };
}
