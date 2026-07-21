import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chatMemberships, chats, commitments, users } from '../../db/schema.js';
import type { RepositoryDatabase } from '../../repositories/database.js';
import { createCallbackTokenService } from '../../services/callback-tokens.js';
import { createReliabilityRepository } from '../../repositories/reliability.js';
import { createSignedCallback } from '../callback-data.js';
import {
  renderPrivateCheck,
  renderPrivateCheckCommitmentDetail,
  t,
  type InlineKeyboardMarkup,
  type PrivateCheckItem,
} from '../messages.js';
import { normalizeLocale, type Locale } from '../../i18n/index.js';

export type TelegramCommand = Readonly<{
  argument: string | null;
  name: string;
}>;

export type PrivateCommandResult = Readonly<{
  handled: boolean;
  replyMarkup?: InlineKeyboardMarkup;
  text?: string;
}>;

type ConnectedChat = Readonly<{
  chatId: string;
  notificationsEnabled: boolean;
  title: string;
  workspaceId: string;
}>;

type CheckRow = Readonly<{
  chatTitle: string;
  dueDateText: string | null;
  id: string;
  status: PrivateCheckItem['status'];
  title: string;
}>;

const checkPageSize = 5;

export function parseTelegramCommand(text: string): TelegramCommand | null {
  const parsed = /^\/([a-z]+)(?:@\w+)?(?:\s+(.+))?$/i.exec(text.trim());
  if (!parsed) {
    return null;
  }
  return { argument: parsed[2]?.trim() || null, name: parsed[1]!.toLowerCase() };
}

function renderChatSelection(locale: Locale, chatsForUser: readonly ConnectedChat[], usage: string): string {
  if (chatsForUser.length === 0) {
    return t(locale).connectFirst;
  }
  return `${usage}\n${chatsForUser.map((chat, index) => `${index + 1}. ${chat.title}`).join('\n')}`;
}

function selectChat(chatsForUser: readonly ConnectedChat[], argument: string | null): ConnectedChat | null {
  if (argument === null && chatsForUser.length === 1) {
    return chatsForUser[0]!;
  }
  if (!argument || !/^\d+$/.test(argument)) {
    return null;
  }
  const index = Number(argument) - 1;
  return Number.isSafeInteger(index) ? chatsForUser[index] ?? null : null;
}

