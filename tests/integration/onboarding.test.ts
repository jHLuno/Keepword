import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { chatMemberships, chats, onboardingTokens, users } from '../../src/db/schema.js';
import { createOnboardingService, OnboardingError } from '../../src/services/onboarding.js';
import { createOnboardingInvitationService } from '../../src/services/onboarding-invitation.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createGroupUpdateHandler } from '../../src/telegram/handlers/group.js';
import { createPrivateUpdateHandler } from '../../src/telegram/handlers/private.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;
let telegramChatId = 96_000;

async function connectChat() {
  telegramChatId += 1;
  return createConnectChat(database.db)({
    adminTelegramUserId: String(telegramChatId),
    telegramChatId: String(telegramChatId),
    timezone: 'UTC',
    title: `Onboarding ${telegramChatId}`,
  });
}

async function notificationsActive(chatId: string, telegramUserId: number): Promise<boolean> {
  const row = (
    await database.db
      .select({ enabled: chatMemberships.notificationsEnabled })
      .from(chatMemberships)
      .innerJoin(users, eq(chatMemberships.userId, users.id))
      .where(and(eq(chatMemberships.chatId, chatId), eq(users.telegramUserId, telegramUserId)))
      .limit(1)
  )[0];
  return row?.enabled ?? false;
}

