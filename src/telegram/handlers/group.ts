import { z } from 'zod';

import type {
  AnalyzeGroupMessage,
  ClarificationRequest,
  SuggestionReply,
} from '../../services/analyze-message.js';
import type { ConnectChat } from '../../services/connect-chat.js';
import type { OnboardingInvitationService } from '../../services/onboarding-invitation.js';
import type { OnboardingService } from '../../services/onboarding.js';
import type { CurrentChatAdminChecker } from '../../services/authorize-action.js';
import type { TelegramUpdate } from '../bot.js';
import { onboardingCardText, renderNotificationStatus } from '../messages.js';

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
  isCurrentChatAdmin?: CurrentChatAdminChecker;
  sendClarificationRequest: (request: ClarificationRequest) => Promise<void>;
  sendGroupMessage?: (input: Readonly<{ telegramChatId: string; text: string }>) => Promise<void>;
  sendOnboardingCard: (card: OnboardingCard) => Promise<void>;
  sendNotificationInvite?: (invite: Readonly<{
    onboardingDeepLink: string;
    telegramChatId: string;
    text: string;
  }>) => Promise<void>;
  sendSuggestionReply: (reply: SuggestionReply) => Promise<void>;
}>;

export type GroupUpdateHandler = (update: TelegramUpdate, messenger: GroupMessenger) => Promise<void>;

function isBotAdded(previousStatus: string, nextStatus: string): boolean {
  return ['left', 'kicked'].includes(previousStatus) && ['member', 'administrator'].includes(nextStatus);
}

export function createGroupUpdateHandler(input: Readonly<{
  analyzeGroupMessage?: AnalyzeGroupMessage;
  botUsername: string;
  connectChat: ConnectChat;
  onboardingInvitations: OnboardingInvitationService;
  onboarding?: OnboardingService;
}>): GroupUpdateHandler {
  return async (update, messenger) => {
    const parsedMessageUpdate = groupMessageUpdateSchema.safeParse(update.payload);
    if (parsedMessageUpdate.success && !parsedMessageUpdate.data.message.from.is_bot) {
      const message = parsedMessageUpdate.data.message;
      const command = /^\/(invite|notifications)(?:@\w+)?$/i.exec(message.text.trim())?.[1]?.toLowerCase();
      if (command && input.onboarding) {
        const isAdmin = await (messenger.isCurrentChatAdmin ?? (() => Promise.resolve(false)))({
          telegramChatId: String(message.chat.id),
          telegramUserId: message.from.id,
        });
        if (!isAdmin) {
          await messenger.sendGroupMessage?.({
            telegramChatId: String(message.chat.id),
            text: 'Только администратор чата может управлять уведомлениями.',
          });
          return;
        }
        const chat = await input.onboarding.findActiveChatByTelegramChatId(String(message.chat.id));
        if (!chat) {
          return;
        }
        if (command === 'invite') {
          const onboardingDeepLink = await input.onboarding.createOnboardingLink(chat.id);
          await messenger.sendOnboardingCard({
            onboardingDeepLink,
            telegramChatId: chat.telegramChatId,
            text: onboardingCardText,
          });
          return;
        }
        await messenger.sendGroupMessage?.({
          telegramChatId: chat.telegramChatId,
          text: renderNotificationStatus(await input.onboarding.notificationStatus(chat.id)),
        });
        return;
      }
      if (!input.analyzeGroupMessage) {
        return;
      }
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
      text: onboardingCardText,
    });
    await input.onboardingInvitations.markOnboardingMessageSent(invitation);
  };
}
