import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chatMemberships, chats, commitments, users } from '../../db/schema.js';
import type { RepositoryDatabase } from '../../repositories/database.js';

export type TelegramCommand = Readonly<{
  argument: string | null;
  name: string;
}>;

export type PrivateCommandResult = Readonly<{
  handled: boolean;
  text?: string;
}>;

type ConnectedChat = Readonly<{
  chatId: string;
  notificationsEnabled: boolean;
  title: string;
  workspaceId: string;
}>;

const privateHelpText = [
  'Keepword помогает не терять подтверждённые договорённости.',
  '',
  '/tasks — мои задачи в подключённой группе',
  '/settings on|off [номер] — личные уведомления',
  '/privacy — как обрабатываются данные; удаление: /privacy delete в группе для текущего администратора',
  '',
  'Перешлите сообщение с обещанием — я предложу карточку для подтверждения.',
].join('\n');

const groupOnlyText = 'Используйте эту команду в подключённой группе Keepword.';

export function parseTelegramCommand(text: string): TelegramCommand | null {
  const parsed = /^\/([a-z]+)(?:@\w+)?(?:\s+(.+))?$/i.exec(text.trim());
  if (!parsed) {
    return null;
  }
  return { argument: parsed[2]?.trim() || null, name: parsed[1]!.toLowerCase() };
}

function renderChatSelection(chatsForUser: readonly ConnectedChat[], usage: string): string {
  if (chatsForUser.length === 0) {
    return 'Сначала подключите уведомления через ссылку из нужной группы.';
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
): Readonly<{
  handle: (input: Readonly<{ command: TelegramCommand; telegramUserId: number }>) => Promise<PrivateCommandResult>;
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

  return {
    async handle(input) {
      if (input.command.name === 'help') {
        return { handled: true, text: privateHelpText };
      }
      if (input.command.name === 'start') {
        return { handled: true, text: privateHelpText };
      }
      if (input.command.name === 'invite' || input.command.name === 'keep' || input.command.name === 'notifications') {
        return { handled: true, text: groupOnlyText };
      }
      if (input.command.name === 'privacy') {
        return {
          handled: true,
          text: 'Я обрабатываю только новые сообщения подключённых групп и храню источник для подтверждённой задачи. Для удаления данных текущий администратор отправляет /privacy delete в нужной группе.',
        };
      }
      const chatsForUser = await connectedChats(input.telegramUserId);
      if (input.command.name === 'tasks') {
        const selectedChat = selectChat(chatsForUser, input.command.argument);
        if (!selectedChat) {
          return { handled: true, text: renderChatSelection(chatsForUser, 'Выберите группу: /tasks <номер>') };
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
          ? '— открытых задач нет'
          : rows.map((task) => `— ${task.title}${task.dueDateText ? ` · ${task.dueDateText}` : ''}`).join('\n');
        return { handled: true, text: `📋 ${selectedChat.title}\n\n${taskLines}` };
      }
      if (input.command.name === 'settings') {
        const settings = /^(on|off)(?:\s+(\d+))?$/i.exec(input.command.argument ?? '');
        if (!settings) {
          const status = chatsForUser.length === 0
            ? 'Нет подключённых групп.'
            : chatsForUser.map((chat, index) => `${index + 1}. ${chat.title} — ${chat.notificationsEnabled ? 'вкл.' : 'выкл.'}`).join('\n');
          return { handled: true, text: `🔔 Личные уведомления\n${status}\n\nИспользуйте: /settings on|off [номер]` };
        }
        const selectedChat = selectChat(chatsForUser, settings[2] ?? null);
        if (!selectedChat) {
          return { handled: true, text: renderChatSelection(chatsForUser, 'Выберите группу: /settings on|off <номер>') };
        }
        const enabled = settings[1]!.toLowerCase() === 'on';
        const user = (await database.select({ id: users.id }).from(users).where(eq(users.telegramUserId, input.telegramUserId)).limit(1))[0];
        if (!user) {
          return { handled: true, text: 'Сначала подключите уведомления через ссылку из нужной группы.' };
        }
        await database
          .update(chatMemberships)
          .set({ notificationsEnabled: enabled, updatedAt: new Date() })
          .where(and(eq(chatMemberships.chatId, selectedChat.chatId), eq(chatMemberships.workspaceId, selectedChat.workspaceId), eq(chatMemberships.userId, user.id)));
        return { handled: true, text: `Личные уведомления для «${selectedChat.title}» ${enabled ? 'включены' : 'выключены'}.` };
      }
      return { handled: false };
    },
  };
}
