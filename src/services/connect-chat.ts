import { eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chatMemberships, chats, users, workspaces } from '../db/schema.js';
import type { RepositoryDatabase } from '../repositories/database.js';

export type ConnectChatInput = Readonly<{
  adminTelegramUserId: string;
  telegramChatId: string;
  timezone: string;
  title: string;
}>;

export type ConnectedChat = Readonly<{
  chatId: string;
  telegramChatId: string;
  title: string;
  workspaceId: string;
}>;

export type ConnectChat = (input: ConnectChatInput) => Promise<ConnectedChat>;

function firstRow<Row>(rows: readonly Row[]): Row {
  const row = rows[0];

  if (!row) {
    throw new Error('Expected a database row');
  }

  return row;
}

export function createConnectChat<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): ConnectChat {
  return async (input) => {
    const telegramChatId = Number(input.telegramChatId);
    const adminTelegramUserId = Number(input.adminTelegramUserId);

    return database.transaction(async (transaction) => {
      const existingChats = await transaction
        .select()
        .from(chats)
        .where(eq(chats.telegramChatId, telegramChatId))
        .limit(1);
      const existingChat = existingChats[0];

      if (existingChat) {
        return {
          chatId: existingChat.id,
          telegramChatId: input.telegramChatId,
          title: existingChat.title,
          workspaceId: existingChat.workspaceId,
        };
      }

      const workspace = firstRow(
        await transaction.insert(workspaces).values({ name: input.title }).returning(),
      );
      const chat = firstRow(
        await transaction
          .insert(chats)
          .values({
            telegramChatId,
            title: input.title,
            timezone: input.timezone,
            workspaceId: workspace.id,
          })
          .returning(),
      );

      const insertedUsers = await transaction
        .insert(users)
        .values({
          firstName: 'Telegram admin',
          telegramUserId: adminTelegramUserId,
        })
        .onConflictDoNothing({ target: users.telegramUserId })
        .returning();
      const admin =
        insertedUsers[0] ??
        firstRow(
          await transaction
            .select()
            .from(users)
            .where(eq(users.telegramUserId, adminTelegramUserId))
            .limit(1),
        );

      await transaction
        .insert(chatMemberships)
        .values({
          chatId: chat.id,
          role: 'admin',
          userId: admin.id,
          workspaceId: workspace.id,
        })
        .onConflictDoNothing();

      return {
        chatId: chat.id,
        telegramChatId: input.telegramChatId,
        title: chat.title,
        workspaceId: workspace.id,
      };
    });
  };
}
