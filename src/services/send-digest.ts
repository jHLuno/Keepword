import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type { Logger } from '../observability/logger.js';
import type { RepositoryDatabase } from '../repositories/database.js';
import { createDeliveriesRepository, type DeliveriesRepository } from '../repositories/deliveries.js';

export type DigestAttention = 'due-today' | 'due-tomorrow' | 'no-deadline' | 'overdue';

export type DigestItem = Readonly<{
  attention: DigestAttention;
  commitmentId: string;
  title: string;
}>;

export type DigestCommitment = Readonly<{
  assigneeUserId: string | null;
  completedAt: Date | null;
  dueAt: Date | null;
  id: string;
  status: 'blocked' | 'cancelled' | 'completed' | 'open' | 'overdue';
  title: string;
}>;

export type DigestSummary = Readonly<{
  completedToday: number;
  date: string;
  dueTomorrow: number;
  items: readonly DigestItem[];
  open: number;
  overdue: number;
}>;

export type TeamRiskSummary = Readonly<{
  completedToday: number;
  date: string;
  dueTomorrow: number;
  open: number;
  overdue: number;
  riskTitles: readonly string[];
  reviewTitles: readonly string[];
}>;

export type DigestMessenger = Readonly<{
  sendPrivateMessage: (input: Readonly<{ telegramUserId: number; text: string }>) => Promise<void>;
}>;

export type SendDigest = (input: Readonly<{
  chatId: string;
  idempotencyKey: string;
  kind: 'admin' | 'personal';
  telegramUserId: number;
  text: string;
  userId: string;
  workspaceId: string;
}>) => Promise<'already-sent' | 'delivery-uncertain' | 'failed' | 'in-progress' | 'sent'>;

type DigestBuildInput = Readonly<{
  chatId: string;
  commitments: readonly DigestCommitment[];
  date: string;
  reviewTitles?: readonly string[];
  timezone: string;
}>;

function localDate(date: Date, timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      timeZone: timezone,
      year: 'numeric',
    }).formatToParts(date);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = values.get('year');
    const month = values.get('month');
    const day = values.get('day');
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

function tomorrow(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('Invalid local date');
  }
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function isOverdue(commitment: DigestCommitment, input: DigestBuildInput): boolean {
  if (commitment.status === 'overdue') {
    return true;
  }
  const dueDate = commitment.dueAt ? localDate(commitment.dueAt, input.timezone) : null;
  return commitment.status === 'open' && dueDate !== null && dueDate < input.date;
}

function isActive(commitment: DigestCommitment): boolean {
  return commitment.status === 'blocked' || commitment.status === 'open' || commitment.status === 'overdue';
}

function attentionFor(commitment: DigestCommitment, input: DigestBuildInput): DigestAttention | null {
  if (!isActive(commitment)) {
    return null;
  }
  if (isOverdue(commitment, input)) {
    return 'overdue';
  }
  if (!commitment.dueAt) {
    return 'no-deadline';
  }
  const dueDate = localDate(commitment.dueAt, input.timezone);
  if (dueDate === input.date) {
    return 'due-today';
  }
  return dueDate === tomorrow(input.date) ? 'due-tomorrow' : null;
}

function counts(input: DigestBuildInput): Omit<DigestSummary, 'items'> {
  const nextDate = tomorrow(input.date);
  return input.commitments.reduce<Omit<DigestSummary, 'items'>>((summary, commitment) => {
    const completedToday = commitment.status === 'completed'
      && commitment.completedAt !== null
      && localDate(commitment.completedAt, input.timezone) === input.date;
    const dueTomorrow = commitment.status === 'open'
      && commitment.dueAt !== null
      && localDate(commitment.dueAt, input.timezone) === nextDate;
    return {
      ...summary,
      completedToday: summary.completedToday + Number(completedToday),
      dueTomorrow: summary.dueTomorrow + Number(dueTomorrow),
      open: summary.open + Number(commitment.status === 'open'),
      overdue: summary.overdue + Number(isOverdue(commitment, input)),
    };
  }, { completedToday: 0, date: input.date, dueTomorrow: 0, open: 0, overdue: 0 });
}

export function buildUserDigest(input: DigestBuildInput & Readonly<{ userId: string }>): DigestSummary {
  const recipientCommitments = input.commitments.filter((commitment) => commitment.assigneeUserId === input.userId);
  const scoped = { ...input, commitments: recipientCommitments };
  return {
    ...counts(scoped),
    items: recipientCommitments.flatMap((commitment) => {
      const attention = attentionFor(commitment, scoped);
      return attention ? [{ attention, commitmentId: commitment.id, title: commitment.title }] : [];
    }),
  };
}

export function buildAdminDigest(input: DigestBuildInput): TeamRiskSummary {
  return {
    ...counts(input),
    riskTitles: input.commitments.flatMap((commitment) => {
      if (!isActive(commitment) || isOverdue(commitment, input) || !commitment.dueAt) {
        return isActive(commitment) ? [commitment.title] : [];
      }
      return [];
    }),
    reviewTitles: input.reviewTitles ?? [],
  };
}

export function createSendDigest<TQueryResult extends PgQueryResultHKT>(input: Readonly<{
  database: RepositoryDatabase<TQueryResult>;
  deliveries?: DeliveriesRepository;
  logger?: Logger;
  messenger: DigestMessenger;
}>): SendDigest {
  const deliveries = input.deliveries ?? createDeliveriesRepository(input.database);
  return async (digest) => {
    const claim = await deliveries.createAndClaimDelivery({
      chatId: digest.chatId,
      commitmentId: null,
      idempotencyKey: digest.idempotencyKey,
      kind: `digest_${digest.kind}`,
      userId: digest.userId,
      workspaceId: digest.workspaceId,
    });
    if (claim !== 'claimed') {
      return claim;
    }
    try {
      await deliveries.markSending(digest.idempotencyKey);
    } catch {
      await deliveries.releaseClaim(digest.idempotencyKey, 'DELIVERY_START_FAILED');
      input.logger?.error('daily_digest_failed', {
        errorCode: 'DELIVERY_START_FAILED',
        result: 'failure',
        telegramUserId: String(digest.telegramUserId),
        workspaceId: digest.workspaceId,
      });
      return 'failed';
    }
    try {
      await input.messenger.sendPrivateMessage({ telegramUserId: digest.telegramUserId, text: digest.text });
    } catch {
      input.logger?.error('daily_digest_reconciliation_needed', {
        errorCode: 'TELEGRAM_SEND_STATE_UNCONFIRMED',
        result: 'failure',
        telegramUserId: String(digest.telegramUserId),
        workspaceId: digest.workspaceId,
      });
      return 'delivery-uncertain';
    }
    try {
      await deliveries.markSent(digest.idempotencyKey);
    } catch {
      input.logger?.error('daily_digest_failed', {
        errorCode: 'DELIVERY_SENT_STATE_UNCONFIRMED',
        result: 'failure',
        telegramUserId: String(digest.telegramUserId),
        workspaceId: digest.workspaceId,
      });
      return 'delivery-uncertain';
    }
    input.logger?.info('daily_digest_sent', {
      result: 'success',
      telegramUserId: String(digest.telegramUserId),
      workspaceId: digest.workspaceId,
    });
    return 'sent';
  };
}
