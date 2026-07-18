import { z } from 'zod';

import type { ConnectChat } from '../../services/connect-chat.js';
import type { TelegramUpdate } from '../bot.js';

const groupMemberUpdateSchema = z
  .object({
    my_chat_member: z.object({
      chat: z.object({
        id: z.number().int(),
        title: z.string().min(1),
        type: z.enum(['group', 'supergroup']),
      }),
      from: z.object({ id: z.number().int() }),
      new_chat_member: z.object({ status: z.string() }),
      old_chat_member: z.object({ status: z.string() }),
    }),
  })
  .passthrough();

export type OnboardingCard = Readonly<{
  onboardingDeepLink: string;
  telegramChatId: string;
  text: string;
}>;

export type GroupMessenger = Readonly<{
  sendOnboardingCard: (card: OnboardingCard) => Promise<void>;
}>;

export type GroupUpdateHandler = (update: TelegramUpdate, messenger: GroupMessenger) => Promise<void>;

const onboardingText = [
  '👋 Keepword подключён',
  '',
  'Я замечаю рабочие договорённости только в новых сообщениях после подключения и помогаю не терять их.',
  '',
  'Я не создаю задачи молча: каждая договорённость должна быть подтверждена автором или администратором.',
  '',
  'Чтобы получать личные напоминания и вечерние сводки, подключите личные уведомления.',
].join('\n');

function isBotAdded(previousStatus: string, nextStatus: string): boolean {
  return ['left', 'kicked'].includes(previousStatus) && ['member', 'administrator'].includes(nextStatus);
}

export function createGroupUpdateHandler(input: Readonly<{
  botUsername: string;
  connectChat: ConnectChat;
}>): GroupUpdateHandler {
  return async (update, messenger) => {
    const parsedUpdate = groupMemberUpdateSchema.safeParse(update.payload);

    if (!parsedUpdate.success) {
      return;
    }

    const memberUpdate = parsedUpdate.data.my_chat_member;
    if (!isBotAdded(memberUpdate.old_chat_member.status, memberUpdate.new_chat_member.status)) {
      return;
    }

    const connectedChat = await input.connectChat({
      adminTelegramUserId: String(memberUpdate.from.id),
      telegramChatId: String(memberUpdate.chat.id),
      timezone: 'UTC',
      title: memberUpdate.chat.title,
    });

    await messenger.sendOnboardingCard({
      onboardingDeepLink: `https://t.me/${input.botUsername}?start=join_${connectedChat.onboardingToken}`,
      telegramChatId: connectedChat.telegramChatId,
      text: onboardingText,
    });
  };
}
