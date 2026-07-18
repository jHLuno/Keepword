import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { AppError } from '../domain/errors.js';
import { notificationDeliveries } from '../db/schema.js';

import type { RepositoryDatabase } from './database.js';

export type DeliveryClaimResult = 'claimed' | 'already-sent' | 'in-progress';

export type DeliveriesRepository = Readonly<{
  claimDelivery: (key: string) => Promise<DeliveryClaimResult>;
}>;

export function createDeliveriesRepository<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): DeliveriesRepository {
  return {
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
  };
}
