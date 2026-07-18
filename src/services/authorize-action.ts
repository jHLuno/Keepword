import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chatMemberships, chats, commitmentSuggestions, sourceMessages, users } from '../db/schema.js';
import type { RepositoryDatabase } from '../repositories/database.js';

export class SuggestionActionAuthorizationError extends Error {
  readonly code: 'SUGGESTION_UNAVAILABLE' | 'UNAUTHORIZED';

  constructor(code: 'SUGGESTION_UNAVAILABLE' | 'UNAUTHORIZED') {
    super(code);
    this.code = code;
  }
}

export type CurrentChatAdminChecker = (input: Readonly<{
  telegramChatId: string;
  telegramUserId: number;
}>) => Promise<boolean>;

export type AuthorizeSuggestionActionInput = Readonly<{
  actor: Readonly<{
    firstName: string;
    telegramUserId: number;
  }>;
  suggestionId: string;
  telegramChatId: string;
}>;

export type SuggestionActionScope = Readonly<{
  chatId: string;
  sourceAuthorUserId: string;
  sourceAuthorTelegramUserId: number;
  workspaceId: string;
}>;

export type AuthorizeSuggestionAction = (input: AuthorizeSuggestionActionInput) => Promise<'source-author' | 'chat-admin'>;

export function createAuthorizeSuggestionAction<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
  isCurrentChatAdmin: CurrentChatAdminChecker,
): AuthorizeSuggestionAction {
  async function findScope(suggestionId: string, telegramChatId: string): Promise<SuggestionActionScope> {
    const parsedTelegramChatId = Number(telegramChatId);
    if (!Number.isSafeInteger(parsedTelegramChatId)) {
      throw new SuggestionActionAuthorizationError('SUGGESTION_UNAVAILABLE');
    }
    const rows = await database
      .select({
        chatId: commitmentSuggestions.chatId,
        sourceAuthorTelegramUserId: users.telegramUserId,
        sourceAuthorUserId: sourceMessages.authorUserId,
        workspaceId: commitmentSuggestions.workspaceId,
      })
      .from(commitmentSuggestions)
      .innerJoin(
        sourceMessages,
        and(
          eq(commitmentSuggestions.sourceMessageId, sourceMessages.id),
          eq(commitmentSuggestions.chatId, sourceMessages.chatId),
          eq(commitmentSuggestions.workspaceId, sourceMessages.workspaceId),
        ),
      )
      .innerJoin(users, eq(sourceMessages.authorUserId, users.id))
      .innerJoin(
        chats,
        and(
          eq(commitmentSuggestions.chatId, chats.id),
          eq(commitmentSuggestions.workspaceId, chats.workspaceId),
        ),
      )
      .where(
        and(
          eq(commitmentSuggestions.id, suggestionId),
          eq(commitmentSuggestions.status, 'pending'),
          eq(chats.telegramChatId, parsedTelegramChatId),
          eq(chats.isActive, true),
        ),
      )
      .limit(1);
    const scope = rows[0];
    if (!scope) {
      throw new SuggestionActionAuthorizationError('SUGGESTION_UNAVAILABLE');
    }
    return scope;
  }

  async function registerCurrentAdministrator(scope: SuggestionActionScope, actor: AuthorizeSuggestionActionInput['actor']): Promise<void> {
    await database.transaction(async (transaction) => {
      const insertedUsers = await transaction
        .insert(users)
        .values({ firstName: actor.firstName, telegramUserId: actor.telegramUserId })
        .onConflictDoNothing({ target: users.telegramUserId })
        .returning();
      const actorUser =
        insertedUsers[0] ??
        (
          await transaction
            .select({ id: users.id })
            .from(users)
            .where(eq(users.telegramUserId, actor.telegramUserId))
            .limit(1)
        )[0];
      if (!actorUser) {
        throw new Error('Current Telegram administrator could not be resolved');
      }
      await transaction
        .insert(chatMemberships)
        .values({
          chatId: scope.chatId,
          role: 'admin',
          userId: actorUser.id,
          workspaceId: scope.workspaceId,
        })
        .onConflictDoUpdate({
          set: { role: 'admin', updatedAt: new Date() },
          target: [chatMemberships.chatId, chatMemberships.userId],
        });
    });
  }

  return async (input) => {
    const scope = await findScope(input.suggestionId, input.telegramChatId);
    if (scope.sourceAuthorTelegramUserId === input.actor.telegramUserId) {
      return 'source-author';
    }

    const isAdmin = await isCurrentChatAdmin({
      telegramChatId: input.telegramChatId,
      telegramUserId: input.actor.telegramUserId,
    });
    if (!isAdmin) {
      throw new SuggestionActionAuthorizationError('UNAUTHORIZED');
    }
    await registerCurrentAdministrator(scope, input.actor);
    return 'chat-admin';
  };
}
