import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chatMemberships, users } from '../db/schema.js';

import type { RepositoryDatabase } from './database.js';

export type ScopedMemberInput = Readonly<{
  workspaceId: string;
  chatId: string;
  telegramUserId: number;
}>;

export type UsersRepository = Readonly<{
  findScopedMember: (input: ScopedMemberInput) => Promise<typeof users.$inferSelect | null>;
}>;

export function createUsersRepository<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): UsersRepository {
  return {
    async findScopedMember(input) {
      const rows = await database
        .select({ user: users })
        .from(chatMemberships)
        .innerJoin(users, eq(chatMemberships.userId, users.id))
        .where(
          and(
            eq(chatMemberships.workspaceId, input.workspaceId),
            eq(chatMemberships.chatId, input.chatId),
            eq(users.telegramUserId, input.telegramUserId),
          ),
        )
        .limit(1);

      return rows[0]?.user ?? null;
    },
  };
}