export function createPrivateCommandHandler<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
  callbackSigningSecret?: string,
): Readonly<{
  getCheckPage: (input: Readonly<{ languageCode?: string | undefined; page: number; telegramUserId: number }>) => Promise<PrivateCommandResult>;
  getCheckCommitmentDetail: (input: Readonly<{
    commitmentId: string;
    languageCode?: string | undefined;
    page: number;
    telegramUserId: number;
  }>) => Promise<PrivateCommandResult>;
  handle: (input: Readonly<{ command: TelegramCommand; languageCode?: string | undefined; telegramUserId: number }>) => Promise<PrivateCommandResult>;
}> {
  async function connectedChats(telegramUserId: number): Promise<readonly ConnectedChat[]> {
    return database
      .select({
        chatId: chats.id,
        notificationsEnabled: chatMemberships.notificationsEnabled,
        title: chats.title,
        workspaceId: chats.workspaceId,
      })
      .from(chatMemberships)
      .innerJoin(users, eq(chatMemberships.userId, users.id))
      .innerJoin(chats, and(eq(chatMemberships.chatId, chats.id), eq(chatMemberships.workspaceId, chats.workspaceId)))
      .where(and(eq(users.telegramUserId, telegramUserId), isNotNull(users.privateChatStartedAt), eq(chats.isActive, true)))
      .orderBy(asc(chats.createdAt));
  }

  async function hasCompletedNotificationOnboarding(telegramUserId: number): Promise<boolean> {
    const membership = await database
      .select({ id: chatMemberships.id })
      .from(chatMemberships)
      .innerJoin(users, eq(chatMemberships.userId, users.id))
      .innerJoin(chats, and(eq(chatMemberships.chatId, chats.id), eq(chatMemberships.workspaceId, chats.workspaceId)))
      .where(and(
        eq(users.telegramUserId, telegramUserId),
        isNotNull(users.privateChatStartedAt),
        isNotNull(chatMemberships.notificationsConnectedAt),
        eq(chats.isActive, true),
      ))
      .limit(1);
    return membership.length > 0;
  }

  async function getCheckPage(input: Readonly<{ languageCode?: string | undefined; page: number; telegramUserId: number }>): Promise<PrivateCommandResult> {
    const locale = normalizeLocale(input.languageCode);
    if (!Number.isSafeInteger(input.page) || input.page < 0 || !await hasCompletedNotificationOnboarding(input.telegramUserId)) {
      return { handled: true, text: t(locale).connectFirst };
    }
    const now = new Date();
    const reliabilityRepository = createReliabilityRepository(database);
    const [rows, reliability] = await Promise.all([
      database
      .select({
        chatTitle: chats.title,
        dueDateText: commitments.dueDateText,
        id: commitments.id,
        status: commitments.status,
        title: commitments.title,
      })
      .from(commitments)
      .innerJoin(users, eq(commitments.assigneeUserId, users.id))
      .innerJoin(chats, and(eq(commitments.chatId, chats.id), eq(commitments.workspaceId, chats.workspaceId)))
      .innerJoin(chatMemberships, and(
        eq(chatMemberships.chatId, commitments.chatId),
        eq(chatMemberships.workspaceId, commitments.workspaceId),
        eq(chatMemberships.userId, commitments.assigneeUserId),
      ))
      .where(
        and(
          eq(users.telegramUserId, input.telegramUserId),
          isNotNull(users.privateChatStartedAt),
          isNotNull(chatMemberships.notificationsConnectedAt),
          eq(chats.isActive, true),
          inArray(commitments.status, ['open', 'overdue', 'blocked']),
        ),
      )
      .orderBy(asc(commitments.dueAt), asc(commitments.createdAt), asc(commitments.id))
      .limit(checkPageSize + 1)
      .offset(input.page * checkPageSize),
      reliabilityRepository.findUserCrossChatReliability({ now, telegramUserId: input.telegramUserId }),
    ]);
    const pageRows = rows.slice(0, checkPageSize) as readonly CheckRow[];
    if (pageRows.length === 0) {
      return { handled: true, ...renderPrivateCheck(locale, { items: [], reliability }) };
    }
    const items: PrivateCheckItem[] = pageRows.map((row) => ({
      chatTitle: row.chatTitle,
      dueDateText: row.dueDateText,
      status: row.status,
      title: row.title,
    }));
    if (!callbackSigningSecret) {
      return { handled: true, ...renderPrivateCheck(locale, { items, reliability }) };
    }
    const callbackTokens = createCallbackTokenService(database);
    for (const [index, row] of pageRows.entries()) {
      const callback = await callbackTokens.issueCheckCommitmentCallback({
        commitmentId: row.id,
        page: input.page,
        telegramUserId: input.telegramUserId,
      });
      items[index] = {
        callback: createSignedCallback('check_commitment', callback, callbackSigningSecret),
        chatTitle: row.chatTitle,
        dueDateText: row.dueDateText,
        status: row.status,
        title: row.title,
      };
    }
    const previousPageCallback = input.page === 0
      ? undefined
      : createSignedCallback(
        'check_page',
        await callbackTokens.issueCheckPageCallback({ page: input.page - 1, telegramUserId: input.telegramUserId }),
        callbackSigningSecret,
      );
    const nextPageCallback = rows.length > checkPageSize
      ? createSignedCallback(
        'check_page',
        await callbackTokens.issueCheckPageCallback({ page: input.page + 1, telegramUserId: input.telegramUserId }),
        callbackSigningSecret,
      )
      : undefined;
    return { handled: true, ...renderPrivateCheck(locale, { items, nextPageCallback, previousPageCallback, reliability }) };
  }

  async function getCheckCommitmentDetail(input: Readonly<{
    commitmentId: string;
    languageCode?: string | undefined;
    page: number;
    telegramUserId: number;
  }>): Promise<PrivateCommandResult> {
    const locale = normalizeLocale(input.languageCode);
    if (!Number.isSafeInteger(input.page) || input.page < 0 || !await hasCompletedNotificationOnboarding(input.telegramUserId)) {
      return { handled: false };
    }
    const row = (
      await database
        .select({
          chatTitle: chats.title,
          dueDateText: commitments.dueDateText,
          id: commitments.id,
          status: commitments.status,
          title: commitments.title,
        })
        .from(commitments)
        .innerJoin(users, eq(commitments.assigneeUserId, users.id))
        .innerJoin(chats, and(eq(commitments.chatId, chats.id), eq(commitments.workspaceId, chats.workspaceId)))
        .innerJoin(chatMemberships, and(
          eq(chatMemberships.chatId, commitments.chatId),
          eq(chatMemberships.workspaceId, commitments.workspaceId),
          eq(chatMemberships.userId, commitments.assigneeUserId),
        ))
        .where(and(
          eq(commitments.id, input.commitmentId),
          eq(users.telegramUserId, input.telegramUserId),
          isNotNull(users.privateChatStartedAt),
          isNotNull(chatMemberships.notificationsConnectedAt),
          eq(chats.isActive, true),
          inArray(commitments.status, ['open', 'overdue', 'blocked']),
        ))
        .limit(1)
    )[0] as CheckRow | undefined;
    if (!row) {
      return { handled: false };
    }
    if (!callbackSigningSecret) {
      return { handled: true, text: t(locale).toastUnavailable };
    }
    const callbackTokens = createCallbackTokenService(database);
    const callbacks = await callbackTokens.issueCommitmentCallbacks({
      actions: ['complete', 'block', 'reschedule'],
      commitmentId: row.id,
      page: input.page,
      telegramUserId: input.telegramUserId,
    });
    if (!callbacks.complete || !callbacks.block || !callbacks.reschedule) {
      throw new Error('Expected contextual commitment callbacks');
    }
    const back = await callbackTokens.issueCheckBackCallback({ page: input.page, telegramUserId: input.telegramUserId });
    return {
      handled: true,
      ...renderPrivateCheckCommitmentDetail(locale, {
        callbacks: {
          back: createSignedCallback('check_back', back, callbackSigningSecret),
          block: createSignedCallback('block', callbacks.block, callbackSigningSecret),
          complete: createSignedCallback('complete', callbacks.complete, callbackSigningSecret),
          reschedule: createSignedCallback('reschedule', callbacks.reschedule, callbackSigningSecret),
        },
        chatTitle: row.chatTitle,
        dueDateText: row.dueDateText,
        status: row.status,
        title: row.title,
      }),
    };
  }

  return {
    getCheckPage,
    getCheckCommitmentDetail,
    async handle(input) {
      const locale = normalizeLocale(input.languageCode);
      const strings = t(locale);
      if (input.command.name === 'help') {
        return { handled: true, text: strings.privateHelp.join('\n') };
      }
      if (input.command.name === 'start') {
        return { handled: true, text: strings.privateHelp.join('\n') };
      }
      if (input.command.name === 'invite' || input.command.name === 'keep' || input.command.name === 'notifications') {
        return { handled: true, text: strings.commandGroupOnly };
      }
      if (input.command.name === 'privacy') {
        return {
          handled: true,
          text: strings.privacyInfoPrivate,
        };
      }
      if (input.command.name === 'check') {
        return getCheckPage({ languageCode: input.languageCode, page: 0, telegramUserId: input.telegramUserId });
      }
      const chatsForUser = await connectedChats(input.telegramUserId);
      if (input.command.name === 'tasks') {
        const selectedChat = selectChat(chatsForUser, input.command.argument);
        if (!selectedChat) {
          return { handled: true, text: renderChatSelection(locale, chatsForUser, strings.tasksChoose) };
        }
        const rows = await database
          .select({ dueDateText: commitments.dueDateText, status: commitments.status, title: commitments.title })
          .from(commitments)
          .innerJoin(users, eq(commitments.assigneeUserId, users.id))
          .where(
            and(
              eq(commitments.workspaceId, selectedChat.workspaceId),
              eq(commitments.chatId, selectedChat.chatId),
              eq(users.telegramUserId, input.telegramUserId),
              inArray(commitments.status, ['open', 'overdue', 'blocked']),
            ),
          )
          .orderBy(asc(commitments.dueAt), asc(commitments.createdAt));
        const taskLines = rows.length === 0
          ? strings.tasksEmpty
          : rows.map((task) => `— ${task.title}${task.dueDateText ? ` · ${task.dueDateText}` : ''}`).join('\n');
        return { handled: true, text: `📋 ${selectedChat.title}\n\n${taskLines}` };
      }
      if (input.command.name === 'settings') {
        const settings = /^(on|off)(?:\s+(\d+))?$/i.exec(input.command.argument ?? '');
        if (!settings) {
          const status = chatsForUser.length === 0
            ? strings.settingsNoGroups
            : chatsForUser.map((chat, index) => `${index + 1}. ${chat.title} — ${chat.notificationsEnabled ? strings.statusOn : strings.statusOff}`).join('\n');
          return { handled: true, text: `${strings.settingsNotifTitle}\n${status}\n\n${strings.settingsNotifUsage}` };
        }
        const selectedChat = selectChat(chatsForUser, settings[2] ?? null);
        if (!selectedChat) {
          return { handled: true, text: renderChatSelection(locale, chatsForUser, strings.settingsChoose) };
        }
        const enabled = settings[1]!.toLowerCase() === 'on';
        const user = (await database.select({ id: users.id }).from(users).where(eq(users.telegramUserId, input.telegramUserId)).limit(1))[0];
        if (!user) {
          return { handled: true, text: strings.connectFirst };
        }
        await database
          .update(chatMemberships)
          .set({ notificationsEnabled: enabled, updatedAt: new Date() })
          .where(and(eq(chatMemberships.chatId, selectedChat.chatId), eq(chatMemberships.workspaceId, selectedChat.workspaceId), eq(chatMemberships.userId, user.id)));
        return { handled: true, text: strings.settingsUpdated(selectedChat.title, enabled) };
      }
      return { handled: false };
    },
  };
}