async function privateStart(token: string, telegramUserId: number): Promise<readonly string[]> {
  const privateMessages: string[] = [];
  const handler = createPrivateUpdateHandler({
    database: database.db,
    onboarding: createOnboardingService(database.db, { botUsername: 'keepword_test_bot' }),
  });

  await handler(
    {
      payload: {
        message: {
          chat: { id: telegramUserId, type: 'private' },
          from: { first_name: 'Onboarded', id: telegramUserId, is_bot: false },
          message_id: 1,
          text: `/start join_${token}`,
        },
        update_id: telegramUserId,
      },
      updateId: telegramUserId,
    },
    { sendPrivateMessage: ({ text }) => { privateMessages.push(text); return Promise.resolve(); } },
  );

  return privateMessages;
}

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('private notification onboarding', () => {
  test('activates notifications for a valid unused chat-scoped token', async () => {
    const chat = await connectChat();
    const onboarding = createOnboardingService(database.db, { botUsername: 'keepword_test_bot' });
    const link = await onboarding.createOnboardingLink(chat.chatId);
    const token = /start=join_([A-Za-z0-9_-]+)/.exec(link)?.[1];
    if (!token) {
      throw new Error('Expected an opaque onboarding token');
    }

    await privateStart(token, 96_101);

    expect(await notificationsActive(chat.chatId, 96_101)).toBe(true);
    expect(link).not.toContain(chat.telegramChatId);
    const storedToken = (
      await database.db
        .select({ tokenHash: onboardingTokens.tokenHash })
        .from(onboardingTokens)
        .where(eq(onboardingTokens.chatId, chat.chatId))
        .limit(1)
    )[0];
    expect(storedToken?.tokenHash).not.toBe(token);
  });

  test.each(['expired', 'used', 'inactive'] as const)(
    'does not activate notifications for a %s token',
    async (kind) => {
      const chat = await connectChat();
      const onboarding = createOnboardingService(database.db, { botUsername: 'keepword_test_bot' });
      const link = await onboarding.createOnboardingLink(chat.chatId);
      const token = /start=join_([A-Za-z0-9_-]+)/.exec(link)?.[1];
      if (!token) {
        throw new Error('Expected an opaque onboarding token');
      }

      if (kind === 'expired') {
        await database.db
          .update(onboardingTokens)
          .set({ expiresAt: new Date(Date.now() - 1_000) })
          .where(eq(onboardingTokens.chatId, chat.chatId));
      }
      if (kind === 'used') {
        await onboarding.redeemOnboardingToken({ telegramUserId: '96102', token });
      }
      if (kind === 'inactive') {
        await database.db.update(chats).set({ isActive: false }).where(eq(chats.id, chat.chatId));
      }

      await expect(onboarding.redeemOnboardingToken({ telegramUserId: '96103', token })).rejects.toBeInstanceOf(
        OnboardingError,
      );
      expect(await notificationsActive(chat.chatId, 96103)).toBe(false);
    },
  );

  test('keeps /start helpful without granting a membership when its token is invalid', async () => {
    const messages = await privateStart('not-a-valid-token', 96_104);

    expect(messages).toEqual([expect.stringContaining('ссылка')]);
    const memberships = await database.db
      .select()
      .from(chatMemberships)
      .innerJoin(users, eq(chatMemberships.userId, users.id))
      .where(eq(users.telegramUserId, 96_104));
    expect(memberships).toHaveLength(0);
  });

  test('binds a redeemed token to its issuing chat only', async () => {
    const issuingChat = await connectChat();
    const otherChat = await connectChat();
    const onboarding = createOnboardingService(database.db, { botUsername: 'keepword_test_bot' });
    const token = /start=join_([A-Za-z0-9_-]+)/.exec(await onboarding.createOnboardingLink(issuingChat.chatId))?.[1];
    if (!token) {
      throw new Error('Expected an opaque onboarding token');
    }

    await onboarding.redeemOnboardingToken({ telegramUserId: '96108', token });

    expect(await notificationsActive(issuingChat.chatId, 96108)).toBe(true);
    expect(await notificationsActive(otherChat.chatId, 96108)).toBe(false);
  });

  test('allows a notification invitation no more than once per target within 24 hours', async () => {
    const chat = await connectChat();
    const onboarding = createOnboardingService(database.db, { botUsername: 'keepword_test_bot' });

    await onboarding.redeemOnboardingToken({
      telegramUserId: '96105',
      token: /start=join_([A-Za-z0-9_-]+)/.exec(await onboarding.createOnboardingLink(chat.chatId))?.[1] ?? '',
    });
    await database.db
      .update(chatMemberships)
      .set({ notificationsConnectedAt: null, notificationsEnabled: false })
      .where(eq(chatMemberships.chatId, chat.chatId));

    expect(await onboarding.claimNotificationInvite({ chatId: chat.chatId, telegramUserId: '96105' })).toBe(true);
    expect(await onboarding.claimNotificationInvite({ chatId: chat.chatId, telegramUserId: '96105' })).toBe(false);
  });

  test('lets only a current administrator publish an invite', async () => {
    const chat = await connectChat();
    const onboarding = createOnboardingService(database.db, { botUsername: 'keepword_test_bot' });
    const cards: string[] = [];
    const groupMessages: string[] = [];
    const handler = createGroupUpdateHandler({
      botUsername: 'keepword_test_bot',
      connectChat: createConnectChat(database.db),
      onboarding,
      onboardingInvitations: createOnboardingInvitationService(database.db),
    });
    const updateFor = (text: string, actorId: number) => ({
      payload: {
        message: {
          chat: { id: Number(chat.telegramChatId), type: 'supergroup' },
          date: 1_752_000_000,
          from: { first_name: 'Admin', id: actorId, is_bot: false },
          message_id: 1,
          text,
        },
        update_id: actorId,
      },
      updateId: actorId,
    });
    const messenger = (isAdmin: boolean) => ({
      isCurrentChatAdmin: () => Promise.resolve(isAdmin),
      sendClarificationRequest: () => Promise.resolve(),
      sendGroupMessage: ({ text }: Readonly<{ telegramChatId: string; text: string }>) => {
        groupMessages.push(text);
        return Promise.resolve();
      },
      sendOnboardingCard: ({ onboardingDeepLink }: Readonly<{ onboardingDeepLink: string; telegramChatId: string; text: string }>) => {
        cards.push(onboardingDeepLink);
        return Promise.resolve();
      },
      sendSuggestionReply: () => Promise.resolve(),
    });

    await handler(updateFor('/invite', 96_106), messenger(false));
    expect(cards).toHaveLength(0);
    expect(groupMessages).toContain('Только администратор чата может управлять уведомлениями.');

    await handler(updateFor('/invite', 96_107), messenger(true));
    expect(cards).toEqual([expect.stringMatching(/^https:\/\/t\.me\/keepword_test_bot\?start=join_[A-Za-z0-9_-]+$/)]);
  });

  test('delivers notification status privately without exposing counts or names in the group', async () => {
    const chat = await connectChat();
    const onboarding = createOnboardingService(database.db, { botUsername: 'keepword_test_bot' });
    const adminTelegramUserId = 96_109;
    await onboarding.redeemOnboardingToken({
      telegramUserId: String(adminTelegramUserId),
      token: /start=join_([A-Za-z0-9_-]+)/.exec(await onboarding.createOnboardingLink(chat.chatId))?.[1] ?? '',
    });
    const groupMessages: string[] = [];
    const privateMessages: string[] = [];
    const privateRecipients: number[] = [];
    const handler = createGroupUpdateHandler({
      botUsername: 'keepword_test_bot',
      connectChat: createConnectChat(database.db),
      onboarding,
      onboardingInvitations: createOnboardingInvitationService(database.db),
    });

    await handler(
      notificationCommand(chat.telegramChatId, adminTelegramUserId),
      statusMessenger(groupMessages, privateMessages, privateRecipients, true),
    );

    expect(groupMessages).toEqual(['Статус уведомлений отправлен вам в личный чат.']);
    expect(groupMessages.join('\n')).not.toMatch(/Connected|Not connected|Telegram user|@/);
    expect(privateMessages).toEqual([expect.stringContaining('Notification status')]);
    expect(privateRecipients).toEqual([adminTelegramUserId]);
  });

  test('withholds notification status when the current administrator has not started the bot privately', async () => {
    const chat = await connectChat();
    const onboarding = createOnboardingService(database.db, { botUsername: 'keepword_test_bot' });
    const groupMessages: string[] = [];
    const privateMessages: string[] = [];
    const privateRecipients: number[] = [];
    const handler = createGroupUpdateHandler({
      botUsername: 'keepword_test_bot',
      connectChat: createConnectChat(database.db),
      onboarding,
      onboardingInvitations: createOnboardingInvitationService(database.db),
    });

    await handler(
      notificationCommand(chat.telegramChatId, 96_110),
      statusMessenger(groupMessages, privateMessages, privateRecipients, true),
    );

    expect(groupMessages).toEqual(['Откройте личный чат с Keepword и нажмите Start, чтобы получить статус уведомлений.']);
    expect(groupMessages.join('\n')).not.toMatch(/Connected|Not connected|Telegram user|@/);
    expect(privateMessages).toEqual([]);
    expect(privateRecipients).toEqual([]);
  });
});

function notificationCommand(telegramChatId: string, actorId: number) {
  return {
    payload: {
      message: {
        chat: { id: Number(telegramChatId), type: 'supergroup' },
        date: 1_752_000_000,
        from: { first_name: 'Admin', id: actorId, is_bot: false },
        message_id: 1,
        text: '/notifications',
      },
      update_id: actorId,
    },
    updateId: actorId,
  };
}

function statusMessenger(
  groupMessages: string[],
  privateMessages: string[],
  privateRecipients: number[],
  isAdmin: boolean,
) {
  return {
    isCurrentChatAdmin: () => Promise.resolve(isAdmin),
    sendClarificationRequest: () => Promise.resolve(),
    sendGroupMessage: ({ text }: Readonly<{ telegramChatId: string; text: string }>) => {
      groupMessages.push(text);
      return Promise.resolve();
    },
    sendOnboardingCard: () => Promise.resolve(),
    sendSuggestionReply: () => Promise.resolve(),
    sendPrivateMessage: ({ telegramUserId, text }: Readonly<{ telegramUserId: number; text: string }>) => {
      privateMessages.push(text);
      privateRecipients.push(telegramUserId);
      return Promise.resolve();
    },
  };
}
