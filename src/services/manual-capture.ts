import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { and, asc, eq, isNotNull } from 'drizzle-orm';

import type { CommitmentExtractor } from '../ai/extractor.js';
import { chatMemberships, chats, manualCaptureSources, users } from '../db/schema.js';
import type { Logger } from '../observability/logger.js';
import { renderPrivateSuggestionText, type InlineKeyboardMarkup } from '../telegram/messages.js';
import type { RepositoryDatabase } from '../repositories/database.js';

import { createAnalyzeGroupMessage, type SuggestionReply } from './analyze-message.js';

export type PrivateSuggestionMessenger = Readonly<{
  sendPrivateSuggestion: (input: Readonly<{
    replyMarkup: InlineKeyboardMarkup;
    replyToTelegramMessageId: string;
    telegramUserId: number;
    text: string;
  }>) => Promise<void>;
}>;

export type CommitmentSuggestion = Readonly<{
  status: 'clarification-requested' | 'skipped' | 'suggested' | 'unavailable';
}>;

export type ManualCapture = Readonly<{
  capturePrivateMessage: (input: Readonly<{
    messenger: PrivateSuggestionMessenger;
    sender: Readonly<{ firstName: string; lastName?: string; telegramUserId: number; username?: string }>;
    sentAt: Date;
    telegramChatId?: string;
    telegramMessageId: string;
    text: string;
  }>) => Promise<CommitmentSuggestion>;
}>;

type ConnectedChat = Readonly<{
  id: string;
  telegramChatId: number;
  workspaceId: string;
}>;

function parseTelegramMessageId(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const telegramMessageId = Number(value);
  return Number.isSafeInteger(telegramMessageId) ? telegramMessageId : null;
}

export function createManualCapture<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
  extractor: CommitmentExtractor,
  callbackSigningSecret: string,
  logger?: Logger,
): ManualCapture {
  async function connectedChats(telegramUserId: number): Promise<readonly ConnectedChat[]> {
    return database
      .select({ id: chats.id, telegramChatId: chats.telegramChatId, workspaceId: chats.workspaceId })
      .from(chatMemberships)
      .innerJoin(users, eq(chatMemberships.userId, users.id))
      .innerJoin(chats, and(eq(chatMemberships.chatId, chats.id), eq(chatMemberships.workspaceId, chats.workspaceId)))
      .where(
        and(
          eq(users.telegramUserId, telegramUserId),
          isNotNull(users.privateChatStartedAt),
          eq(chats.isActive, true),
        ),
      )
      .orderBy(asc(chats.createdAt));
  }

  async function reserveSourceMessageId(input: Readonly<{
    chatId: string;
    privateTelegramMessageId: number;
    senderTelegramUserId: number;
    workspaceId: string;
  }>): Promise<number | null> {
    return database.transaction(async (transaction) => {
      const existing = (
        await transaction
          .select({ id: manualCaptureSources.id })
          .from(manualCaptureSources)
          .where(
            and(
              eq(manualCaptureSources.chatId, input.chatId),
              eq(manualCaptureSources.workspaceId, input.workspaceId),
              eq(manualCaptureSources.senderTelegramUserId, input.senderTelegramUserId),
              eq(manualCaptureSources.privateTelegramMessageId, input.privateTelegramMessageId),
            ),
          )
          .limit(1)
      )[0];
      const source = existing ?? (
        await transaction
          .insert(manualCaptureSources)
          .values({
            chatId: input.chatId,
            privateTelegramMessageId: input.privateTelegramMessageId,
            senderTelegramUserId: input.senderTelegramUserId,
            workspaceId: input.workspaceId,
          })
          .onConflictDoNothing()
          .returning({ id: manualCaptureSources.id })
      )[0] ?? (
        await transaction
          .select({ id: manualCaptureSources.id })
          .from(manualCaptureSources)
          .where(
            and(
              eq(manualCaptureSources.chatId, input.chatId),
              eq(manualCaptureSources.workspaceId, input.workspaceId),
              eq(manualCaptureSources.senderTelegramUserId, input.senderTelegramUserId),
              eq(manualCaptureSources.privateTelegramMessageId, input.privateTelegramMessageId),
            ),
          )
          .limit(1)
      )[0];
      return source && Number.isSafeInteger(source.id) ? -source.id : null;
    });
  }

  return {
    async capturePrivateMessage(input) {
      const telegramMessageId = parseTelegramMessageId(input.telegramMessageId);
      if (telegramMessageId === null) {
        return { status: 'unavailable' };
      }
      const availableChats = await connectedChats(input.sender.telegramUserId);
      const selectedChat = input.telegramChatId === undefined
        ? availableChats.length === 1 ? availableChats[0] : undefined
        : availableChats.find((chat) => String(chat.telegramChatId) === input.telegramChatId);
      if (!selectedChat) {
        return { status: 'unavailable' };
      }
      const sourceTelegramMessageId = await reserveSourceMessageId({
        chatId: selectedChat.id,
        privateTelegramMessageId: telegramMessageId,
        senderTelegramUserId: input.sender.telegramUserId,
        workspaceId: selectedChat.workspaceId,
      });
      if (sourceTelegramMessageId === null) {
        return { status: 'unavailable' };
      }
      const analyzer = createAnalyzeGroupMessage(
        database,
        extractor,
        {
          sendClarificationRequest: () => Promise.resolve(),
          sendSuggestionReply: (reply: SuggestionReply) =>
            input.messenger.sendPrivateSuggestion({
              replyMarkup: reply.replyMarkup,
              replyToTelegramMessageId: input.telegramMessageId,
              telegramUserId: input.sender.telegramUserId,
              text: renderPrivateSuggestionText(reply.text),
            }),
        },
        callbackSigningSecret,
        logger,
      );
      const status = await analyzer({
        author: input.sender,
        defaultAssigneeTelegramUserId: input.sender.telegramUserId,
        sentAt: input.sentAt,
        telegramChatId: String(selectedChat.telegramChatId),
        telegramMessageId: String(sourceTelegramMessageId),
        text: input.text,
      });
      return { status };
    },
  };
}
