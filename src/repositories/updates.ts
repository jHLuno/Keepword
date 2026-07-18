import { eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { processedUpdates } from '../db/schema.js';

import type { RepositoryDatabase } from './database.js';

export type UpdatesRepository = Readonly<{
  recordUpdate: (updateId: number) => Promise<boolean>;
  releaseUpdate: (updateId: number) => Promise<void>;
}>;

export function createUpdatesRepository<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): UpdatesRepository {
  return {
    async recordUpdate(updateId) {
      const insertedUpdates = await database
        .insert(processedUpdates)
        .values({ telegramUpdateId: updateId })
        .onConflictDoNothing()
        .returning({ telegramUpdateId: processedUpdates.telegramUpdateId });

      return insertedUpdates.length === 1;
    },
    async releaseUpdate(updateId) {
      await database.delete(processedUpdates).where(eq(processedUpdates.telegramUpdateId, updateId));
    },
  };
}
