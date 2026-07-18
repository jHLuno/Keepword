import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import {
  chatMemberships,
  chats,
  commitmentSuggestions,
  commitments,
  manualCaptureSources,
  notificationDeliveries,
  onboardingTokens,
  sourceMessages,
  suggestionEvents,
} from '../db/schema.js';
import type { RepositoryDatabase } from '../repositories/database.js';
import type { CurrentChatAdminChecker } from './authorize-action.js';

export class ChatDataDeletionError extends Error {
  readonly code: 'CHAT_UNAVAILABLE' | 'UNAUTHORIZED';

  constructor(code: 'CHAT_UNAVAILABLE' | 'UNAUTHORIZED') {
    super(code);
    this.code = code;
  }
}

export type DeleteChatData = (input: Readonly<{
  chatId: string;
  requestedByTelegramUserId: string;
  workspaceId: string;
}>) => Promise<void>;

export function createDeleteChatData<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
  isCurrentChatAdmin: CurrentChatAdminChecker,
): DeleteChatData {
  return async (input) => {
    const requestedByTelegramUserId = Number(input.requestedByTelegramUserId);
    if (!Number.isSafeInteger(requestedByTelegramUserId)) {
      throw new ChatDataDeletionError('UNAUTHORIZED');
    }
    const chat = (await database
      .select({ id: chats.id, isActive: chats.isActive, telegramChatId: chats.telegramChatId, workspaceId: chats.workspaceId })
      .from(chats)
      .where(and(eq(chats.id, input.chatId), eq(chats.workspaceId, input.workspaceId)))
      .limit(1))[0];
    if (!chat || !chat.isActive) {
      throw new ChatDataDeletionError('CHAT_UNAVAILABLE');
    }
    if (!(await isCurrentChatAdmin({
      telegramChatId: String(chat.telegramChatId),
      telegramUserId: requestedByTelegramUserId,
    }))) {
      throw new ChatDataDeletionError('UNAUTHORIZED');
    }

    await database.transaction(async (transaction) => {
      const deactivated = await transaction
        .update(chats)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(chats.id, input.chatId),
          eq(chats.workspaceId, input.workspaceId),
          eq(chats.isActive, true),
        ))
        .returning({ id: chats.id });
      if (deactivated.length !== 1) {
        throw new ChatDataDeletionError('CHAT_UNAVAILABLE');
      }
      await transaction.delete(notificationDeliveries).where(and(
        eq(notificationDeliveries.chatId, input.chatId),
        eq(notificationDeliveries.workspaceId, input.workspaceId),
      ));
      await transaction.delete(onboardingTokens).where(and(
        eq(onboardingTokens.chatId, input.chatId),
        eq(onboardingTokens.workspaceId, input.workspaceId),
      ));
      await transaction.delete(manualCaptureSources).where(and(
        eq(manualCaptureSources.chatId, input.chatId),
        eq(manualCaptureSources.workspaceId, input.workspaceId),
      ));
      await transaction.delete(suggestionEvents).where(and(
        eq(suggestionEvents.chatId, input.chatId),
        eq(suggestionEvents.workspaceId, input.workspaceId),
      ));
      await transaction.delete(commitmentSuggestions).where(and(
        eq(commitmentSuggestions.chatId, input.chatId),
        eq(commitmentSuggestions.workspaceId, input.workspaceId),
      ));
      await transaction.delete(commitments).where(and(
        eq(commitments.chatId, input.chatId),
        eq(commitments.workspaceId, input.workspaceId),
      ));
      await transaction.delete(sourceMessages).where(and(
        eq(sourceMessages.chatId, input.chatId),
        eq(sourceMessages.workspaceId, input.workspaceId),
      ));
      await transaction.delete(chatMemberships).where(and(
        eq(chatMemberships.chatId, input.chatId),
        eq(chatMemberships.workspaceId, input.workspaceId),
      ));
    });
  };
}
