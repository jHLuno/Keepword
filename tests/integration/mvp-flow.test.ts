import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { buildApp } from '../../src/app.js';
import type { CommitmentCandidate } from '../../src/domain/extraction.js';
import {
  chatMemberships,
  chats,
  commitments,
  notificationDeliveries,
  onboardingTokens,
  sourceMessages,
} from '../../src/db/schema.js';
import { createDigestJob } from '../../src/jobs/digests.js';
import { createReminderJob } from '../../src/jobs/reminders.js';
import { createAuthorizedCommitmentAction } from '../../src/services/update-commitment.js';
import { createAnalyzeGroupMessage } from '../../src/services/analyze-message.js';
import { createCommitmentRescheduleService } from '../../src/services/commitment-reschedule-sessions.js';
import { createDeleteChatData } from '../../src/services/delete-chat-data.js';
import { createOnboardingService } from '../../src/services/onboarding.js';
import { createFakeTelegram } from '../helpers/fake-telegram.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

const callbackSigningSecret = 'mvp-flow-callback-secret';
const webhookSecret = 'mvp-flow-webhook-secret';
const telegramChatId = -100_141_001;
const adminTelegramUserId = 141_001;
const dueAt = new Date('2026-07-18T12:00:00.000Z');

let database: PgliteTestDatabase;

function firstRow<Row>(rows: readonly Row[]): Row {
  const row = rows[0];
  if (!row) {
    throw new Error('Expected a database row');
  }
  return row;
}

function webhookHeaders() {
  return { 'x-telegram-bot-api-secret-token': webhookSecret };
}

async function countForChat(
  table: typeof chatMemberships | typeof commitments | typeof notificationDeliveries | typeof onboardingTokens | typeof sourceMessages,
  chatId: string,
): Promise<number> {
  const rows = await database.db.select({ total: count() }).from(table).where(eq(table.chatId, chatId));
  return Number(rows[0]?.total ?? 0);
}

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

