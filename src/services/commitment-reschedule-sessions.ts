import { and, eq, gt, isNull } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chats, commitmentRescheduleSessions, commitments, suggestionEditSessions, users } from '../db/schema.js';
import type { CurrentChatAdminChecker } from './authorize-action.js';
import type { RepositoryDatabase } from '../repositories/database.js';
import { resolveDueDate } from '../domain/relative-date.js';

const sessionLifetimeMs = 15 * 60 * 1_000;

export class CommitmentRescheduleError extends Error {
  readonly code: 'RESCHEDULE_UNAVAILABLE' | 'UNAUTHORIZED';

  constructor(code: 'RESCHEDULE_UNAVAILABLE' | 'UNAUTHORIZED') {
    super(code);
    this.code = code;
  }
}

export type CommitmentRescheduleService = Readonly<{
  apply: (input: Readonly<{
    actor: Readonly<{ firstName: string; telegramUserId: number }>;
    dueDateText: string;
  }>) => Promise<typeof commitments.$inferSelect>;
  begin: (input: Readonly<{
    actorTelegramUserId: number;
    commitmentId: string;
    telegramChatId: string;
  }>) => Promise<void>;
  hasActive: (telegramUserId: number) => Promise<boolean>;
}>;

export function createCommitmentRescheduleService<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
  isCurrentChatAdmin: CurrentChatAdminChecker,
): CommitmentRescheduleService {
  async function authorize(commitmentId: string, telegramChatId: string, telegramUserId: number): Promise<typeof commitments.$inferSelect> {
    const chatId = Number(telegramChatId);
    if (!Number.isSafeInteger(chatId)) {
      throw new CommitmentRescheduleError('RESCHEDULE_UNAVAILABLE');
    }
    const rows = await database
      .select({ assigneeTelegramUserId: users.telegramUserId, commitment: commitments })
      .from(commitments)
      .innerJoin(chats, and(eq(commitments.chatId, chats.id), eq(commitments.workspaceId, chats.workspaceId)))
      .leftJoin(users, eq(commitments.assigneeUserId, users.id))
      .where(and(eq(commitments.id, commitmentId), eq(chats.telegramChatId, chatId), eq(chats.isActive, true)))
      .limit(1);
    const scoped = rows[0];
    if (!scoped) {
      throw new CommitmentRescheduleError('RESCHEDULE_UNAVAILABLE');
    }
    if (scoped.assigneeTelegramUserId !== telegramUserId) {
      const isAdmin = await isCurrentChatAdmin({ telegramChatId, telegramUserId });
      if (!isAdmin) {
        throw new CommitmentRescheduleError('UNAUTHORIZED');
      }
    }
    return scoped.commitment;
  }

  return {
    async apply(input) {
      const dueDateText = input.dueDateText.trim();
      if (dueDateText.length === 0 || dueDateText.length > 100) {
        throw new CommitmentRescheduleError('RESCHEDULE_UNAVAILABLE');
      }
      return database.transaction(async (transaction) => {
        const sessions = await transaction
          .select()
          .from(commitmentRescheduleSessions)
          .where(
            and(
              eq(commitmentRescheduleSessions.actorTelegramUserId, input.actor.telegramUserId),
              isNull(commitmentRescheduleSessions.usedAt),
              gt(commitmentRescheduleSessions.expiresAt, new Date()),
            ),
          )
          .limit(1);
        const session = sessions[0];
        if (!session) {
          throw new CommitmentRescheduleError('RESCHEDULE_UNAVAILABLE');
        }
        const commitmentRows = await transaction
          .select({
            assigneeTelegramUserId: users.telegramUserId,
            commitment: commitments,
            telegramChatId: chats.telegramChatId,
            timezone: chats.timezone,
          })
          .from(commitments)
          .innerJoin(chats, and(eq(commitments.chatId, chats.id), eq(commitments.workspaceId, chats.workspaceId)))
          .leftJoin(users, eq(commitments.assigneeUserId, users.id))
          .where(and(eq(commitments.id, session.commitmentId), eq(chats.isActive, true)))
          .limit(1);
        const commitmentScope = commitmentRows[0];
        if (!commitmentScope) {
          throw new CommitmentRescheduleError('RESCHEDULE_UNAVAILABLE');
        }
        if (commitmentScope.assigneeTelegramUserId !== input.actor.telegramUserId) {
          const isAdmin = await isCurrentChatAdmin({
            telegramChatId: String(commitmentScope.telegramChatId),
            telegramUserId: input.actor.telegramUserId,
          });
          if (!isAdmin) {
            throw new CommitmentRescheduleError('UNAUTHORIZED');
          }
        }
        const commitment = commitmentScope.commitment;
        if (commitment.status !== 'open' && commitment.status !== 'overdue') {
          throw new CommitmentRescheduleError('RESCHEDULE_UNAVAILABLE');
        }
        // Accept an exact ISO timestamp or a natural phrase ("tomorrow 18:00",
        // "сегодня 22:00", "к вечеру", a weekday), resolved in the chat's time zone.
        const dueAt = resolveDueDate(dueDateText, new Date(), commitmentScope.timezone);
        if (!dueAt || Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
          throw new CommitmentRescheduleError('RESCHEDULE_UNAVAILABLE');
        }
        const claimed = await transaction
          .update(commitmentRescheduleSessions)
          .set({ usedAt: new Date() })
          .where(and(eq(commitmentRescheduleSessions.id, session.id), isNull(commitmentRescheduleSessions.usedAt)))
          .returning({ id: commitmentRescheduleSessions.id });
        if (!claimed[0]) {
          throw new CommitmentRescheduleError('RESCHEDULE_UNAVAILABLE');
        }
        const updated = await transaction
          .update(commitments)
          .set({ dueAt, dueDateText, status: 'open', updatedAt: new Date() })
          .where(and(eq(commitments.id, commitment.id), eq(commitments.status, commitment.status)))
          .returning();
        const result = updated[0];
        if (!result) {
          throw new CommitmentRescheduleError('RESCHEDULE_UNAVAILABLE');
        }
        return result;
      });
    },

    async begin(input) {
      await authorize(input.commitmentId, input.telegramChatId, input.actorTelegramUserId);
      await database.transaction(async (transaction) => {
        await transaction
          .update(commitmentRescheduleSessions)
          .set({ usedAt: new Date() })
          .where(
            and(
              eq(commitmentRescheduleSessions.actorTelegramUserId, input.actorTelegramUserId),
              isNull(commitmentRescheduleSessions.usedAt),
            ),
          );
        const actorRows = await transaction
          .select({ id: users.id })
          .from(users)
          .where(eq(users.telegramUserId, input.actorTelegramUserId))
          .limit(1);
        const actor = actorRows[0];
        if (actor) {
          await transaction
            .update(suggestionEditSessions)
            .set({ usedAt: new Date() })
            .where(and(eq(suggestionEditSessions.actorUserId, actor.id), isNull(suggestionEditSessions.usedAt)));
        }
        await transaction.insert(commitmentRescheduleSessions).values({
          actorTelegramUserId: input.actorTelegramUserId,
          commitmentId: input.commitmentId,
          expiresAt: new Date(Date.now() + sessionLifetimeMs),
        });
      });
    },

    async hasActive(telegramUserId) {
      const rows = await database
        .select({ id: commitmentRescheduleSessions.id })
        .from(commitmentRescheduleSessions)
        .where(
          and(
            eq(commitmentRescheduleSessions.actorTelegramUserId, telegramUserId),
            isNull(commitmentRescheduleSessions.usedAt),
            gt(commitmentRescheduleSessions.expiresAt, new Date()),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
  };
}
