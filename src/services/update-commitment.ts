import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { commitments, type commitmentStatus } from '../db/schema.js';
import type { RepositoryDatabase } from '../repositories/database.js';

type CommitmentStatus = (typeof commitmentStatus.enumValues)[number];

const allowedTransitions: Readonly<Record<CommitmentStatus, readonly CommitmentStatus[]>> = {
  blocked: ['open', 'completed', 'cancelled'],
  cancelled: [],
  completed: [],
  open: ['completed', 'overdue', 'cancelled', 'blocked'],
  overdue: [],
};

export class CommitmentUpdateError extends Error {
  readonly code: 'COMMITMENT_NOT_FOUND' | 'INVALID_STATUS_TRANSITION';

  constructor(code: 'COMMITMENT_NOT_FOUND' | 'INVALID_STATUS_TRANSITION') {
    super(code);
    this.code = code;
  }
}

export type UpdateCommitmentInput = Readonly<{
  chatId: string;
  commitmentId: string;
  status: CommitmentStatus;
  workspaceId: string;
}>;

export type UpdateCommitment = (
  input: UpdateCommitmentInput,
) => Promise<typeof commitments.$inferSelect>;

export function createUpdateCommitment<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): UpdateCommitment {
  return async (input) => {
    const currentRows = await database
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
    const current = currentRows[0];
    if (!current) {
      throw new CommitmentUpdateError('COMMITMENT_NOT_FOUND');
    }
    if (!allowedTransitions[current.status].includes(input.status)) {
      throw new CommitmentUpdateError('INVALID_STATUS_TRANSITION');
    }
    const rows = await database
      .update(commitments)
      .set({
        completedAt: input.status === 'completed' ? new Date() : current.completedAt,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(commitments.id, input.commitmentId),
          eq(commitments.workspaceId, input.workspaceId),
          eq(commitments.chatId, input.chatId),
          eq(commitments.status, current.status),
        ),
      )
      .returning();
    const updated = rows[0];
    if (!updated) {
      throw new CommitmentUpdateError('INVALID_STATUS_TRANSITION');
    }
    return updated;
  };
}
