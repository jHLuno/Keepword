import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { createCommitmentsRepository, type PendingSuggestionInput } from '../repositories/commitments.js';
import type { RepositoryDatabase } from '../repositories/database.js';

export type CreateSuggestion = (input: PendingSuggestionInput) => Promise<Readonly<{
  duplicate: boolean;
  id: string;
}>>;

export function createSuggestion<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): CreateSuggestion {
  const commitments = createCommitmentsRepository(database);

  return async (input) => {
    const existingForSource = await commitments.findPendingSuggestionForSource(input);
    if (existingForSource) {
      return { duplicate: false, id: existingForSource.id };
    }

    const duplicateId = await commitments.findActiveDuplicate(input);
    if (duplicateId) {
      return { duplicate: true, id: duplicateId };
    }

    const suggestion = await commitments.createPendingSuggestion(input);
    return { duplicate: false, id: suggestion.id };
  };
}
