import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chats, commitments, type commitmentStatus, users } from '../db/schema.js';
import type { CurrentChatAdminChecker } from './authorize-action.js';
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
  readonly code: 'COMMITMENT_NOT_FOUND' | 'INVALID_STATUS_TRANSITION' | 'UNAUTHORIZED';

  constructor(code: 'COMMITMENT_NOT_FOUND' | 'INVALID_STATUS_TRANSITION' | 'UNAUTHORIZED') {
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

type LifecycleAction = 'block' | 'cancel' | 'complete' | 'open';

const actionStatuses: Readonly<Record<LifecycleAction, CommitmentStatus>> = {
  block: 'blocked',
  cancel: 'cancelled',
  complete: 'completed',
  open: 'open',
};

export type AuthorizedCommitmentAction = (input: Readonly<{
  action: LifecycleAction;
  actor: Readonly<{ firstName: string; telegramUserId: number }>;
  commitmentId: string;
  telegramChatId: string;
}>) => Promise<typeof commitments.$inferSelect>;

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

export function createAuthorizedCommitmentAction<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
  isCurrentChatAdmin: CurrentChatAdminChecker,
): AuthorizedCommitmentAction {
  const updateCommitment = createUpdateCommitment(database);

  return async (input) => {
    const telegramChatId = Number(input.telegramChatId);
    if (!Number.isSafeInteger(telegramChatId)) {
      throw new CommitmentUpdateError('COMMITMENT_NOT_FOUND');
    }
    const rows = await database
      .select({
        assigneeTelegramUserId: users.telegramUserId,
        chatId: commitments.chatId,
        commitment: commitments,
        workspaceId: commitments.workspaceId,
      })
      .from(commitments)
      .innerJoin(
        chats,
        and(eq(commitments.chatId, chats.id), eq(commitments.workspaceId, chats.workspaceId)),
      )
      .leftJoin(users, eq(commitments.assigneeUserId, users.id))
      .where(
        and(
          eq(commitments.id, input.commitmentId),
          eq(chats.telegramChatId, telegramChatId),
          eq(chats.isActive, true),
        ),
      )
      .limit(1);
    const scopedCommitment = rows[0];
    if (!scopedCommitment) {
      throw new CommitmentUpdateError('COMMITMENT_NOT_FOUND');
    }
    const isAssignee = scopedCommitment.assigneeTelegramUserId === input.actor.telegramUserId;
    if (!isAssignee) {
      const isAdmin = await isCurrentChatAdmin({
        telegramChatId: input.telegramChatId,
        telegramUserId: input.actor.telegramUserId,
      });
      if (!isAdmin) {
        throw new CommitmentUpdateError('UNAUTHORIZED');
      }
    }
    return updateCommitment({
      chatId: scopedCommitment.chatId,
      commitmentId: scopedCommitment.commitment.id,
      status: actionStatuses[input.action],
      workspaceId: scopedCommitment.workspaceId,
    });
  };
}
