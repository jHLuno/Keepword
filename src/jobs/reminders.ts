import { and, eq, isNotNull, lte } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chatMemberships, chats, commitments, users } from '../db/schema.js';
import type { Logger } from '../observability/logger.js';
import type { RepositoryDatabase } from '../repositories/database.js';
import { createSendReminder, type ReminderMessenger } from '../services/send-reminder.js';
import { createUpdateCommitment, CommitmentUpdateError } from '../services/update-commitment.js';

export type JobResult = Readonly<{
  delivered: number;
  failed: number;
  skipped: number;
}>;

export type RunReminderJob = (now: Date) => Promise<JobResult>;

function localDate(date: Date, timezone: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      timeZone: timezone,
      year: 'numeric',
    }).format(date);
  } catch {
    return null;
  }
}

export function createReminderJob<TQueryResult extends PgQueryResultHKT>(input: Readonly<{
  callbackSigningSecret: string;
  database: RepositoryDatabase<TQueryResult>;
  logger?: Logger;
  messenger: ReminderMessenger;
}>): RunReminderJob {
  const sendReminder = createSendReminder(input);
  const updateCommitment = createUpdateCommitment(input.database);

  return async (now) => {
    const candidates = await input.database
      .select({
        assigneeTelegramUserId: users.telegramUserId,
        assigneeUserId: commitments.assigneeUserId,
        chatId: commitments.chatId,
        commitmentId: commitments.id,
        dueAt: commitments.dueAt,
        dueDateText: commitments.dueDateText,
        notificationsEnabled: chatMemberships.notificationsEnabled,
        privateChatStartedAt: users.privateChatStartedAt,
        telegramChatId: chats.telegramChatId,
        timezone: chats.timezone,
        title: commitments.title,
        workspaceId: commitments.workspaceId,
      })
      .from(commitments)
      .innerJoin(chats, and(eq(commitments.chatId, chats.id), eq(commitments.workspaceId, chats.workspaceId)))
      .innerJoin(
        chatMemberships,
        and(
          eq(commitments.assigneeUserId, chatMemberships.userId),
          eq(commitments.chatId, chatMemberships.chatId),
          eq(commitments.workspaceId, chatMemberships.workspaceId),
        ),
      )
      .innerJoin(users, eq(commitments.assigneeUserId, users.id))
      .where(
        and(
          eq(commitments.status, 'open'),
          eq(chats.isActive, true),
          isNotNull(commitments.dueAt),
          lte(commitments.dueAt, now),
        ),
      );

    let delivered = 0;
    let failed = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      if (!candidate.assigneeUserId || !candidate.dueAt) {
        skipped += 1;
        continue;
      }
      const dueLocalDate = localDate(candidate.dueAt, candidate.timezone);
      const nowLocalDate = localDate(now, candidate.timezone);
      if (!dueLocalDate || !nowLocalDate) {
        skipped += 1;
        input.logger?.error('reminder_delivery_failed', {
          commitmentId: candidate.commitmentId,
          errorCode: 'INVALID_CHAT_TIMEZONE',
          result: 'failure',
          workspaceId: candidate.workspaceId,
        });
        continue;
      }
      const kind = dueLocalDate === nowLocalDate ? 'due' : 'overdue';
      if (kind === 'overdue') {
        try {
          await updateCommitment({
            chatId: candidate.chatId,
            commitmentId: candidate.commitmentId,
            status: 'overdue',
            workspaceId: candidate.workspaceId,
          });
        } catch (error: unknown) {
          if (error instanceof CommitmentUpdateError) {
            skipped += 1;
            continue;
          }
          throw error;
        }
      }
      if (!candidate.notificationsEnabled || !candidate.privateChatStartedAt) {
        skipped += 1;
        continue;
      }
      const delivery = await sendReminder({
        assigneeTelegramUserId: candidate.assigneeTelegramUserId,
        assigneeUserId: candidate.assigneeUserId,
        chatId: candidate.chatId,
        commitmentId: candidate.commitmentId,
        dueDateText: candidate.dueDateText,
        idempotencyKey: `reminder:${kind}:${candidate.commitmentId}:${kind === 'due' ? candidate.dueAt.toISOString() : nowLocalDate}`,
        kind,
        status: kind === 'due' ? 'open' : 'overdue',
        title: candidate.title,
        workspaceId: candidate.workspaceId,
      });
      if (delivery === 'sent') {
        delivered += 1;
      } else if (delivery === 'failed') {
        failed += 1;
      } else {
        skipped += 1;
      }
    }
    return { delivered, failed, skipped };
  };
}
