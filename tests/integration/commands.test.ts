import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { chatMemberships, chats, commitments, users } from '../../src/db/schema.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createOnboardingInvitationService } from '../../src/services/onboarding-invitation.js';
import { createOnboardingService } from '../../src/services/onboarding.js';
import { createGroupUpdateHandler } from '../../src/telegram/handlers/group.js';
import { createPrivateCommandHandler } from '../../src/telegram/handlers/commands.js';
import { createPrivateUpdateHandler } from '../../src/telegram/handlers/private.js';
import { createCommitmentActionCallbackHandler } from '../../src/telegram/handlers/callback.js';
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

  test.each(['/invite', '/keep', '/notifications'])('directs private %s to a connected group', async (command) => {
    const handler = createPrivateUpdateHandler({ database: database.db });
    const fakeTelegram = createFakeTelegram();

    await fakeTelegram.telegramAdapterFactory(createNoopGroupHandler(), undefined, handler).handleUpdate(privateUpdate(9804, command));

    expect(fakeTelegram.privateMessages).toEqual([expect.stringContaining('подключённой группе')]);
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

  test('shows only the requesting user active commitments across chats where they completed onboarding', async () => {
    const actorTelegramUserId = 9820;
    const firstChat = await createConnectChat(database.db)({
      adminTelegramUserId: String(actorTelegramUserId), telegramChatId: '-1009820', timezone: 'UTC', title: 'First group',
    });
    const secondChat = await createConnectChat(database.db)({
      adminTelegramUserId: String(actorTelegramUserId), telegramChatId: '-1009821', timezone: 'UTC', title: 'Second group',
    });
    const inactiveChat = await createConnectChat(database.db)({
      adminTelegramUserId: String(actorTelegramUserId), telegramChatId: '-1009822', timezone: 'UTC', title: 'Inactive group',
    });
    const actor = (await database.db.select().from(users).where(eq(users.telegramUserId, actorTelegramUserId)).limit(1))[0];
    if (!actor) throw new Error('Expected actor');
    await database.db.update(users).set({ privateChatStartedAt: new Date() }).where(eq(users.id, actor.id));
    await database.db.update(chatMemberships).set({ notificationsConnectedAt: new Date() }).where(and(
      eq(chatMemberships.userId, actor.id),
      eq(chatMemberships.chatId, firstChat.chatId),
      eq(chatMemberships.workspaceId, firstChat.workspaceId),
    ));
    await database.db.update(chats).set({ isActive: false }).where(eq(chats.id, inactiveChat.chatId));
    const teammate = (await database.db.insert(users).values({ firstName: 'Teammate', telegramUserId: 9823 }).returning())[0];
    if (!teammate) throw new Error('Expected teammate');
    await database.db.insert(chatMemberships).values({ chatId: firstChat.chatId, userId: teammate.id, workspaceId: firstChat.workspaceId });
    await database.db.insert(commitments).values([
      { assigneeUserId: actor.id, chatId: firstChat.chatId, dueDateText: 'вчера', status: 'overdue', title: 'Overdue task', workspaceId: firstChat.workspaceId },
      { assigneeUserId: actor.id, chatId: secondChat.chatId, dueDateText: 'завтра', status: 'open', title: 'Open task', workspaceId: secondChat.workspaceId },
      { assigneeUserId: actor.id, chatId: firstChat.chatId, status: 'blocked', title: 'Blocked task', workspaceId: firstChat.workspaceId },
      { assigneeUserId: teammate.id, chatId: firstChat.chatId, status: 'open', title: 'Private teammate task', workspaceId: firstChat.workspaceId },
      { assigneeUserId: actor.id, chatId: firstChat.chatId, status: 'completed', title: 'Completed task', workspaceId: firstChat.workspaceId },
      { assigneeUserId: actor.id, chatId: firstChat.chatId, status: 'cancelled', title: 'Cancelled task', workspaceId: firstChat.workspaceId },
      { assigneeUserId: actor.id, chatId: inactiveChat.chatId, status: 'open', title: 'Inactive chat task', workspaceId: inactiveChat.workspaceId },
    ]);
    const handler = createPrivateUpdateHandler({ database: database.db });
    const fakeTelegram = createFakeTelegram();
    const adapter = fakeTelegram.telegramAdapterFactory(createNoopGroupHandler(), undefined, handler);

    await adapter.handleUpdate(privateUpdate(actorTelegramUserId, '/check'));

    const reply = fakeTelegram.privateMessages.at(-1) ?? '';
    expect(reply).toContain('📋 Мои обязательства');
    expect(reply).toContain('🔴 Просрочены');
    expect(reply).toContain('🟠 Есть блокер');
    expect(reply).toContain('[First group] Overdue task · вчера');
    expect(reply).not.toContain('[Second group] Open task · завтра');
    expect(reply).toContain('[First group] Blocked task');
    expect(reply).not.toContain('Private teammate task');
    expect(reply).not.toContain('Completed task');
    expect(reply).not.toContain('Cancelled task');
    expect(reply).not.toContain('Inactive chat task');
  });

  test('shows only the caller cross-chat reliability summary in private check', async () => {
    const actorTelegramUserId = 9825;
    const firstChat = await createConnectChat(database.db)({
      adminTelegramUserId: String(actorTelegramUserId), telegramChatId: '-1009825', timezone: 'UTC', title: 'Reliability first',
    });
    const secondChat = await createConnectChat(database.db)({
      adminTelegramUserId: String(actorTelegramUserId), telegramChatId: '-1009826', timezone: 'UTC', title: 'Reliability second',
    });
    const actor = (await database.db.select().from(users).where(eq(users.telegramUserId, actorTelegramUserId)).limit(1))[0];
    if (!actor) throw new Error('Expected actor');
    await database.db.update(users).set({ privateChatStartedAt: new Date() }).where(eq(users.id, actor.id));
    await database.db.update(chatMemberships).set({ notificationsConnectedAt: new Date() }).where(eq(chatMemberships.userId, actor.id));
    const teammate = (await database.db.insert(users).values({ firstName: 'Teammate reliability', telegramUserId: 9826 }).returning())[0];
    if (!teammate) throw new Error('Expected teammate');
    await database.db.insert(chatMemberships).values({
      chatId: firstChat.chatId,
      userId: teammate.id,
      workspaceId: firstChat.workspaceId,
    });
    const now = Date.now();
    await database.db.insert(commitments).values([
      {
        assigneeUserId: actor.id,
        chatId: firstChat.chatId,
        completedAt: new Date(now - 4 * 24 * 60 * 60 * 1_000),
        dueAt: new Date(now - 3 * 24 * 60 * 60 * 1_000),
        status: 'completed',
        title: 'My on-time commitment',
        workspaceId: firstChat.workspaceId,
      },
      {
        assigneeUserId: actor.id,
        chatId: secondChat.chatId,
        completedAt: new Date(now - 4 * 24 * 60 * 60 * 1_000),
        dueAt: new Date(now - 5 * 24 * 60 * 60 * 1_000),
        status: 'completed',
        title: 'My late commitment',
        workspaceId: secondChat.workspaceId,
      },
      {
        assigneeUserId: actor.id,
        chatId: secondChat.chatId,
        dueAt: new Date(now - 2 * 24 * 60 * 60 * 1_000),
        status: 'open',
        title: 'My overdue commitment',
        workspaceId: secondChat.workspaceId,
      },
      ...Array.from({ length: 3 }, (_, index) => ({
        assigneeUserId: teammate.id,
        chatId: firstChat.chatId,
        completedAt: new Date(now - (index + 4) * 24 * 60 * 60 * 1_000),
        dueAt: new Date(now - (index + 3) * 24 * 60 * 60 * 1_000),
        status: 'completed' as const,
        title: `Teammate commitment ${index + 1}`,
        workspaceId: firstChat.workspaceId,
      })),
    ]);
    const handler = createPrivateUpdateHandler({ database: database.db });
    const fakeTelegram = createFakeTelegram();

    await fakeTelegram.telegramAdapterFactory(createNoopGroupHandler(), undefined, handler)
      .handleUpdate(privateUpdate(actorTelegramUserId, '/check'));

    const reply = fakeTelegram.privateMessages.at(-1) ?? '';
    expect(reply).toContain('🤝 Моя надёжность · последние 30 дней');
    expect(reply).toContain('Вовремя: 1/3 · С опозданием: 1 · Риск: 1');
    expect(reply).not.toContain('Teammate reliability');
    expect(reply).not.toContain('Teammate commitment');
  });

  test('shows the check empty state when the onboarded user has no active commitments', async () => {
    const actorTelegramUserId = 9830;
    const chat = await createConnectChat(database.db)({
      adminTelegramUserId: String(actorTelegramUserId), telegramChatId: '-1009830', timezone: 'UTC', title: 'Empty group',
    });
    const actor = (await database.db.select().from(users).where(eq(users.telegramUserId, actorTelegramUserId)).limit(1))[0];
    if (!actor) throw new Error('Expected actor');
    await database.db.update(users).set({ privateChatStartedAt: new Date() }).where(eq(users.id, actor.id));
    await database.db.update(chatMemberships).set({ notificationsConnectedAt: new Date() }).where(and(
      eq(chatMemberships.userId, actor.id),
      eq(chatMemberships.chatId, chat.chatId),
      eq(chatMemberships.workspaceId, chat.workspaceId),
    ));
    const handler = createPrivateUpdateHandler({ database: database.db });
    const fakeTelegram = createFakeTelegram();
    const adapter = fakeTelegram.telegramAdapterFactory(createNoopGroupHandler(), undefined, handler);

    await adapter.handleUpdate(privateUpdate(actorTelegramUserId, '/check'));

    expect(fakeTelegram.privateMessages.at(-1)).toBe('📋 Мои обязательства\n\n— активных обязательств нет');
  });

  test('requires completed onboarding before showing the check summary', async () => {
    const actorTelegramUserId = 9831;
    const chat = await createConnectChat(database.db)({
      adminTelegramUserId: String(actorTelegramUserId), telegramChatId: '-1009831', timezone: 'UTC', title: 'Unconnected group',
    });
    const actor = (await database.db.select().from(users).where(eq(users.telegramUserId, actorTelegramUserId)).limit(1))[0];
    if (!actor) throw new Error('Expected actor');
    await database.db.update(users).set({ privateChatStartedAt: new Date() }).where(eq(users.id, actor.id));
    await database.db.insert(commitments).values({
      assigneeUserId: actor.id, chatId: chat.chatId, status: 'open', title: 'Unconnected task', workspaceId: chat.workspaceId,
    });
    const handler = createPrivateUpdateHandler({ database: database.db });
    const fakeTelegram = createFakeTelegram();
    const adapter = fakeTelegram.telegramAdapterFactory(createNoopGroupHandler(), undefined, handler);

    await adapter.handleUpdate(privateUpdate(actorTelegramUserId, '/check'));
    await adapter.handleUpdate(privateUpdate(9832, '/check'));

    expect(fakeTelegram.privateMessages).toEqual([
      'Сначала подключите уведомления через ссылку из нужной группы.',
      'Сначала подключите уведомления через ссылку из нужной группы.',
    ]);
  });

  test('paginates private commitment pickers with source-chat labels and signed page controls', async () => {
    const actorTelegramUserId = 9840;
    const firstChat = await createConnectChat(database.db)({
      adminTelegramUserId: String(actorTelegramUserId), telegramChatId: '-1009840', timezone: 'UTC', title: 'First source',
    });
    const secondChat = await createConnectChat(database.db)({
      adminTelegramUserId: String(actorTelegramUserId), telegramChatId: '-1009841', timezone: 'UTC', title: 'Second source',
    });
    const actor = (await database.db.select().from(users).where(eq(users.telegramUserId, actorTelegramUserId)).limit(1))[0];
    if (!actor) throw new Error('Expected actor');
    await database.db.update(users).set({ privateChatStartedAt: new Date() }).where(eq(users.id, actor.id));
    await database.db.update(chatMemberships).set({ notificationsConnectedAt: new Date() }).where(eq(chatMemberships.userId, actor.id));
    await database.db.insert(commitments).values(Array.from({ length: 6 }, (_, index) => ({
      assigneeUserId: actor.id,
      chatId: index % 2 === 0 ? firstChat.chatId : secondChat.chatId,
      dueDateText: `день ${index + 1}`,
      dueAt: new Date(`2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
      status: 'open' as const,
      title: `Task ${index + 1}`,
      workspaceId: index % 2 === 0 ? firstChat.workspaceId : secondChat.workspaceId,
    })));

    const cards: Array<Readonly<{ replyMarkup?: { inline_keyboard: { callback_data: string; text: string }[][] }; text: string }>> = [];
    const handler = createPrivateUpdateHandler({ callbackSigningSecret: 'check-test-secret', database: database.db });
    await handler(privateUpdate(actorTelegramUserId, '/check'), {
      sendPrivateMessage(input) {
        cards.push(input);
        return Promise.resolve();
      },
    });

    const firstPage = cards[0];
    if (!firstPage?.replyMarkup) throw new Error('Expected actionable first page');
    expect(firstPage.text).toContain('[First source] Task 1 · день 1');
    expect(firstPage.text).toContain('[Second source] Task 2 · день 2');
    expect(firstPage.text).toContain('Task 5');
    expect(firstPage.text).not.toContain('Task 6');
    expect(firstPage.replyMarkup.inline_keyboard.flat().filter((button) => button.text === 'Готово')).toHaveLength(0);
    expect(firstPage.replyMarkup.inline_keyboard.flat().filter((button) => button.text.includes('Task'))).toHaveLength(5);
    expect(firstPage.replyMarkup.inline_keyboard.flat().find((button) => button.text.includes('Task 1'))?.callback_data)
      .toMatch(/^kw:check_commitment:[A-Za-z0-9_-]{16,32}:[A-Za-z0-9_-]{16}$/);
    const next = firstPage.replyMarkup.inline_keyboard.flat().find((button) => button.text === 'Вперёд ▶');
    if (!next) throw new Error('Expected next-page callback');
    expect(next.callback_data).toMatch(/^kw:check_page:[A-Za-z0-9_-]{16,32}:[A-Za-z0-9_-]{16}$/);

    const edited: Array<Readonly<{ replyMarkup?: { inline_keyboard: { callback_data: string; text: string }[][] }; text: string }>> = [];
    const answers: string[] = [];
    const unrelatedParticipantTelegramUserId = 9842;
    const unrelatedParticipant = (await database.db.insert(users).values({
      firstName: 'Unrelated participant', telegramUserId: unrelatedParticipantTelegramUserId,
    }).returning())[0];
    if (!unrelatedParticipant) throw new Error('Expected unrelated participant');
    await database.db.insert(chatMemberships).values({
      chatId: firstChat.chatId,
      userId: unrelatedParticipant.id,
      workspaceId: firstChat.workspaceId,
    });
    const otherSourceAdminTelegramUserId = 9843;
    await createConnectChat(database.db)({
      adminTelegramUserId: String(otherSourceAdminTelegramUserId),
      telegramChatId: '-1009842',
      timezone: 'UTC',
      title: 'Unrelated source',
    });
    const callbackHandler = createCommitmentActionCallbackHandler({ callbackSigningSecret: 'check-test-secret', database: database.db });
    const openCheckPage = async (telegramUserId: number, id: string): Promise<void> => {
      await callbackHandler({
        payload: { callback_query: {
          data: next.callback_data,
          from: { language_code: 'ru', first_name: 'Member', id: telegramUserId },
          id,
          message: { chat: { id: telegramUserId, type: 'private' }, message_id: 1 },
        } },
        updateId: telegramUserId,
      }, {
        answerCallbackQuery: ({ text }) => {
          answers.push(text);
          return Promise.resolve();
        },
        editPrivateCheckMessage(input) {
          edited.push(input);
          return Promise.resolve();
        },
      });
    };

    await openCheckPage(unrelatedParticipantTelegramUserId, 'check-next-unrelated-participant');
    await openCheckPage(otherSourceAdminTelegramUserId, 'check-next-other-source-admin');

    expect(edited).toEqual([]);
    expect(answers).toEqual([
      'У вас нет прав на это действие.',
      'У вас нет прав на это действие.',
    ]);

    await openCheckPage(actorTelegramUserId, 'check-next');
    expect(answers.at(-1)).toBe('Страница обновлена.');
    const secondPage = edited[0];
    if (!secondPage?.replyMarkup) throw new Error('Expected actionable second page');
    expect(secondPage?.text).toContain('Task 6');
    expect(secondPage?.text).not.toContain('Task 1');
    const previous = secondPage.replyMarkup.inline_keyboard.flat().find((button) => button.text === '◀ Назад');
    if (!previous) throw new Error('Expected previous-page callback');
    await callbackHandler({
      payload: { callback_query: {
        data: previous.callback_data,
        from: { language_code: 'ru', first_name: 'Actor', id: actorTelegramUserId },
        id: 'check-previous',
        message: { chat: { id: actorTelegramUserId, type: 'private' }, message_id: 1 },
      } },
      updateId: 9841,
    }, {
      answerCallbackQuery: () => Promise.resolve(),
      editPrivateCheckMessage(input) {
        edited.push(input);
        return Promise.resolve();
      },
    });
    expect(edited[1]?.text).toContain('Task 1');
  });

  test('uses a stable commitment id tie-breaker when private check pagination timestamps match', async () => {
    const actorTelegramUserId = 9845;
    const chat = await createConnectChat(database.db)({
      adminTelegramUserId: String(actorTelegramUserId), telegramChatId: '-1009845', timezone: 'UTC', title: 'Stable check order',
    });
    const actor = (await database.db.select().from(users).where(eq(users.telegramUserId, actorTelegramUserId)).limit(1))[0];
    if (!actor) throw new Error('Expected actor');
    await database.db.update(users).set({ privateChatStartedAt: new Date() }).where(eq(users.id, actor.id));
    await database.db.update(chatMemberships).set({ notificationsConnectedAt: new Date() }).where(and(
      eq(chatMemberships.userId, actor.id),
      eq(chatMemberships.chatId, chat.chatId),
      eq(chatMemberships.workspaceId, chat.workspaceId),
    ));

    const sharedTimestamp = new Date('2026-07-19T00:00:00.000Z');
    await database.db.insert(commitments).values(Array.from({ length: 6 }, (_, index) => {
      const sequence = 6 - index;
      return {
        assigneeUserId: actor.id,
        chatId: chat.chatId,
        createdAt: sharedTimestamp,
        dueAt: sharedTimestamp,
        id: `00000000-0000-0000-0000-00000000000${sequence}`,
        status: 'open' as const,
        title: `Stable task ${sequence}`,
        workspaceId: chat.workspaceId,
      };
    }));

    const handler = createPrivateCommandHandler(database.db);
    const firstPage = await handler.getCheckPage({ page: 0, telegramUserId: actorTelegramUserId });
    const secondPage = await handler.getCheckPage({ page: 1, telegramUserId: actorTelegramUserId });
    const titleMatches = (text: string | undefined): string[] => [...(text ?? '').matchAll(/Stable task \d/g)].map((match) => match[0]);

    expect(titleMatches(firstPage.text)).toEqual([
      'Stable task 1',
      'Stable task 2',
      'Stable task 3',
      'Stable task 4',
      'Stable task 5',
    ]);
    expect(titleMatches(secondPage.text)).toEqual(['Stable task 6']);
    expect(new Set([...titleMatches(firstPage.text), ...titleMatches(secondPage.text)])).toEqual(new Set([
      'Stable task 1',
      'Stable task 2',
      'Stable task 3',
      'Stable task 4',
      'Stable task 5',
      'Stable task 6',
    ]));
  });

  test('opens one private check detail at a time, then completes only the selected commitment', async () => {
    const actorTelegramUserId = 9850;
    const chat = await createConnectChat(database.db)({
      adminTelegramUserId: String(actorTelegramUserId), telegramChatId: '-1009850', timezone: 'UTC', title: 'Action source',
    });
    const actor = (await database.db.select().from(users).where(eq(users.telegramUserId, actorTelegramUserId)).limit(1))[0];
    if (!actor) throw new Error('Expected actor');
    await database.db.update(users).set({ privateChatStartedAt: new Date() }).where(eq(users.id, actor.id));
    await database.db.update(chatMemberships).set({ notificationsConnectedAt: new Date() }).where(eq(chatMemberships.userId, actor.id));
    const commitment = (await database.db.insert(commitments).values({
      assigneeUserId: actor.id, chatId: chat.chatId, status: 'open', title: 'Complete from check', workspaceId: chat.workspaceId,
    }).returning({ id: commitments.id }))[0];
    if (!commitment) throw new Error('Expected commitment');

    const secondCommitment = (await database.db.insert(commitments).values({
      assigneeUserId: actor.id, chatId: chat.chatId, status: 'open', title: 'Other check commitment', workspaceId: chat.workspaceId,
    }).returning({ id: commitments.id }))[0];
    if (!secondCommitment) throw new Error('Expected second commitment');
    const cards: Array<Readonly<{ replyMarkup?: { inline_keyboard: { callback_data: string; text: string }[][] }; text: string }>> = [];
    await createPrivateUpdateHandler({ callbackSigningSecret: 'check-test-secret', database: database.db })(privateUpdate(actorTelegramUserId, '/check'), {
      sendPrivateMessage(input) {
        cards.push(input);
        return Promise.resolve();
      },
    });
    const select = cards[0]?.replyMarkup?.inline_keyboard.flat().find((button) => button.text.includes('Complete from check'));
    if (!select) throw new Error('Expected selection callback');
    const edited: Array<Readonly<{ replyMarkup?: { inline_keyboard: { callback_data: string; text: string }[][] }; text: string }>> = [];
    const answers: string[] = [];
    const callbackHandler = createCommitmentActionCallbackHandler({ callbackSigningSecret: 'check-test-secret', database: database.db });
    await callbackHandler({
      payload: { callback_query: {
        data: select.callback_data,
        from: { language_code: 'ru', first_name: 'Copied', id: 9852 },
        id: 'copied-selection',
        message: { chat: { id: 9852, type: 'private' }, message_id: 1 },
      } },
      updateId: 9852,
    }, {
      answerCallbackQuery: ({ text }) => { answers.push(text); return Promise.resolve(); },
      editPrivateCheckMessage(input) { edited.push(input); return Promise.resolve(); },
    });
    expect(answers.at(-1)).toBe('У вас нет прав на это действие.');
    expect(edited).toEqual([]);
    await callbackHandler({
      payload: { callback_query: {
        data: select.callback_data,
        from: { language_code: 'ru', first_name: 'Actor', id: actorTelegramUserId },
        id: 'select-from-check',
        message: { chat: { id: actorTelegramUserId, type: 'private' }, message_id: 1 },
      } },
      updateId: 9850,
    }, {
      answerCallbackQuery: ({ text }) => { answers.push(text); return Promise.resolve(); },
      editPrivateCheckMessage(input) { edited.push(input); return Promise.resolve(); },
    });
    const detail = edited[0];
    expect(detail?.text).toContain('Complete from check');
    expect(detail?.text).not.toContain('Other check commitment');
    const back = detail?.replyMarkup?.inline_keyboard.flat().find((button) => button.text === '◀ Назад');
    if (!back) throw new Error('Expected detail back callback');
    await callbackHandler({
      payload: { callback_query: {
        data: back.callback_data,
        from: { language_code: 'ru', first_name: 'Actor', id: actorTelegramUserId },
        id: 'back-to-picker',
        message: { chat: { id: actorTelegramUserId, type: 'private' }, message_id: 1 },
      } },
      updateId: 9854,
    }, {
      answerCallbackQuery: ({ text }) => { answers.push(text); return Promise.resolve(); },
      editPrivateCheckMessage(input) { edited.push(input); return Promise.resolve(); },
    });
    const pickerAgain = edited[1];
    expect(pickerAgain?.text).toContain('Complete from check');
    const selectAgain = pickerAgain?.replyMarkup?.inline_keyboard.flat().find((button) => button.text.includes('Complete from check'));
    if (!selectAgain) throw new Error('Expected fresh selection callback');
    await callbackHandler({
      payload: { callback_query: {
        data: selectAgain.callback_data,
        from: { language_code: 'ru', first_name: 'Actor', id: actorTelegramUserId },
        id: 'select-again',
        message: { chat: { id: actorTelegramUserId, type: 'private' }, message_id: 1 },
      } },
      updateId: 9855,
    }, {
      answerCallbackQuery: ({ text }) => { answers.push(text); return Promise.resolve(); },
      editPrivateCheckMessage(input) { edited.push(input); return Promise.resolve(); },
    });
    const complete = edited[2]?.replyMarkup?.inline_keyboard.flat().find((button) => button.text === 'Готово');
    if (!complete) throw new Error('Expected fresh detail complete callback');
    await callbackHandler({
      payload: { callback_query: {
        data: complete.callback_data,
        from: { language_code: 'ru', first_name: 'Copied', id: 9852 },
        id: 'copied-detail-action',
        message: { chat: { id: 9852, type: 'private' }, message_id: 1 },
      } },
      updateId: 9853,
    }, { answerCallbackQuery: ({ text }) => { answers.push(text); return Promise.resolve(); } });
    expect(answers.at(-1)).toBe('У вас нет прав на это действие.');
    const refreshedPickers: Array<Readonly<{ text: string }>> = [];
    await callbackHandler({
      payload: { callback_query: {
        data: complete.callback_data,
        from: { language_code: 'ru', first_name: 'Actor', id: actorTelegramUserId },
        id: 'complete-from-check',
        message: { chat: { id: actorTelegramUserId, type: 'private' }, message_id: 1 },
      } },
      updateId: 9851,
    }, {
      answerCallbackQuery: ({ text }) => { answers.push(text); return Promise.resolve(); },
      editCallbackMessage: () => Promise.resolve(),
      sendPrivateCheckMessage(input) { refreshedPickers.push(input); return Promise.resolve(); },
    });

    expect((await database.db.select().from(commitments).where(eq(commitments.id, commitment.id)))[0]).toMatchObject({ status: 'completed' });
    expect((await database.db.select().from(commitments).where(eq(commitments.id, secondCommitment.id)))[0]).toMatchObject({ status: 'open' });
    expect(refreshedPickers[0]?.text).toContain('Other check commitment');
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
          from: { language_code: 'ru', first_name: 'Admin', id: 9813, is_bot: false },
          message_id: 41,
          reply_to_message: {
            date: 1_784_365_100,
            from: { language_code: 'ru', first_name: 'Author', id: 9814, is_bot: false },
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
        from: { language_code: 'ru', first_name: 'Member', id: actorId, is_bot: false },
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
        from: { language_code: 'ru', first_name: 'Member', id: telegramUserId, is_bot: false },
        message_id: 1,
        text,
      },
      update_id: telegramUserId,
    },
    updateId: telegramUserId,
  };
}
