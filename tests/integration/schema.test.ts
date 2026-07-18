import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  notificationDeliveries,
  processedUpdates,
} from '../../src/db/schema.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('persistence schema', () => {
  test('prevents a duplicate Telegram update ID', async () => {
    await database.db.insert(processedUpdates).values({ telegramUpdateId: 42 });

    await expect(
      database.db.insert(processedUpdates).values({ telegramUpdateId: 42 }),
    ).rejects.toThrow();
  });

  test('prevents reuse of a notification delivery idempotency key', async () => {
    await database.db.insert(notificationDeliveries).values({
      idempotencyKey: 'schema-test-reminder-42',
      kind: 'reminder',
    });

    await expect(
      database.db.insert(notificationDeliveries).values({
        idempotencyKey: 'schema-test-reminder-42',
        kind: 'reminder',
      }),
    ).rejects.toThrow();
  });
});
