import { and, eq, gte, isNotNull, lte, ne } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chatMemberships, chats, commitments, users } from '../db/schema.js';

import type { RepositoryDatabase } from './database.js';

export const reliabilityMinimumEligibleCommitments = 3;
const reliabilityWindowMs = 30 * 24 * 60 * 60 * 1_000;

export type ReliabilitySummary = Readonly<{
  eligible: number;
  late: number;
  onTime: number;
  overdue: number;
}>;

export type ReliabilityLine = ReliabilitySummary & Readonly<{
  firstName: string;
  userId: string;
}>;

export type ReliabilityRepository = Readonly<{
  findChatReliability: (input: Readonly<{
    chatId: string;
    now: Date;
    workspaceId: string;
  }>) => Promise<readonly ReliabilityLine[]>;
  findUserCrossChatReliability: (input: Readonly<{
    now: Date;
    telegramUserId: number;
  }>) => Promise<ReliabilitySummary | null>;
}>;

type ReliabilityCommitment = Readonly<{
  assigneeUserId: string;
  completedAt: Date | null;
  dueAt: Date;
  status: 'blocked' | 'cancelled' | 'completed' | 'open' | 'overdue';
}>;

function emptySummary(): ReliabilitySummary {
  return { eligible: 0, late: 0, onTime: 0, overdue: 0 };
}

function addCommitment(summary: ReliabilitySummary, commitment: ReliabilityCommitment, now: Date): ReliabilitySummary {
  if (commitment.status === 'cancelled') {
    return summary;
  }
  if (commitment.status === 'completed') {
    if (!commitment.completedAt || commitment.completedAt > now) {
      return summary;
    }
    return commitment.completedAt <= commitment.dueAt
      ? { ...summary, eligible: summary.eligible + 1, onTime: summary.onTime + 1 }
      : { ...summary, eligible: summary.eligible + 1, late: summary.late + 1 };
  }
  if (commitment.dueAt < now) {
    return { ...summary, eligible: summary.eligible + 1, overdue: summary.overdue + 1 };
  }
  return summary;
}

function summarize(commitmentRows: readonly ReliabilityCommitment[], now: Date): ReliabilitySummary {
  return commitmentRows.reduce((summary, commitment) => addCommitment(summary, commitment, now), emptySummary());
}

export function createReliabilityRepository<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): ReliabilityRepository {
  return {
    async findChatReliability(input) {
      const windowStart = new Date(input.now.getTime() - reliabilityWindowMs);
      const rows = await database
        .select({
          assigneeUserId: commitments.assigneeUserId,
          completedAt: commitments.completedAt,
          dueAt: commitments.dueAt,
          firstName: users.firstName,
          status: commitments.status,
        })
        .from(commitments)
        .innerJoin(users, eq(commitments.assigneeUserId, users.id))
        .where(and(
          eq(commitments.workspaceId, input.workspaceId),
          eq(commitments.chatId, input.chatId),
          isNotNull(commitments.assigneeUserId),
          isNotNull(commitments.dueAt),
          ne(commitments.status, 'cancelled'),
          gte(commitments.dueAt, windowStart),
          lte(commitments.dueAt, input.now),
        ));
      const byUser = new Map<string, Readonly<{ firstName: string; commitments: ReliabilityCommitment[] }>>();
      for (const row of rows) {
        if (!row.assigneeUserId || !row.dueAt) continue;
        const current = byUser.get(row.assigneeUserId) ?? { firstName: row.firstName, commitments: [] };
        current.commitments.push({
          assigneeUserId: row.assigneeUserId,
          completedAt: row.completedAt,
          dueAt: row.dueAt,
          status: row.status,
        });
        byUser.set(row.assigneeUserId, current);
      }
      return [...byUser.entries()]
        .map(([userId, value]) => ({ firstName: value.firstName, userId, ...summarize(value.commitments, input.now) }))
        .filter((line) => line.eligible >= reliabilityMinimumEligibleCommitments)
        .sort((left, right) => left.firstName.localeCompare(right.firstName));
    },

    async findUserCrossChatReliability(input) {
      const windowStart = new Date(input.now.getTime() - reliabilityWindowMs);
      const rows = await database
        .select({
          assigneeUserId: commitments.assigneeUserId,
          completedAt: commitments.completedAt,
          dueAt: commitments.dueAt,
          status: commitments.status,
        })
        .from(commitments)
        .innerJoin(users, eq(commitments.assigneeUserId, users.id))
        .innerJoin(chats, and(
          eq(commitments.chatId, chats.id),
          eq(commitments.workspaceId, chats.workspaceId),
        ))
        .innerJoin(chatMemberships, and(
          eq(chatMemberships.chatId, commitments.chatId),
          eq(chatMemberships.workspaceId, commitments.workspaceId),
          eq(chatMemberships.userId, commitments.assigneeUserId),
        ))
        .where(and(
          eq(users.telegramUserId, input.telegramUserId),
          isNotNull(chatMemberships.notificationsConnectedAt),
          eq(chats.isActive, true),
          isNotNull(commitments.dueAt),
          ne(commitments.status, 'cancelled'),
          gte(commitments.dueAt, windowStart),
          lte(commitments.dueAt, input.now),
        ));
      const scoped = rows.flatMap((row) => row.assigneeUserId && row.dueAt ? [{
        assigneeUserId: row.assigneeUserId,
        completedAt: row.completedAt,
        dueAt: row.dueAt,
        status: row.status,
      }] : []);
      const summary = summarize(scoped, input.now);
      return summary.eligible >= reliabilityMinimumEligibleCommitments ? summary : null;
    },
  };
}
