import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createAuthorizedCommitmentAction, createUpdateCommitment } from '../../src/services/update-commitment.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { chatMemberships, commitments } from '../../src/db/schema.js';
import { and, eq } from 'drizzle-orm';

let database: PgliteTestDatabase;
let telegramChatId = 80_000;

async function createOpenCommitment(): Promise<Readonly<{
  chatId: string;
  commitmentId: string;
  telegramChatId: string;
  workspaceId: string;
}>> {
  telegramChatId += 1;
  const chat = await createConnectChat(database.db)({
    adminTelegramUserId: '8201',
    telegramChatId: String(telegramChatId),
    timezone: 'UTC',
    title: 'Commitment action test chat',
  });
  const membership = (
    await database.db
      .select({ userId: chatMemberships.userId })
      .from(chatMemberships)
      .where(and(eq(chatMemberships.chatId, chat.chatId), eq(chatMemberships.workspaceId, chat.workspaceId)))
      .limit(1)
  )[0];
  if (!membership) {
    throw new Error('Expected assignee membership');
  }
  const rows = await database.db
    .insert(commitments)
    .values({
      assigneeUserId: membership.userId,
      chatId: chat.chatId,
      title: 'Отправить КП',
      workspaceId: chat.workspaceId,
    })
    .returning();
  const commitment = rows[0];
  if (!commitment) {
    throw new Error('Expected a commitment');
  }
  return {
    chatId: chat.chatId,
    commitmentId: commitment.id,
    telegramChatId: String(telegramChatId),
    workspaceId: chat.workspaceId,
  };
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

  test('authorizes lifecycle actions only for the assignee or a fresh Telegram administrator', async () => {
    const assigneeCommitment = await createOpenCommitment();
    const action = createAuthorizedCommitmentAction(database.db, ({ telegramUserId }) =>
      Promise.resolve(telegramUserId === 8202),
    );

    await expect(
      action({
        action: 'complete',
        actor: { firstName: 'Assignee', telegramUserId: 8201 },
        commitmentId: assigneeCommitment.commitmentId,
        telegramChatId: assigneeCommitment.telegramChatId,
      }),
    ).resolves.toMatchObject({ status: 'completed' });

    const adminCommitment = await createOpenCommitment();
    await expect(
      action({
        action: 'block',
        actor: { firstName: 'Current admin', telegramUserId: 8202 },
        commitmentId: adminCommitment.commitmentId,
        telegramChatId: adminCommitment.telegramChatId,
      }),
    ).resolves.toMatchObject({ status: 'blocked' });

    const deniedCommitment = await createOpenCommitment();
    await expect(
      action({
        action: 'cancel',
        actor: { firstName: 'Participant', telegramUserId: 8203 },
        commitmentId: deniedCommitment.commitmentId,
        telegramChatId: deniedCommitment.telegramChatId,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