test('supports the complete approved MVP without leaking private task state', async () => {
  const fakeTelegram = createFakeTelegram({ currentAdminTelegramUserIds: [adminTelegramUserId] });
  const onboarding = createOnboardingService(database.db, { botUsername: 'keepword_test_bot' });
  const candidate: CommitmentCandidate = {
    assignee_telegram_user_id: String(adminTelegramUserId),
    category: 'promise',
    language: 'ru',
    confidence: 'high',
    description: null,
    due_at: dueAt.toISOString(),
    due_date_text: 'сегодня, до 12:00',
    is_commitment: true,
    needs_assignee_clarification: false,
    needs_due_date_clarification: false,
    reasoning_short: 'Явное обещание с исполнителем и сроком.',
    source_message_ids: [],
    title: 'Отправить КП клиенту',
  };
  const analyzeGroupMessage = createAnalyzeGroupMessage(
    database.db,
    { extractCandidate: () => Promise.resolve(candidate) },
    undefined,
    callbackSigningSecret,
    undefined,
    onboarding,
  );
  const app = buildApp(
    {
      callbackSigningSecret,
      databaseUrl: 'postgres://unused/mvp-flow',
      openRouterApiKey: 'unused',
      port: 3_000,
      telegramBotToken: 'unused',
      telegramBotUsername: 'keepword_test_bot',
      telegramWebhookSecret: webhookSecret,
      workerSecret: 'unused',
    },
    {
      analyzeGroupMessage,
      database: database.db,
      telegramAdapterFactory: fakeTelegram.telegramAdapterFactory,
    },
  );

  try {
    await app.inject({
      headers: webhookHeaders(),
      method: 'POST',
      payload: {
        my_chat_member: {
          chat: { id: telegramChatId, title: 'MVP flow chat', type: 'supergroup' },
          from: { language_code: 'ru', id: adminTelegramUserId },
          new_chat_member: { status: 'member' },
          old_chat_member: { status: 'left' },
        },
        update_id: 141_001,
      },
      url: '/telegram/webhook',
    });

    const onboardingCard = fakeTelegram.onboardingCards[0];
    const onboardingToken = /start=join_([A-Za-z0-9_-]+)/.exec(onboardingCard?.onboardingDeepLink ?? '')?.[1];
    if (!onboardingToken) {
      throw new Error('Expected the group connection to publish an onboarding token');
    }

    await app.inject({
      headers: webhookHeaders(),
      method: 'POST',
      payload: {
        message: {
          chat: { id: adminTelegramUserId, type: 'private' },
          date: 1_784_365_200,
          from: { language_code: 'ru', first_name: 'Данияр', id: adminTelegramUserId, is_bot: false },
          message_id: 1,
          text: `/start join_${onboardingToken}`,
        },
        update_id: 141_002,
      },
      url: '/telegram/webhook',
    });
    expect(fakeTelegram.privateMessagesFor(adminTelegramUserId)).toContain('✅ Уведомления подключены\n\nТеперь я смогу отправлять вам напоминания о задачах, уведомления о просрочках и личную вечернюю сводку.\n\nГруппа: MVP flow chat');

    await app.inject({
      headers: webhookHeaders(),
      method: 'POST',
      payload: {
        message: {
          chat: { id: telegramChatId, type: 'supergroup' },
          date: 1_784_365_200,
          from: { language_code: 'ru', first_name: 'Данияр', id: adminTelegramUserId, is_bot: false },
          message_id: 2,
          text: 'Сегодня до 12:00 отправлю КП клиенту',
        },
        update_id: 141_003,
      },
      url: '/telegram/webhook',
    });

    const suggestion = fakeTelegram.suggestionReplies[0];
    const confirmCallback = suggestion?.replyMarkup.inline_keyboard[0]?.find((button) => button.text === 'Подтвердить')?.callback_data;
    if (!confirmCallback) {
      throw new Error('Expected a confirmation callback for the high-confidence promise');
    }

    await app.inject({
      headers: webhookHeaders(),
      method: 'POST',
      payload: {
        callback_query: {
          data: confirmCallback,
          from: { language_code: 'ru', first_name: 'Данияр', id: adminTelegramUserId, is_bot: false },
          id: 'mvp-flow-confirm',
          message: { chat: { id: telegramChatId, type: 'supergroup' }, message_id: 3 },
        },
        update_id: 141_004,
      },
      url: '/telegram/webhook',
    });
    expect(fakeTelegram.callbackAnswers).toContain('Договорённость сохранена.');

    const chat = firstRow(await database.db
      .select({ id: chats.id, workspaceId: chats.workspaceId })
      .from(chats)
      .where(eq(chats.telegramChatId, telegramChatId))
      .limit(1));
    const commitment = firstRow(await database.db
      .select()
      .from(commitments)
      .where(and(eq(commitments.chatId, chat.id), eq(commitments.workspaceId, chat.workspaceId)))
      .limit(1));

    const runReminderJob = createReminderJob({
      callbackSigningSecret,
      database: database.db,
      messenger: fakeTelegram,
    });
    await expect(runReminderJob(dueAt)).resolves.toMatchObject({ delivered: 1 });
    await expect(runReminderJob(new Date('2026-07-19T12:00:00.000Z'))).resolves.toMatchObject({ delivered: 1 });
    expect(fakeTelegram.privateMessagesFor(adminTelegramUserId).some((text) => text.includes('Срок обязательства истёк'))).toBe(true);

    const reschedules = createCommitmentRescheduleService(database.db, () => Promise.resolve(false));
    await reschedules.begin({
      actorTelegramUserId: adminTelegramUserId,
      commitmentId: commitment.id,
      telegramChatId: String(telegramChatId),
    });
    const futureDueAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
    await expect(reschedules.apply({
      actor: { firstName: 'Данияр', telegramUserId: adminTelegramUserId },
      dueDateText: futureDueAt,
    })).resolves.toMatchObject({ dueDateText: futureDueAt, status: 'open' });

    const updateStatus = createAuthorizedCommitmentAction(database.db, () => Promise.resolve(false));
    await expect(updateStatus({
      action: 'block',
      actor: { firstName: 'Данияр', telegramUserId: adminTelegramUserId },
      commitmentId: commitment.id,
      telegramChatId: String(telegramChatId),
    })).resolves.toMatchObject({ status: 'blocked' });
    await expect(updateStatus({
      action: 'complete',
      actor: { firstName: 'Данияр', telegramUserId: adminTelegramUserId },
      commitmentId: commitment.id,
      telegramChatId: String(telegramChatId),
    })).resolves.toMatchObject({ status: 'completed' });

    await database.db.update(chats).set({ dailyDigestTime: '18:00:00' }).where(eq(chats.id, chat.id));
    const runDigestJob = createDigestJob({
      database: database.db,
      isCurrentChatAdmin: () => Promise.resolve(true),
      messenger: fakeTelegram,
    });
    await expect(runDigestJob(new Date('2026-07-18T18:00:00.000Z'))).resolves.toMatchObject({ delivered: 2 });
    expect(fakeTelegram.privateMessagesFor(adminTelegramUserId)).toEqual(expect.arrayContaining([
      expect.stringContaining('📋 Личная вечерняя сводка'),
      expect.stringContaining('📊 Риски команды'),
    ]));

    await createDeleteChatData(database.db, () => Promise.resolve(true))({
      chatId: chat.id,
      requestedByTelegramUserId: String(adminTelegramUserId),
      workspaceId: chat.workspaceId,
    });
    await expect(Promise.all([
      countForChat(chatMemberships, chat.id),
      countForChat(commitments, chat.id),
      countForChat(notificationDeliveries, chat.id),
      countForChat(onboardingTokens, chat.id),
      countForChat(sourceMessages, chat.id),
    ])).resolves.toEqual([0, 0, 0, 0, 0]);
    await expect(database.db.select({ isActive: chats.isActive }).from(chats).where(eq(chats.id, chat.id)).limit(1))
      .resolves.toEqual([{ isActive: false }]);
    expect(fakeTelegram.groupMessages.join('\n')).not.toContain('Срок обязательства истёк');
  } finally {
    await app.close();
  }
});
