import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  chatMemberships,
  chats,
  commitments,
  notificationDeliveries,
  onboardingTokens,
  processedUpdates,
  sourceMessages,
  users,
  workspaces,
} from '../../src/db/schema.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;
let telegramId = 10_000;

type ScopedFixture = Readonly<{
  chatId: string;
  memberUserId: string;
  outsiderUserId: string;
  otherWorkspaceId: string;
  workspaceId: string;
}>;

function firstRow<Row>(rows: readonly Row[]): Row {
  const row = rows[0];

  if (!row) {
    throw new Error('Expected an inserted row');
  }

  return row;
}

async function createScopedFixture(): Promise<ScopedFixture> {
  const workspace = firstRow(await database.db.insert(workspaces).values({ name: 'Workspace A' }).returning());
  const otherWorkspace = firstRow(
    await database.db.insert(workspaces).values({ name: 'Workspace B' }).returning(),
  );
  const chat = firstRow(
    await database.db
      .insert(chats)
      .values({
        workspaceId: workspace.id,
        telegramChatId: telegramId++,
        title: 'Workspace A chat',
      })
      .returning(),
  );
  const member = firstRow(
    await database.db
      .insert(users)
      .values({ firstName: 'Member', telegramUserId: telegramId++ })
      .returning(),
  );
  const outsider = firstRow(
    await database.db
      .insert(users)
      .values({ firstName: 'Outsider', telegramUserId: telegramId++ })
      .returning(),
  );

  await database.db.insert(chatMemberships).values({
    chatId: chat.id,
    userId: member.id,
    workspaceId: workspace.id,
  });

  return {
    chatId: chat.id,
    memberUserId: member.id,
    otherWorkspaceId: otherWorkspace.id,
    outsiderUserId: outsider.id,
    workspaceId: workspace.id,
  };
}

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
    const fixture = await createScopedFixture();

    await database.db.insert(notificationDeliveries).values({
      chatId: fixture.chatId,
      idempotencyKey: 'schema-test-reminder-42',
      kind: 'reminder',
      workspaceId: fixture.workspaceId,
    });

    await expect(
      database.db.insert(notificationDeliveries).values({
        chatId: fixture.chatId,
        idempotencyKey: 'schema-test-reminder-42',
        kind: 'reminder',
        workspaceId: fixture.workspaceId,
      }),
    ).rejects.toThrow();
  });

  test('rejects a source message whose chat belongs to another workspace', async () => {
    const fixture = await createScopedFixture();

    await expect(
      database.db.insert(sourceMessages).values({
        authorUserId: fixture.memberUserId,
        chatId: fixture.chatId,
        messageText: 'Private source text',
        sentAt: new Date(),
        telegramMessageId: telegramId++,
        workspaceId: fixture.otherWorkspaceId,
      }),
    ).rejects.toThrow();
  });

  test('rejects non-member source authors and commitment/onboarding actors', async () => {
    const fixture = await createScopedFixture();

    await expect(
      database.db.insert(sourceMessages).values({
        authorUserId: fixture.outsiderUserId,
        chatId: fixture.chatId,
        messageText: 'Private source text',
        sentAt: new Date(),
        telegramMessageId: telegramId++,
        workspaceId: fixture.workspaceId,
      }),
    ).rejects.toThrow();

    await expect(
      database.db.insert(commitments).values({
        assigneeUserId: fixture.outsiderUserId,
        chatId: fixture.chatId,
        title: 'Send proposal',
        workspaceId: fixture.workspaceId,
      }),
    ).rejects.toThrow();

    await expect(
      database.db.insert(commitments).values({
        chatId: fixture.chatId,
        confirmedByUserId: fixture.outsiderUserId,
        title: 'Confirm proposal',
        workspaceId: fixture.workspaceId,
      }),
    ).rejects.toThrow();

    await expect(
      database.db.insert(onboardingTokens).values({
        chatId: fixture.chatId,
        expiresAt: new Date(Date.now() + 60_000),
        tokenHash: `token-hash-${telegramId++}`,
        usedByUserId: fixture.outsiderUserId,
        workspaceId: fixture.workspaceId,
      }),
    ).rejects.toThrow();
  });
});
