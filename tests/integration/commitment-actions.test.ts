import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createUpdateCommitment } from '../../src/services/update-commitment.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { commitments } from '../../src/db/schema.js';

let database: PgliteTestDatabase;
let telegramChatId = 80_000;

async function createOpenCommitment(): Promise<Readonly<{ chatId: string; commitmentId: string; workspaceId: string }>> {
  telegramChatId += 1;
  const chat = await createConnectChat(database.db)({
    adminTelegramUserId: '8201',
    telegramChatId: String(telegramChatId),
    timezone: 'UTC',
    title: 'Commitment action test chat',
  });
  const rows = await database.db
    .insert(commitments)
    .values({
      chatId: chat.chatId,
      title: 'Отправить КП',
      workspaceId: chat.workspaceId,
    })
    .returning();
  const commitment = rows[0];
  if (!commitment) {
    throw new Error('Expected a commitment');
  }
  return { chatId: chat.chatId, commitmentId: commitment.id, workspaceId: chat.workspaceId };
}

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('commitment status actions', () => {
  test('allows the documented open and blocked status transitions', async () => {
    const fixture = await createOpenCommitment();
    const updateCommitment = createUpdateCommitment(database.db);

    await expect(updateCommitment({ ...fixture, status: 'blocked' })).resolves.toMatchObject({ status: 'blocked' });
    await expect(updateCommitment({ ...fixture, status: 'open' })).resolves.toMatchObject({ status: 'open' });
    await expect(updateCommitment({ ...fixture, status: 'completed' })).resolves.toMatchObject({ status: 'completed' });
  });

  test('does not reopen a terminal commitment', async () => {
    const fixture = await createOpenCommitment();
    const updateCommitment = createUpdateCommitment(database.db);

    await updateCommitment({ ...fixture, status: 'cancelled' });

    await expect(updateCommitment({ ...fixture, status: 'open' })).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
  });
});
