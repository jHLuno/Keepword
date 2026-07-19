import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createAuthorizedCommitmentAction, createUpdateCommitment } from '../../src/services/update-commitment.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { chatMemberships, commitments } from '../../src/db/schema.js';
import { and, eq } from 'drizzle-orm';
import { createCallbackTokenService } from '../../src/services/callback-tokens.js';
import { createSignedCallback } from '../../src/telegram/callback-data.js';
import { createCommitmentActionCallbackHandler } from '../../src/telegram/handlers/callback.js';

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

  test('does not consume a lifecycle callback token when a participant is denied', async () => {
    const fixture = await createOpenCommitment();
    const nonce = (await createCallbackTokenService(database.db).issueCommitmentCallbacks({
      actions: ['complete'], commitmentId: fixture.commitmentId,
    })).complete;
    if (!nonce) throw new Error('Expected lifecycle nonce');
    const callbackData = createSignedCallback('complete', nonce, 'callback-test-secret');
    const handler = createCommitmentActionCallbackHandler({
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      isCurrentChatAdmin: () => Promise.resolve(false),
    });
    const callbackAs = async (telegramUserId: number): Promise<string[]> => {
      const answers: string[] = [];
      await handler({
        payload: { callback_query: {
          data: callbackData, from: { language_code: 'ru', first_name: 'User', id: telegramUserId }, id: `lifecycle-${telegramUserId}`,
          message: { chat: { id: Number(fixture.telegramChatId), type: 'supergroup' }, message_id: 1 },
        } },
        updateId: telegramUserId,
      }, { answerCallbackQuery: ({ text }) => { answers.push(text); return Promise.resolve(); } });
      return answers;
    };

    expect(await callbackAs(8203)).toContain('У вас нет прав на это действие.');
    expect(await callbackAs(8201)).toContain('Статус задачи обновлён.');
    await expect(createUpdateCommitment(database.db)({ ...fixture, status: 'open' }))
      .rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
  });

  test('allows complete, block, and cancel actions from an overdue reminder card', async () => {
    const updateCommitment = createUpdateCommitment(database.db);
    const completed = await createOpenCommitment();
    const blocked = await createOpenCommitment();
    const cancelled = await createOpenCommitment();

    await updateCommitment({ ...completed, status: 'overdue' });
    await updateCommitment({ ...blocked, status: 'overdue' });
    await updateCommitment({ ...cancelled, status: 'overdue' });

    await expect(updateCommitment({ ...completed, status: 'completed' })).resolves.toMatchObject({ status: 'completed' });
    await expect(updateCommitment({ ...blocked, status: 'blocked' })).resolves.toMatchObject({ status: 'blocked' });
    await expect(updateCommitment({ ...cancelled, status: 'cancelled' })).resolves.toMatchObject({ status: 'cancelled' });
  });

  test('authorizes an assignee status action from the private reminder card', async () => {
    const fixture = await createOpenCommitment();
    const nonce = (await createCallbackTokenService(database.db).issueCommitmentCallbacks({
      actions: ['complete'], commitmentId: fixture.commitmentId,
    })).complete;
    if (!nonce) throw new Error('Expected lifecycle nonce');
    const handler = createCommitmentActionCallbackHandler({
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      isCurrentChatAdmin: () => Promise.resolve(false),
    });

    await handler({
      payload: { callback_query: {
        data: createSignedCallback('complete', nonce, 'callback-test-secret'),
        from: { language_code: 'ru', first_name: 'Assignee', id: 8201 },
        id: 'private-reminder-complete',
        message: { chat: { id: 8201, type: 'private' }, message_id: 1 },
      } },
      updateId: 82_001,
    }, { answerCallbackQuery: () => Promise.resolve() });

    const updated = (await database.db.select().from(commitments).where(eq(commitments.id, fixture.commitmentId)))[0];
    expect(updated).toMatchObject({ status: 'completed' });
  });

  test('denies a private commitment callback to a participant and an administrator of another source chat', async () => {
    const fixture = await createOpenCommitment();
    const otherChat = await createConnectChat(database.db)({
      adminTelegramUserId: '8204', telegramChatId: '80004', timezone: 'UTC', title: 'Other source chat',
    });
    const nonce = (await createCallbackTokenService(database.db).issueCommitmentCallbacks({
      actions: ['complete'], commitmentId: fixture.commitmentId,
    })).complete;
    if (!nonce) throw new Error('Expected lifecycle nonce');
    const callbackData = createSignedCallback('complete', nonce, 'callback-test-secret');
    const handler = createCommitmentActionCallbackHandler({
      callbackSigningSecret: 'callback-test-secret',
      database: database.db,
      isCurrentChatAdmin: ({ telegramChatId, telegramUserId }) => Promise.resolve(
        telegramUserId === 8204 && telegramChatId === otherChat.telegramChatId,
      ),
    });
    const callbackAs = async (telegramUserId: number): Promise<string[]> => {
      const answers: string[] = [];
      await handler({
        payload: { callback_query: {
          data: callbackData, from: { language_code: 'ru', first_name: 'User', id: telegramUserId }, id: `private-denied-${telegramUserId}`,
          message: { chat: { id: telegramUserId, type: 'private' }, message_id: 1 },
        } },
        updateId: telegramUserId,
      }, { answerCallbackQuery: ({ text }) => { answers.push(text); return Promise.resolve(); } });
      return answers;
    };

    expect(await callbackAs(8203)).toContain('У вас нет прав на это действие.');
    expect(await callbackAs(8204)).toContain('У вас нет прав на это действие.');
    expect(await callbackAs(8201)).toContain('Статус задачи обновлён.');
  });
});
