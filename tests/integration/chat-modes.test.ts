import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { CommitmentCandidate } from '../../src/domain/extraction.js';
import { chatMemberships, chats, commitmentSuggestions, users } from '../../src/db/schema.js';
import { createDigestJob } from '../../src/jobs/digests.js';
import { createCommitmentsRepository } from '../../src/repositories/commitments.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createChatSettingsService } from '../../src/services/chat-settings.js';
import { createAnalyzeGroupMessage } from '../../src/services/analyze-message.js';
import { createOnboardingInvitationService } from '../../src/services/onboarding-invitation.js';
import { createOnboardingService } from '../../src/services/onboarding.js';
import { createGroupUpdateHandler } from '../../src/telegram/handlers/group.js';
import { createFakeTelegram } from '../helpers/fake-telegram.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;
let nextTelegramChatId = 120_000;

const candidate: CommitmentCandidate = {
  assignee_telegram_user_id: '120001',
  category: 'promise',
  confidence: 'high',
  description: null,
  due_at: null,
  due_date_text: 'сегодня',
  is_commitment: true,
  needs_assignee_clarification: false,
  needs_due_date_clarification: false,
  reasoning_short: 'Явное обещание.',
  source_message_ids: [],
  title: 'Отправить КП',
};

async function countSuggestions(chatId: string): Promise<number> {
  const rows = await database.db
    .select({ total: count() })
    .from(commitmentSuggestions)
    .where(eq(commitmentSuggestions.chatId, chatId));
  return Number(rows[0]?.total ?? 0);
}

async function connectChat() {
  nextTelegramChatId += 1;
  return createConnectChat(database.db)({
    adminTelegramUserId: '120001',
    telegramChatId: String(nextTelegramChatId),
    timezone: 'UTC',
    title: 'Modes test chat',
  });
}

