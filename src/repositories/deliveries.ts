import { and, eq, or } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { AppError } from '../domain/errors.js';
import { notificationDeliveries } from '../db/schema.js';

import type { RepositoryDatabase } from './database.js';

export type DeliveryClaimResult = 'claimed' | 'already-sent' | 'in-progress';

export type DeliveriesRepository = Readonly<{
  claimDelivery: (key: string) => Promise<DeliveryClaimResult>;
  createAndClaimDelivery: (input: Readonly<{
    chatId: string;
    commitmentId: string | null;
    idempotencyKey: string;
    kind: string;
    userId: string;
    workspaceId: string;
  }>) => Promise<DeliveryClaimResult>;
  markSent: (key: string) => Promise<void>;
  recordFailure: (key: string, errorCode: string) => Promise<void>;
}>;

export function createDeliveriesRepository<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): DeliveriesRepository {
  return {
    async createAndClaimDelivery(input) {
      await database
        .insert(notificationDeliveries)
        .values({
          chatId: input.chatId,
          commitmentId: input.commitmentId,
          idempotencyKey: input.idempotencyKey,
          kind: input.kind,
          userId: input.userId,
          workspaceId: input.workspaceId,
        })
        .onConflictDoNothing();

      const claimed = await database
        .update(notificationDeliveries)
        .set({ errorCode: null, failedAt: null, status: 'processing', updatedAt: new Date() })
        .where(
          and(
            eq(notificationDeliveries.idempotencyKey, input.idempotencyKey),
            or(eq(notificationDeliveries.status, 'pending'), eq(notificationDeliveries.status, 'failed')),
          ),
        )
        .returning({ id: notificationDeliveries.id });
      if (claimed.length === 1) {
        return 'claimed';
      }
      const existing = await database
        .select({ status: notificationDeliveries.status })
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.idempotencyKey, input.idempotencyKey))
        .limit(1);
      const delivery = existing[0];
      if (!delivery) {
        throw new AppError('DELIVERY_FAILED', 'Notification delivery was not found');
      }
      return delivery.status === 'sent' ? 'already-sent' : 'in-progress';
    },

    async claimDelivery(key) {
      return database.transaction(async (transaction) => {
        const claimedDeliveries = await transaction
          .update(notificationDeliveries)
          .set({ status: 'processing', updatedAt: new Date() })
          .where(
            and(
              eq(notificationDeliveries.idempotencyKey, key),
              eq(notificationDeliveries.status, 'pending'),
            ),
          )
          .returning({ id: notificationDeliveries.id });

        if (claimedDeliveries.length === 1) {
          return 'claimed';
        }

        const deliveries = await transaction
          .select({ status: notificationDeliveries.status })
          .from(notificationDeliveries)
          .where(eq(notificationDeliveries.idempotencyKey, key))
          .limit(1);
        const delivery = deliveries[0];

        if (!delivery) {
          throw new AppError('DELIVERY_FAILED', 'Notification delivery was not found');
        }

        return delivery.status === 'sent' ? 'already-sent' : 'in-progress';
      });
    },

    async markSent(key) {
      const sentAt = new Date();
      await database
        .update(notificationDeliveries)
        .set({ errorCode: null, failedAt: null, sentAt, status: 'sent', updatedAt: sentAt })
        .where(and(eq(notificationDeliveries.idempotencyKey, key), eq(notificationDeliveries.status, 'processing')));
    },

    async recordFailure(key, errorCode) {
      const failedAt = new Date();
      await database
        .update(notificationDeliveries)
        .set({ errorCode, failedAt, status: 'failed', updatedAt: failedAt })
        .where(and(eq(notificationDeliveries.idempotencyKey, key), eq(notificationDeliveries.status, 'processing')));
    },
  };
}
