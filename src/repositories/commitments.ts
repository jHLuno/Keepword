import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { commitments } from '../db/schema.js';

import type { RepositoryDatabase } from './database.js';

export type ScopedCommitmentInput = Readonly<{
  workspaceId: string;
  chatId: string;
  commitmentId: string;
}>;

export type CommitmentsRepository = Readonly<{
  findScopedCommitment: (input: ScopedCommitmentInput) => Promise<typeof commitments.$inferSelect | null>;
}>;

export function createCommitmentsRepository<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): CommitmentsRepository {
  return {
    async findScopedCommitment(input) {
      const rows = await database
        .select()
        .from(commitments)
        .where(
          and(
            eq(commitments.id, input.commitmentId),
            eq(commitments.workspaceId, input.workspaceId),
            eq(commitments.chatId, input.chatId),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    },
  };
}
