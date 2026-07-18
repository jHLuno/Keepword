import { z } from 'zod';

import type {
  AnalyzeGroupMessage,
  ClarificationRequest,
  SuggestionReply,
} from '../../services/analyze-message.js';
import type { ConnectChat } from '../../services/connect-chat.js';
import type { OnboardingInvitationService } from '../../services/onboarding-invitation.js';
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

const groupMessageUpdateSchema = z
  .object({
    message: z.object({
      chat: z.object({
        id: z.number().int(),
        type: z.enum(['group', 'supergroup']),
      }),
      date: z.number().int().nonnegative(),
      from: z.object({
        first_name: z.string().min(1),
        id: z.number().int(),
        is_bot: z.boolean(),
        last_name: z.string().optional(),
        username: z.string().optional(),
      }),
      message_id: z.number().int().nonnegative(),
      text: z.string().min(1),
    }),
  })
  .passthrough();

export type OnboardingCard = Readonly<{
  onboardingDeepLink: string;
  telegramChatId: string;
  text: string;
}>;

export type GroupMessenger = Readonly<{
  sendClarificationRequest: (request: ClarificationRequest) => Promise<void>;
  sendOnboardingCard: (card: OnboardingCard) => Promise<void>;
  sendSuggestionReply: (reply: SuggestionReply) => Promise<void>;
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
  analyzeGroupMessage?: AnalyzeGroupMessage;
  botUsername: string;
  connectChat: ConnectChat;
  onboardingInvitations: OnboardingInvitationService;
}>): GroupUpdateHandler {
  return async (update, messenger) => {
    const parsedMessageUpdate = groupMessageUpdateSchema.safeParse(update.payload);
    if (parsedMessageUpdate.success && !parsedMessageUpdate.data.message.from.is_bot && input.analyzeGroupMessage) {
      const message = parsedMessageUpdate.data.message;
      await input.analyzeGroupMessage({
        author: {
          firstName: message.from.first_name,
          telegramUserId: message.from.id,
          ...(message.from.last_name ? { lastName: message.from.last_name } : {}),
          ...(message.from.username ? { username: message.from.username } : {}),
        },
        messenger,
        sentAt: new Date(message.date * 1_000),
        telegramChatId: String(message.chat.id),
        telegramMessageId: String(message.message_id),
        text: message.text,
      });
      return;
    }

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

    const invitation = await input.onboardingInvitations.prepareInvitation(connectedChat);
    if (!invitation) {
      return;
    }

    await messenger.sendOnboardingCard({
      onboardingDeepLink: `https://t.me/${input.botUsername}?start=join_${invitation.onboardingToken}`,
      telegramChatId: invitation.telegramChatId,
      text: onboardingText,
    });
    await input.onboardingInvitations.markOnboardingMessageSent(invitation);
  };
}