function groupMessage(chatId: number, messageId: number, text: string, replyToMessage?: Readonly<{ id: number; text: string }>) {
  return {
    payload: {
      message: {
        chat: { id: chatId, type: 'supergroup' },
        date: 1_784_365_200,
        from: { first_name: 'Admin', id: 120001, is_bot: false },
        message_id: messageId,
        ...(replyToMessage
          ? {
              reply_to_message: {
                date: 1_784_365_100,
                from: { first_name: 'Admin', id: 120001, is_bot: false },
                message_id: replyToMessage.id,
                text: replyToMessage.text,
              },
            }
          : {}),
        text,
      },
    },
    updateId: messageId,
  };
}

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('chat modes', () => {
  test('manual mode ignores ordinary group messages but accepts /keep', async () => {
    const connected = await connectChat();
    const settings = createChatSettingsService(database.db, () => Promise.resolve(true));
    await settings.setMode({
      chatId: connected.chatId,
      mode: 'manual',
      requestedByTelegramUserId: '120001',
      workspaceId: connected.workspaceId,
    });
    const analyzer = createAnalyzeGroupMessage(database.db, {
      extractCandidate: () => Promise.resolve(candidate),
    }, undefined, 'mode-test-secret');
    const handler = createGroupUpdateHandler({
      analyzeGroupMessage: analyzer,
      botUsername: 'keepword_test_bot',
      connectChat: createConnectChat(database.db),
      onboardingInvitations: createOnboardingInvitationService(database.db),
    });
    const telegram = createFakeTelegram();

    await telegram.telegramAdapterFactory(handler).handleUpdate(groupMessage(nextTelegramChatId, 1, 'Сегодня отправлю КП'));
    expect(await countSuggestions(connected.chatId)).toBe(0);

    await telegram.telegramAdapterFactory(handler).handleUpdate(
      groupMessage(nextTelegramChatId, 2, '/keep', { id: 1, text: 'Сегодня отправлю КП' }),
    );
    expect(await countSuggestions(connected.chatId)).toBe(1);
  });

  test('silent digest stores eligible candidates without a public reply and exposes them to the admin digest', async () => {
    const connected = await connectChat();
    const settings = createChatSettingsService(database.db, () => Promise.resolve(true));
    await settings.setMode({
      chatId: connected.chatId,
      mode: 'silent_digest',
      requestedByTelegramUserId: '120001',
      workspaceId: connected.workspaceId,
    });
    const admin = (await database.db
      .select({ id: users.id })
      .from(users)
      .innerJoin(chatMemberships, and(eq(chatMemberships.userId, users.id), eq(chatMemberships.chatId, connected.chatId)))
      .where(eq(chatMemberships.role, 'admin'))
      .limit(1))[0];
    if (!admin) throw new Error('Expected admin');
    await database.db.update(users).set({ privateChatStartedAt: new Date() }).where(eq(users.id, admin.id));
    await database.db.update(chatMemberships).set({ notificationsEnabled: true }).where(eq(chatMemberships.userId, admin.id));
    await database.db.update(chats).set({ dailyDigestTime: '18:00:00' }).where(eq(chats.id, connected.chatId));
    const replies: string[] = [];
    const analyzer = createAnalyzeGroupMessage(database.db, {
      extractCandidate: () => Promise.resolve(candidate),
    }, {
      sendClarificationRequest: () => Promise.resolve(),
      sendSuggestionReply: (reply) => {
        replies.push(reply.text);
        return Promise.resolve();
      },
    }, 'mode-test-secret');

    await expect(analyzer({
      author: { firstName: 'Admin', telegramUserId: 120001 },
      sentAt: new Date('2026-07-18T09:00:00.000Z'),
      telegramChatId: String(nextTelegramChatId),
      telegramMessageId: '3',
      text: 'Сегодня отправлю КП',
    })).resolves.toBe('suggested');
    expect(replies).toEqual([]);
    expect(await countSuggestions(connected.chatId)).toBe(1);

    const telegram = createFakeTelegram();
    await createDigestJob({
      database: database.db,
      isCurrentChatAdmin: () => Promise.resolve(true),
      messenger: telegram,
    })(new Date('2026-07-18T18:00:00.000Z'));
    expect(telegram.privateMessagesFor(120001).some(
      (text) => text.includes('На проверку') && text.includes('Отправить КП'),
    )).toBe(true);
  });

  test('silent digest suppresses medium-confidence public clarification requests', async () => {
    const connected = await connectChat();
    const settings = createChatSettingsService(database.db, () => Promise.resolve(true));
    await settings.setMode({
      chatId: connected.chatId,
      mode: 'silent_digest',
      requestedByTelegramUserId: '120001',
      workspaceId: connected.workspaceId,
    });
    const clarifications: string[] = [];
    let extractionCalls = 0;
    const analyzer = createAnalyzeGroupMessage(database.db, {
      extractCandidate: () => {
        extractionCalls += 1;
        return Promise.resolve({ ...candidate, category: 'follow_up', confidence: 'medium' });
      },
    }, {
      sendClarificationRequest: (request) => {
        clarifications.push(request.text);
        return Promise.resolve();
      },
      sendSuggestionReply: () => Promise.resolve(),
    }, 'mode-test-secret');

    await expect(analyzer({
      author: { firstName: 'Admin', telegramUserId: 120001 },
      sentAt: new Date('2026-07-18T09:00:00.000Z'),
      telegramChatId: String(nextTelegramChatId),
      telegramMessageId: '31',
      text: 'Сегодня отправлю КП',
    })).resolves.toBe('skipped');
    expect(extractionCalls).toBe(1);
    expect(clarifications).toEqual([]);
  });

  test('silent review candidates exclude pending suggestions from suggest chats', async () => {
    const silent = await connectChat();
    const ordinary = await connectChat();
    const settings = createChatSettingsService(database.db, () => Promise.resolve(true));
    await settings.setMode({
      chatId: silent.chatId,
      mode: 'silent_digest',
      requestedByTelegramUserId: '120001',
      workspaceId: silent.workspaceId,
    });
    const analyzer = createAnalyzeGroupMessage(database.db, {
      extractCandidate: () => Promise.resolve(candidate),
    }, {
      sendClarificationRequest: () => Promise.resolve(),
      sendSuggestionReply: () => Promise.resolve(),
    }, 'mode-test-secret');

    await analyzer({
      author: { firstName: 'Admin', telegramUserId: 120001 },
      sentAt: new Date('2026-07-18T09:00:00.000Z'),
      telegramChatId: silent.telegramChatId,
      telegramMessageId: '41',
      text: 'Сегодня отправлю КП',
    });
    await analyzer({
      author: { firstName: 'Admin', telegramUserId: 120001 },
      sentAt: new Date('2026-07-18T09:01:00.000Z'),
      telegramChatId: ordinary.telegramChatId,
      telegramMessageId: '42',
      text: 'Сегодня отправлю КП',
    });

    const commitments = createCommitmentsRepository(database.db);
    await expect(commitments.findPendingSuggestionTitles({ chatId: silent.chatId, workspaceId: silent.workspaceId }))
      .resolves.toEqual(['Отправить КП']);
    await expect(commitments.findPendingSuggestionTitles({ chatId: ordinary.chatId, workspaceId: ordinary.workspaceId }))
      .resolves.toEqual([]);
  });

  test('rejects the non-MVP auto_capture mode', async () => {
    const connected = await connectChat();
    const settings = createChatSettingsService(database.db, () => Promise.resolve(true));

    await expect(settings.setMode({
      chatId: connected.chatId,
      mode: 'auto_capture',
      requestedByTelegramUserId: '120001',
      workspaceId: connected.workspaceId,
    })).rejects.toMatchObject({ code: 'INVALID_CHAT_MODE' });
  });

  test('accepts a group mode change only from the current chat administrator', async () => {
    const connected = await connectChat();
    const handler = createGroupUpdateHandler({
      botUsername: 'keepword_test_bot',
      chatSettings: (isCurrentChatAdmin) => createChatSettingsService(database.db, isCurrentChatAdmin),
      connectChat: createConnectChat(database.db),
      onboarding: createOnboardingService(database.db, { botUsername: 'keepword_test_bot' }),
      onboardingInvitations: createOnboardingInvitationService(database.db),
    });
    const telegram = createFakeTelegram({ currentAdminTelegramUserIds: [120001] });

    await telegram.telegramAdapterFactory(handler).handleUpdate(groupMessage(nextTelegramChatId, 4, '/settings manual'));

    expect((await database.db.select({ mode: chats.mode }).from(chats).where(eq(chats.id, connected.chatId)).limit(1))[0])
      .toEqual({ mode: 'manual' });
    expect(telegram.groupMessages).toEqual([expect.stringContaining('Manual')]);
  });
});
