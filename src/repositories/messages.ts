import { and, desc, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chatMemberships, chats, sourceMessages, users } from '../db/schema.js';
import { ChatInactiveWriteError } from './chats.js';

import type { RepositoryDatabase } from './database.js';

export type ScopedMessageInput = Readonly<{
  workspaceId: string;
  chatId: string;
  messageId: string;
}>;

export type CandidateSourceMessageInput = Readonly<{
  author: Readonly<{
    firstName: string;
    lastName?: string;
    telegramUserId: number;
    username?: string;
  }>;
  chatId: string;
  sentAt: Date;
  telegramMessageId: number;
  text: string;
  workspaceId: string;
}>;

export type StoredExtractionMessage = Readonly<{
  authorTelegramUserId: string;
  chatId: string;
  id: string;
  sentAt: string;
  text: string;
}>;

export type MessagesRepository = Readonly<{
  findActiveChatByTelegramChatId: (telegramChatId: number) => Promise<typeof chats.$inferSelect | null>;
  findScopedMessage: (input: ScopedMessageInput) => Promise<typeof sourceMessages.$inferSelect | null>;
  findRecentScopedMessages: (input: Readonly<{
    chatId: string;
    limit: number;
    workspaceId: string;
  }>) => Promise<readonly StoredExtractionMessage[]>;
  markUsedAsSource: (input: ScopedMessageInput) => Promise<void>;
  persistCandidateSourceMessage: (
    input: CandidateSourceMessageInput,
  ) => Promise<typeof sourceMessages.$inferSelect>;
}>;

function firstRow<Row>(rows: readonly Row[]): Row {
  const row = rows[0];

  if (!row) {
    throw new Error('Expected a database row');
  }

  return row;
}

export function createMessagesRepository<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): MessagesRepository {
  return {
    async findActiveChatByTelegramChatId(telegramChatId) {
      const rows = await database
        .select()
        .from(chats)
        .where(and(eq(chats.telegramChatId, telegramChatId), eq(chats.isActive, true)))
        .limit(1);

      return rows[0] ?? null;
    },

    async findScopedMessage(input) {
      const rows = await database
        .select()
        .from(sourceMessages)
        .where(
          and(
            eq(sourceMessages.id, input.messageId),
            eq(sourceMessages.workspaceId, input.workspaceId),
            eq(sourceMessages.chatId, input.chatId),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    },

    async findRecentScopedMessages(input) {
      const rows = await database
        .select({
          authorTelegramUserId: users.telegramUserId,
          chatId: sourceMessages.chatId,
          id: sourceMessages.id,
          sentAt: sourceMessages.sentAt,
          text: sourceMessages.messageText,
        })
        .from(sourceMessages)
        .innerJoin(users, eq(sourceMessages.authorUserId, users.id))
        .where(
          and(
            eq(sourceMessages.workspaceId, input.workspaceId),
            eq(sourceMessages.chatId, input.chatId),
          ),
        )
        .orderBy(desc(sourceMessages.sentAt))
        .limit(input.limit);

      return rows
        .reverse()
        .flatMap((row) =>
          row.text === null
            ? []
            : [
                {
                  authorTelegramUserId: String(row.authorTelegramUserId),
                  chatId: row.chatId,
                  id: row.id,
                  sentAt: row.sentAt.toISOString(),
                  text: row.text,
                },
              ],
        );
    },

    async markUsedAsSource(input) {
      await database
        .update(sourceMessages)
        .set({ usedAsSource: true, updatedAt: new Date() })
        .where(
          and(
            eq(sourceMessages.id, input.messageId),
            eq(sourceMessages.workspaceId, input.workspaceId),
            eq(sourceMessages.chatId, input.chatId),
          ),
        );
    },

    async persistCandidateSourceMessage(input) {
      return database.transaction(async (transaction) => {
        const activeChat = await transaction
          .select({ id: chats.id })
          .from(chats)
          .where(
            and(
              eq(chats.id, input.chatId),
              eq(chats.workspaceId, input.workspaceId),
              eq(chats.isActive, true),
            ),
          )
          .for('update')
          .limit(1);
        if (!activeChat[0]) {
          throw new ChatInactiveWriteError();
        }
        const insertedUsers = await transaction
          .insert(users)
          .values({
            firstName: input.author.firstName,
            lastName: input.author.lastName,
            telegramUserId: input.author.telegramUserId,
            username: input.author.username,
          })
          .onConflictDoNothing({ target: users.telegramUserId })
          .returning();
        const user =
          insertedUsers[0] ??
          firstRow(
            await transaction
              .select()
              .from(users)
              .where(eq(users.telegramUserId, input.author.telegramUserId))
              .limit(1),
          );

        await transaction
          .insert(chatMemberships)
          .values({
            chatId: input.chatId,
            userId: user.id,
            workspaceId: input.workspaceId,
          })
          .onConflictDoNothing();

        const insertedMessages = await transaction
          .insert(sourceMessages)
          .values({
            authorUserId: user.id,
            chatId: input.chatId,
            messageText: input.text,
            sentAt: input.sentAt,
            telegramMessageId: input.telegramMessageId,
            workspaceId: input.workspaceId,
          })
          .onConflictDoNothing({ target: [sourceMessages.chatId, sourceMessages.telegramMessageId] })
          .returning();

        return (
          insertedMessages[0] ??
          firstRow(
            await transaction
              .select()
              .from(sourceMessages)
              .where(
                and(
                  eq(sourceMessages.chatId, input.chatId),
                  eq(sourceMessages.telegramMessageId, input.telegramMessageId),
                ),
              )
              .limit(1),
          )
        );
      });
    },
  };
}
