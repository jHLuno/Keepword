import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { sourceMessages } from '../db/schema.js';

import type { RepositoryDatabase } from './database.js';

export type ScopedMessageInput = Readonly<{
  workspaceId: string;
  chatId: string;
  messageId: string;
}>;

export type MessagesRepository = Readonly<{
  findScopedMessage: (input: ScopedMessageInput) => Promise<typeof sourceMessages.$inferSelect | null>;
}>;

export function createMessagesRepository<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): MessagesRepository {
  return {
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
  };
}
