import { createHash, randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chatMemberships, chats, onboardingTokens, users, workspaces } from '../db/schema.js';
import type { RepositoryDatabase } from '../repositories/database.js';

export type ConnectChatInput = Readonly<{
  adminTelegramUserId: string;
  telegramChatId: string;
  timezone: string;
  title: string;
}>;

export type ConnectedChat = Readonly<{
  chatId: string;
  isNew: boolean;
  onboardingToken?: string;
  telegramChatId: string;
  title: string;
  workspaceId: string;
}>;

export type ConnectChat = (input: ConnectChatInput) => Promise<ConnectedChat>;

const onboardingTokenLifetimeMs = 24 * 60 * 60 * 1_000;

function firstRow<Row>(rows: readonly Row[]): Row {
  const row = rows[0];

  if (!row) {
    throw new Error('Expected a database row');
  }

  return row;
}

function hashOnboardingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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
          isNew: false,
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

      const onboardingToken = randomBytes(32).toString('base64url');
      await transaction.insert(onboardingTokens).values({
        chatId: chat.id,
        expiresAt: new Date(Date.now() + onboardingTokenLifetimeMs),
        tokenHash: hashOnboardingToken(onboardingToken),
        workspaceId: workspace.id,
      });

      return {
        chatId: chat.id,
        isNew: true,
        onboardingToken,
        telegramChatId: input.telegramChatId,
        title: chat.title,
        workspaceId: workspace.id,
      };
    });
  };
}
