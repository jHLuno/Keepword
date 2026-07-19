import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chats, commitmentSuggestions, commitments } from '../db/schema.js';

import type { RepositoryDatabase } from './database.js';

export type ScopedCommitmentInput = Readonly<{
  workspaceId: string;
  chatId: string;
  commitmentId: string;
}>;

export type PendingSuggestionInput = Readonly<{
  assigneeUserId: string;
  chatId: string;
  confidence: string;
  description: string | null;
  dueAt: Date | null;
  dueDateText: string | null;
  language: string;
  needsAssigneeClarification: boolean;
  needsDueDateClarification: boolean;
  sourceMessageId: string;
  title: string;
  workspaceId: string;
}>;

export type ActiveDuplicateInput = Readonly<{
  assigneeUserId: string;
  chatId: string;
  title: string;
  workspaceId: string;
}>;

export function normalizeSuggestionTitle(title: string): string {
  return title.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export type CommitmentsRepository = Readonly<{
  createPendingSuggestion: (
    input: PendingSuggestionInput,
  ) => Promise<typeof commitmentSuggestions.$inferSelect | null>;
  findActiveDuplicate: (input: ActiveDuplicateInput) => Promise<string | null>;
  findScopedCommitment: (input: ScopedCommitmentInput) => Promise<typeof commitments.$inferSelect | null>;
  findPendingSuggestionForSource: (input: Readonly<{
    chatId: string;
    sourceMessageId: string;
    workspaceId: string;
  }>) => Promise<typeof commitmentSuggestions.$inferSelect | null>;
  findPendingSuggestionTitles: (input: Readonly<{ chatId: string; workspaceId: string }>) => Promise<readonly string[]>;
}>;

export function createCommitmentsRepository<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): CommitmentsRepository {
  return {
    async createPendingSuggestion(input) {
      const rows = await database
        .insert(commitmentSuggestions)
        .values({
          assigneeUserId: input.assigneeUserId,
          chatId: input.chatId,
          confidence: input.confidence,
          description: input.description,
          dueAt: input.dueAt,
          dueDateText: input.dueDateText,
          language: input.language,
          needsAssigneeClarification: input.needsAssigneeClarification,
          needsDueDateClarification: input.needsDueDateClarification,
          normalizedTitle: normalizeSuggestionTitle(input.title),
          sourceMessageId: input.sourceMessageId,
          title: input.title,
          workspaceId: input.workspaceId,
        })
        .onConflictDoNothing()
        .returning();

      return rows[0] ?? null;
    },

    async findActiveDuplicate(input) {
      const [openCommitments, pendingSuggestions] = await Promise.all([
        database
          .select({ assigneeUserId: commitments.assigneeUserId, id: commitments.id, title: commitments.title })
          .from(commitments)
          .where(
            and(
              eq(commitments.workspaceId, input.workspaceId),
              eq(commitments.chatId, input.chatId),
              eq(commitments.status, 'open'),
              eq(commitments.assigneeUserId, input.assigneeUserId),
            ),
          ),
        database
          .select({
            assigneeUserId: commitmentSuggestions.assigneeUserId,
            id: commitmentSuggestions.id,
            title: commitmentSuggestions.title,
          })
          .from(commitmentSuggestions)
          .where(
            and(
              eq(commitmentSuggestions.workspaceId, input.workspaceId),
              eq(commitmentSuggestions.chatId, input.chatId),
              eq(commitmentSuggestions.status, 'pending'),
              eq(commitmentSuggestions.assigneeUserId, input.assigneeUserId),
            ),
          ),
      ]);
      const normalizedTitle = normalizeSuggestionTitle(input.title);
      const duplicate = [...openCommitments, ...pendingSuggestions].find(
        (candidate) =>
          candidate.assigneeUserId === input.assigneeUserId &&
          normalizeSuggestionTitle(candidate.title) === normalizedTitle,
      );

      return duplicate?.id ?? null;
    },

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

    async findPendingSuggestionForSource(input) {
      const rows = await database
        .select()
        .from(commitmentSuggestions)
        .where(
          and(
            eq(commitmentSuggestions.workspaceId, input.workspaceId),
            eq(commitmentSuggestions.chatId, input.chatId),
            eq(commitmentSuggestions.sourceMessageId, input.sourceMessageId),
            eq(commitmentSuggestions.status, 'pending'),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    },

    async findPendingSuggestionTitles(input) {
      const rows = await database
        .select({ title: commitmentSuggestions.title })
        .from(commitmentSuggestions)
        .innerJoin(
          chats,
          and(
            eq(commitmentSuggestions.chatId, chats.id),
            eq(commitmentSuggestions.workspaceId, chats.workspaceId),
          ),
        )
        .where(
          and(
            eq(commitmentSuggestions.workspaceId, input.workspaceId),
            eq(commitmentSuggestions.chatId, input.chatId),
            eq(commitmentSuggestions.status, 'pending'),
            eq(chats.mode, 'silent_digest'),
          ),
        );
      return rows.map((row) => row.title);
    },
  };
}
