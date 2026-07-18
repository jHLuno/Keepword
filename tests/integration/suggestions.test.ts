import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { CommitmentCandidate } from '../../src/domain/extraction.js';
import { createAnalyzeGroupMessage } from '../../src/services/analyze-message.js';
import { chatMemberships, commitmentSuggestions, commitments } from '../../src/db/schema.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createOnboardingInvitationService } from '../../src/services/onboarding-invitation.js';
import { createGroupUpdateHandler } from '../../src/telegram/handlers/group.js';
import { createFakeTelegram } from '../helpers/fake-telegram.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;
let telegramChatId = 40_000;

const highConfidenceCandidate: CommitmentCandidate = {
  is_commitment: true,
  category: 'promise',
  title: 'Отправить КП клиенту',
  description: 'Отправить клиенту коммерческое предложение.',
  assignee_telegram_user_id: '8101',
  due_at: null,
  due_date_text: 'сегодня',
  confidence: 'high',
  source_message_ids: [],
  needs_assignee_clarification: false,
  needs_due_date_clarification: false,
  reasoning_short: 'Автор явно обещает отправить КП.',
};

const lowConfidenceCandidate: CommitmentCandidate = {
  ...highConfidenceCandidate,
  confidence: 'low',
  reasoning_short: 'Недостаточно уверенности.',
};

type SuggestionReply = Readonly<{
  replyMarkup: { inline_keyboard: { callback_data: string; text: string }[][] };
  text: string;
}>;

function createMessage(telegramMessageId: number) {
  return {
    author: { firstName: 'Daniyar', telegramUserId: 8101 },
    sentAt: new Date('2026-07-18T09:00:00.000Z'),
    telegramChatId: String(telegramChatId),
    telegramMessageId: String(telegramMessageId),
    text: 'Сегодня отправлю КП клиенту',
  } as const;
}

async function countSuggestions(): Promise<number> {
  const rows = await database.db.select({ total: count() }).from(commitmentSuggestions);
  return Number(rows[0]?.total ?? 0);
}

async function connectTestChat() {
  telegramChatId += 1;
  return createConnectChat(database.db)({
    adminTelegramUserId: '8101',
    telegramChatId: String(telegramChatId),
    timezone: 'UTC',
    title: 'Suggestions test chat',
  });
}

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('suggestions', () => {
  test('creates a reply suggestion for a high-confidence promise', async () => {
    await connectTestChat();
    const replies: SuggestionReply[] = [];
    const analyzer = createAnalyzeGroupMessage(database.db, {
      extractCandidate: () => Promise.resolve(highConfidenceCandidate),
    }, {
      sendSuggestionReply: (reply) => {
        replies.push(reply);
        return Promise.resolve();
      },
      sendClarificationRequest: () => Promise.resolve(),
    });

    await expect(analyzer(createMessage(1))).resolves.toBe('suggested');

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain('Keepword заметил договорённость');
    expect(replies[0]?.replyMarkup.inline_keyboard.flat().map((button) => button.text)).toEqual([
      'Подтвердить',
      'Изменить',
      'Не фиксировать',
    ]);
    expect(replies[0]?.replyMarkup.inline_keyboard.flat().map((button) => button.callback_data)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^kw:confirm:[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
        expect.stringMatching(/^kw:edit:[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
        expect.stringMatching(/^kw:reject:[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
      ]),
    );
    expect(await countSuggestions()).toBe(1);
  });

  test('does not reply for low confidence or a duplicate commitment', async () => {
    const connectedChat = await connectTestChat();
    const replies: SuggestionReply[] = [];
    const lowAnalyzer = createAnalyzeGroupMessage(database.db, {
      extractCandidate: (input) => Promise.resolve({ ...lowConfidenceCandidate, source_message_ids: [input.message.id] }),
    }, {
      sendSuggestionReply: (reply) => {
        replies.push(reply);
        return Promise.resolve();
      },
      sendClarificationRequest: () => Promise.resolve(),
    });

    await expect(lowAnalyzer(createMessage(2))).resolves.toBe('skipped');

    const membershipRows = await database.db
      .select({ userId: chatMemberships.userId })
      .from(chatMemberships)
      .where(
        and(
          eq(chatMemberships.chatId, connectedChat.chatId),
          eq(chatMemberships.workspaceId, connectedChat.workspaceId),
        ),
      )
      .limit(1);
    const membership = membershipRows[0];

    if (!membership) {
      throw new Error('Expected test chat admin membership');
    }

    const commitment = await database.db
      .insert(commitments)
      .values({
        assigneeUserId: membership.userId,
        chatId: connectedChat.chatId,
        dueDateText: 'сегодня',
        title: highConfidenceCandidate.title ?? '',
        workspaceId: connectedChat.workspaceId,
      })
      .returning();

    expect(commitment).toHaveLength(1);
    const duplicateAnalyzer = createAnalyzeGroupMessage(database.db, {
      extractCandidate: (input) => Promise.resolve({ ...highConfidenceCandidate, source_message_ids: [input.message.id] }),
    }, {
      sendSuggestionReply: (reply) => {
        replies.push(reply);
        return Promise.resolve();
      },
      sendClarificationRequest: () => Promise.resolve(),
    });

    await expect(duplicateAnalyzer(createMessage(3))).resolves.toBe('skipped');
    expect(replies).toHaveLength(0);
  });

  test('asks one concise clarification for a medium-confidence follow-up without creating a suggestion', async () => {
    await connectTestChat();
    const clarifications: string[] = [];
    const analyzer = createAnalyzeGroupMessage(database.db, {
      extractCandidate: (input) => Promise.resolve({
        ...highConfidenceCandidate,
        category: 'follow_up',
        confidence: 'medium',
        source_message_ids: [input.message.id],
      }),
    }, {
      sendSuggestionReply: () => Promise.resolve(),
      sendClarificationRequest: (request) => {
        clarifications.push(request.text);
        return Promise.resolve();
      },
    });

    await expect(analyzer(createMessage(4))).resolves.toBe('clarification-requested');

    expect(clarifications).toEqual(['Похоже, это договорённость. Кто отвечает и к какому сроку?']);
    expect(await countSuggestions()).toBe(1);
  });

  test('routes a new group message to the analyzer and replies through fake Telegram', async () => {
    await connectTestChat();
    const analyzer = createAnalyzeGroupMessage(database.db, {
      extractCandidate: (input) => Promise.resolve({ ...highConfidenceCandidate, source_message_ids: [input.message.id] }),
    }, undefined);
    const handler = createGroupUpdateHandler({
      analyzeGroupMessage: analyzer,
      botUsername: 'keepword_test_bot',
      connectChat: createConnectChat(database.db),
      onboardingInvitations: createOnboardingInvitationService(database.db),
    });
    const fakeTelegram = createFakeTelegram();

    await fakeTelegram.telegramAdapterFactory(handler).handleUpdate({
      payload: {
        message: {
          chat: { id: telegramChatId, type: 'supergroup' },
          date: 1_784_365_200,
          from: { first_name: 'Daniyar', id: 8101, is_bot: false },
          message_id: 5,
          text: 'Сегодня отправлю КП клиенту',
        },
        update_id: 5_001,
      },
      updateId: 5_001,
    });

    expect(fakeTelegram.suggestionReplies).toHaveLength(1);
    expect(fakeTelegram.suggestionReplies[0]?.replyToTelegramMessageId).toBe('5');
  });
});
