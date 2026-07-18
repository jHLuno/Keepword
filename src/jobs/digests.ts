import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chatMemberships, chats, commitments, users } from '../db/schema.js';
import type { JobResult } from './reminders.js';
import type { Logger } from '../observability/logger.js';
import type { RepositoryDatabase } from '../repositories/database.js';
import { createCommitmentsRepository } from '../repositories/commitments.js';
import { createCalibrationRepository } from '../repositories/calibration.js';
import { createReliabilityRepository } from '../repositories/reliability.js';
import {
  buildAdminDigest,
  buildUserDigest,
  createSendDigest,
  type DigestCommitment,
  type DigestMessenger,
  type SendDigest,
} from '../services/send-digest.js';
import { renderAdminDigest, renderUserDigest } from '../telegram/messages.js';
import type { CurrentChatAdminChecker } from '../services/authorize-action.js';

export type RunDigestJob = (now: Date) => Promise<JobResult>;

type LocalTime = Readonly<{ date: string; time: string }>;

function localTime(now: Date, timezone: string): LocalTime | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      timeZone: timezone,
      year: 'numeric',
    }).formatToParts(now);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = values.get('year');
    const month = values.get('month');
    const day = values.get('day');
    const hour = values.get('hour');
    const minute = values.get('minute');
    const second = values.get('second');
    if (!year || !month || !day || !hour || !minute || !second) {
      return null;
    }
    return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}:${second}` };
  } catch {
    return null;
  }
}

function deliveryResult(result: Awaited<ReturnType<SendDigest>>): keyof JobResult {
  if (result === 'sent') {
    return 'delivered';
  }
  return result === 'failed' ? 'failed' : 'skipped';
}

export function createDigestJob<TQueryResult extends PgQueryResultHKT>(input: Readonly<{
  database: RepositoryDatabase<TQueryResult>;
  isCurrentChatAdmin: CurrentChatAdminChecker;
  logger?: Logger;
  messenger: DigestMessenger;
}>): RunDigestJob {
  const sendDigest = createSendDigest(input);
  const calibrationRepository = createCalibrationRepository(input.database);
  const reliabilityRepository = createReliabilityRepository(input.database);
  const commitmentsRepository = createCommitmentsRepository(input.database);
  return async (now) => {
    const activeChats = await input.database
      .select({
        dailyDigestTime: chats.dailyDigestTime,
        id: chats.id,
        telegramChatId: chats.telegramChatId,
        timezone: chats.timezone,
        workspaceId: chats.workspaceId,
      })
      .from(chats)
      .where(eq(chats.isActive, true));

    const result = { delivered: 0, failed: 0, skipped: 0 };
    for (const chat of activeChats) {
      const local = localTime(now, chat.timezone);
      if (!local) {
        result.skipped += 1;
        input.logger?.error('daily_digest_failed', {
          errorCode: 'INVALID_CHAT_TIMEZONE',
          result: 'failure',
          workspaceId: chat.workspaceId,
        });
        continue;
      }
      if (local.time < chat.dailyDigestTime) {
        continue;
      }
      const [chatCommitments, recipients, reviewTitles, calibration, reliability] = await Promise.all([
        input.database
          .select({
            assigneeUserId: commitments.assigneeUserId,
            completedAt: commitments.completedAt,
            dueAt: commitments.dueAt,
            id: commitments.id,
            status: commitments.status,
            title: commitments.title,
          })
          .from(commitments)
          .where(and(eq(commitments.chatId, chat.id), eq(commitments.workspaceId, chat.workspaceId))),
        input.database
          .select({
            notificationsEnabled: chatMemberships.notificationsEnabled,
            privateChatStartedAt: users.privateChatStartedAt,
            role: chatMemberships.role,
            telegramUserId: users.telegramUserId,
            userId: users.id,
          })
          .from(chatMemberships)
          .innerJoin(users, eq(chatMemberships.userId, users.id))
          .where(and(eq(chatMemberships.chatId, chat.id), eq(chatMemberships.workspaceId, chat.workspaceId))),
        commitmentsRepository.findPendingSuggestionTitles({ chatId: chat.id, workspaceId: chat.workspaceId }),
        calibrationRepository.findChatCalibration({
          chatId: chat.id,
          now,
          workspaceId: chat.workspaceId,
        }),
        reliabilityRepository.findChatReliability({
          chatId: chat.id,
          now,
          workspaceId: chat.workspaceId,
        }),
      ]);
      const digestInput = {
        ...(calibration ? { calibration } : {}),
        ...(reliability.length > 0 ? { reliability } : {}),
        chatId: chat.id,
        commitments: chatCommitments as readonly DigestCommitment[],
        date: local.date,
        reviewTitles,
        timezone: chat.timezone,
      };
      for (const recipient of recipients) {
        if (!recipient.notificationsEnabled || !recipient.privateChatStartedAt) {
          result.skipped += 1;
          continue;
        }
        const personal = buildUserDigest({ ...digestInput, userId: recipient.userId });
        const personalResult = await sendDigest({
          chatId: chat.id,
          idempotencyKey: `digest:${chat.id}:${recipient.userId}:${local.date}:personal`,
          kind: 'personal',
          telegramUserId: recipient.telegramUserId,
          text: renderUserDigest(personal),
          userId: recipient.userId,
          workspaceId: chat.workspaceId,
        });
        result[deliveryResult(personalResult)] += 1;
        if (recipient.role !== 'admin') {
          continue;
        }
        const isCurrentAdmin = await input.isCurrentChatAdmin({
          telegramChatId: String(chat.telegramChatId),
          telegramUserId: recipient.telegramUserId,
        }).catch(() => false);
        if (!isCurrentAdmin) {
          input.logger?.info('authorization_denied', {
            errorCode: 'CURRENT_ADMIN_UNVERIFIED',
            result: 'failure',
            telegramUserId: String(recipient.telegramUserId),
            workspaceId: chat.workspaceId,
          });
          continue;
        }
        const admin = buildAdminDigest(digestInput);
        const adminResult = await sendDigest({
          chatId: chat.id,
          idempotencyKey: `digest:${chat.id}:${recipient.userId}:${local.date}:admin`,
          kind: 'admin',
          telegramUserId: recipient.telegramUserId,
          text: renderAdminDigest(admin),
          userId: recipient.userId,
          workspaceId: chat.workspaceId,
        });
        result[deliveryResult(adminResult)] += 1;
      }
    }
    return result;
  };
}
