import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { chatMemberships, commitments, users } from '../../src/db/schema.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createOnboardingInvitationService } from '../../src/services/onboarding-invitation.js';
import { createOnboardingService } from '../../src/services/onboarding.js';
import { createGroupUpdateHandler } from '../../src/telegram/handlers/group.js';
import { createPrivateUpdateHandler } from '../../src/telegram/handlers/private.js';
import { createFakeTelegram } from '../helpers/fake-telegram.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('Telegram commands', () => {
  test('does not let a non-admin request chat notification status', async () => {
    const chat = await createConnectChat(database.db)({
      adminTelegramUserId: '9801',
      telegramChatId: '-1009801',
      timezone: 'UTC',
      title: 'Command permissions',
    });
    const handler = createGroupUpdateHandler({
      botUsername: 'keepword_test_bot',
      connectChat: createConnectChat(database.db),
      onboarding: createOnboardingService(database.db, { botUsername: 'keepword_test_bot' }),
      onboardingInvitations: createOnboardingInvitationService(database.db),
    });
    const fakeTelegram = createFakeTelegram({ currentAdminTelegramUserIds: [9801] });

    await fakeTelegram.telegramAdapterFactory(handler).handleUpdate(groupUpdate(chat.telegramChatId, 9802, '/notifications'));

    expect(fakeTelegram.groupMessages).toEqual([expect.stringContaining('Только администратор')]);
  });

  test('answers private help without running the ordinary-message flow', async () => {
    const handler = createPrivateUpdateHandler({ database: database.db });
    const fakeTelegram = createFakeTelegram();

    await fakeTelegram.telegramAdapterFactory(createNoopGroupHandler(), undefined, handler).handleUpdate(privateUpdate(9803, '/help'));

    expect(fakeTelegram.privateMessages).toEqual([expect.stringContaining('/tasks')]);
  });

  test('shows tasks and changes notifications only in the requesting user selected chat', async () => {
    const actorTelegramUserId = 9810;
    const firstChat = await createConnectChat(database.db)({
      adminTelegramUserId: String(actorTelegramUserId), telegramChatId: '-1009810', timezone: 'UTC', title: 'First group',
    });
    const secondChat = await createConnectChat(database.db)({
      adminTelegramUserId: String(actorTelegramUserId), telegramChatId: '-1009811', timezone: 'UTC', title: 'Second group',
    });
    const actor = (await database.db.select().from(users).where(eq(users.telegramUserId, actorTelegramUserId)).limit(1))[0];
    if (!actor) throw new Error('Expected actor');
    await database.db.update(users).set({ privateChatStartedAt: new Date() }).where(eq(users.id, actor.id));
    await database.db.update(chatMemberships).set({ notificationsEnabled: true }).where(eq(chatMemberships.userId, actor.id));
    const teammateTelegramUserId = 9812;
    const teammate = (await database.db.insert(users).values({ firstName: 'Teammate', telegramUserId: teammateTelegramUserId }).returning())[0];
    if (!teammate) throw new Error('Expected teammate');
    await database.db.insert(chatMemberships).values({ chatId: firstChat.chatId, userId: teammate.id, workspaceId: firstChat.workspaceId });
    await database.db.insert(commitments).values([
      { assigneeUserId: actor.id, chatId: firstChat.chatId, title: 'Visible task', workspaceId: firstChat.workspaceId },
      { assigneeUserId: teammate.id, chatId: firstChat.chatId, title: 'Private teammate task', workspaceId: firstChat.workspaceId },
      { assigneeUserId: actor.id, chatId: secondChat.chatId, title: 'Other group task', workspaceId: secondChat.workspaceId },
    ]);
    const handler = createPrivateUpdateHandler({ database: database.db });
    const fakeTelegram = createFakeTelegram();
    const adapter = fakeTelegram.telegramAdapterFactory(createNoopGroupHandler(), undefined, handler);

    await adapter.handleUpdate(privateUpdate(actorTelegramUserId, '/tasks'));
    expect(fakeTelegram.privateMessages[0]).toContain('Выберите группу');
    expect(fakeTelegram.privateMessages[0]).not.toContain('Visible task');
    expect(fakeTelegram.privateMessages[0]).not.toContain('Private teammate task');
    await adapter.handleUpdate(privateUpdate(actorTelegramUserId, '/tasks 1'));
    expect(fakeTelegram.privateMessages[1]).toContain('Visible task');
    expect(fakeTelegram.privateMessages[1]).not.toContain('Private teammate task');
    expect(fakeTelegram.privateMessages[1]).not.toContain('Other group task');

    await adapter.handleUpdate(privateUpdate(actorTelegramUserId, '/settings off 1'));
    const notificationRows = await database.db.select({ chatId: chatMemberships.chatId, enabled: chatMemberships.notificationsEnabled })
      .from(chatMemberships)
      .where(and(eq(chatMemberships.userId, actor.id), eq(chatMemberships.workspaceId, firstChat.workspaceId)));
    expect(notificationRows).toEqual([{ chatId: firstChat.chatId, enabled: false }]);
  });

  test('analyzes only the replied source message for group /keep', async () => {
    const captured: { telegramMessageId: string; text: string }[] = [];
    const handler = createGroupUpdateHandler({
      analyzeGroupMessage: (input) => {
        captured.push({ telegramMessageId: input.telegramMessageId, text: input.text });
        return Promise.resolve('suggested');
      },
      botUsername: 'keepword_test_bot',
      connectChat: createConnectChat(database.db),
      onboardingInvitations: createOnboardingInvitationService(database.db),
    });

    await handler({
      payload: {
        message: {
          chat: { id: -1009813, type: 'supergroup' },
          date: 1_784_365_200,
          from: { first_name: 'Admin', id: 9813, is_bot: false },
          message_id: 41,
          reply_to_message: {
            date: 1_784_365_100,
            from: { first_name: 'Author', id: 9814, is_bot: false },
            message_id: 40,
            text: 'Я подготовлю бюджет к пятнице',
          },
          text: '/keep',
        },
      },
      updateId: 9813,
    }, {
      sendClarificationRequest: () => Promise.resolve(),
      sendOnboardingCard: () => Promise.resolve(),
      sendSuggestionReply: () => Promise.resolve(),
    });

    expect(captured).toEqual([{ telegramMessageId: '40', text: 'Я подготовлю бюджет к пятнице' }]);
  });
});

function createNoopGroupHandler() {
  return () => Promise.resolve();
}

function groupUpdate(telegramChatId: string, actorId: number, text: string) {
  return {
    payload: {
      message: {
        chat: { id: Number(telegramChatId), type: 'supergroup' },
        date: 1_784_365_200,
        from: { first_name: 'Member', id: actorId, is_bot: false },
        message_id: 1,
        text,
      },
      update_id: actorId,
    },
    updateId: actorId,
  };
}

function privateUpdate(telegramUserId: number, text: string) {
  return {
    payload: {
      message: {
        chat: { id: telegramUserId, type: 'private' },
        date: 1_784_365_200,
        from: { first_name: 'Member', id: telegramUserId, is_bot: false },
        message_id: 1,
        text,
      },
      update_id: telegramUserId,
    },
    updateId: telegramUserId,
  };
}
