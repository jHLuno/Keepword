import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { commitmentSources, commitmentSuggestions, commitments, suggestionEvents } from '../db/schema.js';
import type { RepositoryDatabase } from '../repositories/database.js';

import { snapshotSuggestion } from './suggestion-snapshots.js';

export class SuggestionActionError extends Error {
  readonly code: 'SUGGESTION_UNAVAILABLE';

  constructor() {
    super('Suggestion is no longer pending');
    this.code = 'SUGGESTION_UNAVAILABLE';
  }
}

export type ConfirmSuggestionInput = Readonly<{
  confirmedByUserId: string;
  suggestionId: string;
}>;

export type ConfirmSuggestion = (
  input: ConfirmSuggestionInput,
) => Promise<typeof commitments.$inferSelect>;

export type RejectSuggestion = (input: Readonly<{
  rejectedByUserId: string;
  suggestionId: string;
}>) => Promise<void>;

function firstRow<Row>(rows: readonly Row[]): Row {
  const row = rows[0];
  if (!row) {
    throw new SuggestionActionError();
  }
  return row;
}

export function createConfirmSuggestion<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): ConfirmSuggestion {
  return async (input) =>
    database.transaction(async (transaction) => {
      const suggestion = firstRow(
        await transaction
          .update(commitmentSuggestions)
          .set({ status: 'confirmed', updatedAt: new Date() })
          .where(and(eq(commitmentSuggestions.id, input.suggestionId), eq(commitmentSuggestions.status, 'pending')))
          .returning(),
      );
      const commitment = firstRow(
        await transaction
          .insert(commitments)
          .values({
            assigneeUserId: suggestion.assigneeUserId,
            chatId: suggestion.chatId,
            confirmedAt: new Date(),
            confirmedByUserId: input.confirmedByUserId,
            description: suggestion.description,
            dueAt: suggestion.dueAt,
            dueDateText: suggestion.dueDateText,
            title: suggestion.title,
            workspaceId: suggestion.workspaceId,
          })
          .returning(),
      );
      await transaction.insert(commitmentSources).values({
        chatId: suggestion.chatId,
        commitmentId: commitment.id,
        sourceMessageId: suggestion.sourceMessageId,
        workspaceId: suggestion.workspaceId,
      });
      await transaction.insert(suggestionEvents).values({
        actorUserId: input.confirmedByUserId,
        chatId: suggestion.chatId,
        eventType: 'confirmed',
        snapshot: { final: snapshotSuggestion(suggestion) },
        suggestionId: suggestion.id,
        workspaceId: suggestion.workspaceId,
      });
      return commitment;
    });
}

export function createRejectSuggestion<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): RejectSuggestion {
  return async (input) =>
    database.transaction(async (transaction) => {
      const suggestion = firstRow(
        await transaction
          .update(commitmentSuggestions)
          .set({ status: 'rejected', updatedAt: new Date() })
          .where(and(eq(commitmentSuggestions.id, input.suggestionId), eq(commitmentSuggestions.status, 'pending')))
          .returning(),
      );
      await transaction.insert(suggestionEvents).values({
        actorUserId: input.rejectedByUserId,
        chatId: suggestion.chatId,
        eventType: 'rejected',
        snapshot: { final: snapshotSuggestion(suggestion) },
        suggestionId: suggestion.id,
        workspaceId: suggestion.workspaceId,
      });
    });
}
