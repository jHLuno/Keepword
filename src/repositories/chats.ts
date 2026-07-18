import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chats } from '../db/schema.js';

import type { RepositoryDatabase } from './database.js';

export type ChatMode = 'suggest' | 'manual' | 'silent_digest';

export type ScopedChatInput = Readonly<{
  workspaceId: string;
  chatId: string;
}>;

export type ChatsRepository = Readonly<{
  findScopedChat: (input: ScopedChatInput) => Promise<typeof chats.$inferSelect | null>;
  setMode: (input: ScopedChatInput & Readonly<{ mode: ChatMode }>) => Promise<void>;
}>;

export function createChatsRepository<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): ChatsRepository {
  return {
    async findScopedChat(input) {
      const rows = await database
        .select()
        .from(chats)
        .where(and(eq(chats.id, input.chatId), eq(chats.workspaceId, input.workspaceId)))
        .limit(1);

      return rows[0] ?? null;
    },

    async setMode(input) {
      await database
        .update(chats)
        .set({ mode: input.mode, updatedAt: new Date() })
        .where(and(eq(chats.id, input.chatId), eq(chats.workspaceId, input.workspaceId)));
    },
  };
}
