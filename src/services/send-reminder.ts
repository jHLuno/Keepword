import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type { Logger } from '../observability/logger.js';
import { createDeliveriesRepository, type DeliveriesRepository } from '../repositories/deliveries.js';
import type { RepositoryDatabase } from '../repositories/database.js';
import { createCallbackTokenService } from './callback-tokens.js';
import { renderReminderCard, type InlineKeyboardMarkup } from '../telegram/messages.js';

export type ReminderMessenger = Readonly<{
  sendPrivateMessage: (input: Readonly<{
    replyMarkup: InlineKeyboardMarkup;
    telegramUserId: number;
    text: string;
  }>) => Promise<void>;
}>;

export type SendReminder = (input: Readonly<{
  assigneeUserId: string;
  assigneeTelegramUserId: number;
  chatId: string;
  commitmentId: string;
  dueDateText: string | null;
  idempotencyKey: string;
  kind: 'due' | 'overdue';
  status: 'open' | 'overdue';
  title: string;
  workspaceId: string;
}>) => Promise<'already-sent' | 'delivery-uncertain' | 'failed' | 'in-progress' | 'sent'>;

export function createSendReminder<TQueryResult extends PgQueryResultHKT>(input: Readonly<{
  callbackSigningSecret: string;
  database: RepositoryDatabase<TQueryResult>;
  deliveries?: DeliveriesRepository;
  logger?: Logger;
  messenger: ReminderMessenger;
}>): SendReminder {
  const deliveries = input.deliveries ?? createDeliveriesRepository(input.database);
  const callbacks = createCallbackTokenService(input.database);

  return async (reminder) => {
    const claim = await deliveries.createAndClaimDelivery({
      chatId: reminder.chatId,
      commitmentId: reminder.commitmentId,
      idempotencyKey: reminder.idempotencyKey,
      kind: `reminder_${reminder.kind}`,
      userId: reminder.assigneeUserId,
      workspaceId: reminder.workspaceId,
    });
    if (claim !== 'claimed') {
      return claim;
    }
    let card: ReturnType<typeof renderReminderCard>;
    try {
      const nonces = await callbacks.issueCommitmentCallbacks({
        actions: ['complete', 'block', 'cancel', 'reschedule'],
        commitmentId: reminder.commitmentId,
      });
      if (!nonces.complete || !nonces.block || !nonces.cancel || !nonces.reschedule) {
        throw new Error('Could not issue reminder callbacks');
      }
      card = renderReminderCard({
        dueDateText: reminder.dueDateText,
        status: reminder.status,
        title: reminder.title,
      }, {
        block: nonces.block,
        cancel: nonces.cancel,
        complete: nonces.complete,
        reschedule: nonces.reschedule,
      }, input.callbackSigningSecret);
    } catch {
      await deliveries.releaseClaim(reminder.idempotencyKey, 'REMINDER_SETUP_FAILED');
      input.logger?.error('reminder_delivery_failed', {
        commitmentId: reminder.commitmentId,
        errorCode: 'REMINDER_SETUP_FAILED',
        result: 'failure',
        telegramUserId: String(reminder.assigneeTelegramUserId),
        workspaceId: reminder.workspaceId,
      });
      return 'failed';
    }
    try {
      await deliveries.markSending(reminder.idempotencyKey);
    } catch {
      await deliveries.releaseClaim(reminder.idempotencyKey, 'DELIVERY_START_FAILED');
      input.logger?.error('reminder_delivery_failed', {
        commitmentId: reminder.commitmentId,
        errorCode: 'DELIVERY_START_FAILED',
        result: 'failure',
        telegramUserId: String(reminder.assigneeTelegramUserId),
        workspaceId: reminder.workspaceId,
      });
      return 'failed';
    }
    try {
      await input.messenger.sendPrivateMessage({
        replyMarkup: card.replyMarkup,
        telegramUserId: reminder.assigneeTelegramUserId,
        text: card.text,
      });
    } catch {
      input.logger?.error('reminder_delivery_reconciliation_needed', {
        commitmentId: reminder.commitmentId,
        errorCode: 'TELEGRAM_SEND_STATE_UNCONFIRMED',
        result: 'failure',
        telegramUserId: String(reminder.assigneeTelegramUserId),
        workspaceId: reminder.workspaceId,
      });
      return 'delivery-uncertain';
    }
    try {
      await deliveries.markSent(reminder.idempotencyKey);
    } catch {
      input.logger?.error('reminder_delivery_reconciliation_needed', {
        commitmentId: reminder.commitmentId,
        errorCode: 'DELIVERY_SENT_STATE_UNCONFIRMED',
        result: 'failure',
        telegramUserId: String(reminder.assigneeTelegramUserId),
        workspaceId: reminder.workspaceId,
      });
      return 'delivery-uncertain';
    }
    input.logger?.info('reminder_sent', {
      commitmentId: reminder.commitmentId,
      result: 'success',
      telegramUserId: String(reminder.assigneeTelegramUserId),
      workspaceId: reminder.workspaceId,
    });
    return 'sent';
  };
}
