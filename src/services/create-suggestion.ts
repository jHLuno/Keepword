import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { and, eq } from 'drizzle-orm';

import { chats } from '../db/schema.js';
import { ChatInactiveWriteError } from '../repositories/chats.js';
import { createCommitmentsRepository, type PendingSuggestionInput } from '../repositories/commitments.js';
import type { RepositoryDatabase } from '../repositories/database.js';

export type CreateSuggestion = (input: PendingSuggestionInput) => Promise<Readonly<{
  duplicate: boolean;
  id: string;
}>>;

export function createSuggestion<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): CreateSuggestion {
  return async (input) => {
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
      const commitments = createCommitmentsRepository(transaction);
      const existingForSource = await commitments.findPendingSuggestionForSource(input);
      if (existingForSource) {
        return { duplicate: false, id: existingForSource.id };
      }

      const duplicateId = await commitments.findActiveDuplicate(input);
      if (duplicateId) {
        return { duplicate: true, id: duplicateId };
      }

      const suggestion = await commitments.createPendingSuggestion(input);
      if (suggestion) {
        return { duplicate: false, id: suggestion.id };
      }

      const concurrentDuplicateId = await commitments.findActiveDuplicate(input);
      if (!concurrentDuplicateId) {
        throw new Error('Pending suggestion insert conflicted without an active duplicate');
      }

      return { duplicate: true, id: concurrentDuplicateId };
    });
  };
}
