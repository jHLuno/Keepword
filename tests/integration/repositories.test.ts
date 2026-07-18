import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  chatMemberships,
  chats,
  commitments,
  notificationDeliveries,
  sourceMessages,
  users,
  workspaces,
} from '../../src/db/schema.js';
import { createChatsRepository } from '../../src/repositories/chats.js';
import { createCommitmentsRepository } from '../../src/repositories/commitments.js';
import { createDeliveriesRepository } from '../../src/repositories/deliveries.js';
import { createMessagesRepository } from '../../src/repositories/messages.js';
import { createUpdatesRepository } from '../../src/repositories/updates.js';
import { createUsersRepository } from '../../src/repositories/users.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;
let telegramChatId = 20_000;

type CommitmentFixture = Readonly<{
  chatId: string;
  commitmentId: string;
  messageId: string;
  otherChatId: string;
  telegramUserId: number;
  userId: string;
  workspaceId: string;
}>;

function firstRow<Row>(rows: readonly Row[]): Row {
  const row = rows[0];

  if (!row) {
    throw new Error('Expected an inserted row');
  }

  return row;
}

async function createCommitmentFixture(): Promise<CommitmentFixture> {
  const workspace = firstRow(await database.db.insert(workspaces).values({ name: 'Repository workspace' }).returning());
  const chat = firstRow(
    await database.db
      .insert(chats)
      .values({
        workspaceId: workspace.id,
        telegramChatId: telegramChatId++,
        title: 'Primary chat',
      })
      .returning(),
  );
  const otherChat = firstRow(
    await database.db
      .insert(chats)
      .values({
        workspaceId: workspace.id,
        telegramChatId: telegramChatId++,
        title: 'Other chat',
      })
      .returning(),
  );
  const user = firstRow(
    await database.db
      .insert(users)
      .values({
        firstName: 'Repository member',
        telegramUserId: telegramChatId++,
      })
      .returning(),
  );
  await database.db.insert(chatMemberships).values({
    chatId: chat.id,
    userId: user.id,
    workspaceId: workspace.id,
  });
  const message = firstRow(
    await database.db
      .insert(sourceMessages)
      .values({
        authorUserId: user.id,
        chatId: chat.id,
        messageText: 'Source text used only by the database fixture',
        sentAt: new Date(),
        telegramMessageId: telegramChatId++,
        workspaceId: workspace.id,
      })
      .returning(),
  );
  const commitment = firstRow(
    await database.db
      .insert(commitments)
      .values({
        chatId: chat.id,
        title: 'Send proposal',
        workspaceId: workspace.id,
      })
      .returning(),
  );

  return {
    chatId: chat.id,
    commitmentId: commitment.id,
    messageId: message.id,
    otherChatId: otherChat.id,
    telegramUserId: user.telegramUserId,
    userId: user.id,
    workspaceId: workspace.id,
  };
}

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('repositories', () => {
  test('records a Telegram update once', async () => {
    const updates = createUpdatesRepository(database.db);

    await expect(updates.recordUpdate(1_001)).resolves.toBe(true);
    await expect(updates.recordUpdate(1_001)).resolves.toBe(false);
  });

  test('cannot read a commitment from another chat', async () => {
    const fixture = await createCommitmentFixture();
    const commitmentsRepository = createCommitmentsRepository(database.db);

    await expect(
      commitmentsRepository.findScopedCommitment({
        workspaceId: fixture.workspaceId,
        chatId: fixture.otherChatId,
        commitmentId: fixture.commitmentId,
      }),
    ).resolves.toBeNull();
  });

  test('finds a chat only within its workspace', async () => {
    const fixture = await createCommitmentFixture();
    const chatsRepository = createChatsRepository(database.db);

    await expect(
      chatsRepository.findScopedChat({ workspaceId: fixture.workspaceId, chatId: fixture.chatId }),
    ).resolves.toMatchObject({ id: fixture.chatId, workspaceId: fixture.workspaceId });
  });

  test('cannot find a member from another chat', async () => {
    const fixture = await createCommitmentFixture();
    const usersRepository = createUsersRepository(database.db);

    await expect(
      usersRepository.findScopedMember({
        workspaceId: fixture.workspaceId,
        chatId: fixture.otherChatId,
        telegramUserId: fixture.telegramUserId,
      }),
    ).resolves.toBeNull();
  });

  test('cannot find a source message from another chat', async () => {
    const fixture = await createCommitmentFixture();
    const messagesRepository = createMessagesRepository(database.db);

    await expect(
      messagesRepository.findScopedMessage({
        workspaceId: fixture.workspaceId,
        chatId: fixture.otherChatId,
        messageId: fixture.messageId,
      }),
    ).resolves.toBeNull();
  });

  test('claims a pending delivery only once', async () => {
    const fixture = await createCommitmentFixture();
    const deliveryKey = `reminder-${fixture.commitmentId}`;
    const deliveries = createDeliveriesRepository(database.db);

    await database.db.insert(notificationDeliveries).values({
      chatId: fixture.chatId,
      commitmentId: fixture.commitmentId,
      idempotencyKey: deliveryKey,
      kind: 'reminder',
      workspaceId: fixture.workspaceId,
    });

    await expect(Promise.all([deliveries.claimDelivery(deliveryKey), deliveries.claimDelivery(deliveryKey)])).resolves.toEqual(
      expect.arrayContaining(['claimed', 'in-progress']),
    );
  });

  test('recovers a stale claim before send starts but keeps the new claim exclusive', async () => {
    const fixture = await createCommitmentFixture();
    const deliveryKey = `stale-reminder-${fixture.commitmentId}`;
    const deliveries = createDeliveriesRepository(database.db);

    await database.db.insert(notificationDeliveries).values({
      chatId: fixture.chatId,
      commitmentId: fixture.commitmentId,
      idempotencyKey: deliveryKey,
      kind: 'reminder',
      status: 'claimed',
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
      userId: fixture.userId,
      workspaceId: fixture.workspaceId,
    });

    await expect(deliveries.createAndClaimDelivery({
      chatId: fixture.chatId,
      commitmentId: fixture.commitmentId,
      idempotencyKey: deliveryKey,
      kind: 'reminder',
      userId: fixture.userId,
      workspaceId: fixture.workspaceId,
    })).resolves.toBe('claimed');
    await expect(deliveries.createAndClaimDelivery({
      chatId: fixture.chatId,
      commitmentId: fixture.commitmentId,
      idempotencyKey: deliveryKey,
      kind: 'reminder',
      userId: fixture.userId,
      workspaceId: fixture.workspaceId,
    })).resolves.toBe('in-progress');
  });

  test('does not recover a stale processing delivery because Telegram may have accepted it', async () => {
    const fixture = await createCommitmentFixture();
    const deliveryKey = `uncertain-reminder-${fixture.commitmentId}`;
    const deliveries = createDeliveriesRepository(database.db);

    await database.db.insert(notificationDeliveries).values({
      chatId: fixture.chatId,
      commitmentId: fixture.commitmentId,
      idempotencyKey: deliveryKey,
      kind: 'reminder',
      status: 'processing',
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
      userId: fixture.userId,
      workspaceId: fixture.workspaceId,
    });

    await expect(deliveries.createAndClaimDelivery({
      chatId: fixture.chatId,
      commitmentId: fixture.commitmentId,
      idempotencyKey: deliveryKey,
      kind: 'reminder',
      userId: fixture.userId,
      workspaceId: fixture.workspaceId,
    })).resolves.toBe('in-progress');
  });

  test('releases a claim immediately when send setup fails before Telegram starts', async () => {
    const fixture = await createCommitmentFixture();
    const deliveryKey = `setup-failure-${fixture.commitmentId}`;
    const deliveries = createDeliveriesRepository(database.db);

    await database.db.insert(notificationDeliveries).values({
      chatId: fixture.chatId,
      commitmentId: fixture.commitmentId,
      idempotencyKey: deliveryKey,
      kind: 'reminder',
      status: 'claimed',
      userId: fixture.userId,
      workspaceId: fixture.workspaceId,
    });
    await deliveries.recordFailure(deliveryKey, 'SETUP_FAILED');

    await expect(deliveries.createAndClaimDelivery({
      chatId: fixture.chatId,
      commitmentId: fixture.commitmentId,
      idempotencyKey: deliveryKey,
      kind: 'reminder',
      userId: fixture.userId,
      workspaceId: fixture.workspaceId,
    })).resolves.toBe('claimed');
  });

  test('does not reclaim a sent delivery', async () => {
    const fixture = await createCommitmentFixture();
    const deliveryKey = `digest-${fixture.commitmentId}`;
    const deliveries = createDeliveriesRepository(database.db);

    await database.db.insert(notificationDeliveries).values({
      chatId: fixture.chatId,
      commitmentId: fixture.commitmentId,
      idempotencyKey: deliveryKey,
      kind: 'digest',
      status: 'sent',
      workspaceId: fixture.workspaceId,
    });

    await expect(deliveries.claimDelivery(deliveryKey)).resolves.toBe('already-sent');
    await expect(
      database.db
        .select({ status: notificationDeliveries.status })
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.idempotencyKey, deliveryKey),
            eq(notificationDeliveries.workspaceId, fixture.workspaceId),
          ),
        ),
    ).resolves.toEqual([{ status: 'sent' }]);
  });
});
