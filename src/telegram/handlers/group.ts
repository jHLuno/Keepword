import { z } from 'zod';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type {
  AnalyzeGroupMessage,
  ClarificationRequest,
  SuggestionReply,
} from '../../services/analyze-message.js';
import type { ConnectChat } from '../../services/connect-chat.js';
import type { OnboardingInvitationService } from '../../services/onboarding-invitation.js';
import type { OnboardingService } from '../../services/onboarding.js';
import {
  createAuthorizeSuggestionAction,
  type CurrentChatAdminChecker,
  SuggestionActionAuthorizationError,
} from '../../services/authorize-action.js';
import { createCallbackTokenService } from '../../services/callback-tokens.js';
import {
  createSuggestionEditSessionService,
  parseSuggestionEditInput,
  SuggestionEditSessionError,
} from '../../services/suggestion-edit-sessions.js';
import { ChatSettingsError, type ChatSettingsService } from '../../services/chat-settings.js';
import { ChatDataDeletionError, type DeleteChatData } from '../../services/delete-chat-data.js';
import type { TelegramUpdate } from '../bot.js';
import { renderNotificationStatus, renderOnboardingCard, renderSuggestion, t } from '../messages.js';
import { normalizeLocale } from '../../i18n/index.js';
import { parseTelegramCommand } from './commands.js';
import type { RepositoryDatabase } from '../../repositories/database.js';
import type { Logger } from '../../observability/logger.js';

const groupMemberUpdateSchema = z
  .object({
    my_chat_member: z.object({
      chat: z.object({
        id: z.number().int(),
        title: z.string().min(1),
        type: z.enum(['group', 'supergroup']),
      }),
      from: z.object({ id: z.number().int(), language_code: z.string().optional() }),
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
        language_code: z.string().optional(),
        last_name: z.string().optional(),
        username: z.string().optional(),
      }),
      message_id: z.number().int().nonnegative(),
      reply_to_message: z.object({
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
      }).optional(),
      text: z.string().min(1),
    }),
  })
  .passthrough();

export type OnboardingCard = Readonly<{
  buttonText: string;
  onboardingDeepLink: string;
  telegramChatId: string;
  text: string;
}>;

export type GroupMessenger = Readonly<{
  isCurrentChatAdmin?: CurrentChatAdminChecker;
  sendClarificationRequest: (request: ClarificationRequest) => Promise<void>;
  sendGroupMessage?: (input: Readonly<{ telegramChatId: string; text: string }>) => Promise<void>;
  sendPrivateMessage?: (input: Readonly<{ telegramUserId: number; text: string }>) => Promise<void>;
  sendOnboardingCard: (card: OnboardingCard) => Promise<void>;
  sendNotificationInvite?: (invite: Readonly<{
    buttonText: string;
    onboardingDeepLink: string;
    telegramChatId: string;
    text: string;
  }>) => Promise<void>;
  sendSuggestionReply: (reply: SuggestionReply) => Promise<void>;
}>;

export type GroupUpdateHandler = (update: TelegramUpdate, messenger: GroupMessenger) => Promise<void>;

type ChatSettingsFactory = (isCurrentChatAdmin: CurrentChatAdminChecker) => ChatSettingsService;
type DeleteChatDataFactory = (isCurrentChatAdmin: CurrentChatAdminChecker) => DeleteChatData;

function isBotAdded(previousStatus: string, nextStatus: string): boolean {
  return ['left', 'kicked'].includes(previousStatus) && ['member', 'administrator'].includes(nextStatus);
}

export function createGroupUpdateHandler<TQueryResult extends PgQueryResultHKT>(input: Readonly<{
  analyzeGroupMessage?: AnalyzeGroupMessage;
  botUsername: string;
  callbackSigningSecret?: string;
  chatSettings?: ChatSettingsFactory;
  connectChat: ConnectChat;
  database?: RepositoryDatabase<TQueryResult>;
  deleteChatData?: DeleteChatDataFactory;
  logger?: Logger;
  onboardingInvitations: OnboardingInvitationService;
  onboarding?: OnboardingService;
}>): GroupUpdateHandler {
  return async (update, messenger) => {
    const parsedMessageUpdate = groupMessageUpdateSchema.safeParse(update.payload);
    if (parsedMessageUpdate.success && !parsedMessageUpdate.data.message.from.is_bot) {
      const message = parsedMessageUpdate.data.message;
      const locale = normalizeLocale(message.from.language_code);
      const strings = t(locale);
      const command = parseTelegramCommand(message.text);
      if (command?.name === 'help') {
        await messenger.sendGroupMessage?.({
          telegramChatId: String(message.chat.id),
          text: strings.groupHelp,
        });
        return;
      }
      if (command?.name === 'settings' && input.chatSettings && input.onboarding) {
        const chat = await input.onboarding.findActiveChatByTelegramChatId(String(message.chat.id));
        if (!chat) {
          return;
        }
        const args = (command.argument ?? '').trim().split(/\s+/).filter(Boolean);
        const sub = args[0]?.toLowerCase() ?? '';
        const value = args.slice(1).join(' ');
        const settings = input.chatSettings(messenger.isCurrentChatAdmin ?? (() => Promise.resolve(false)));
        const scope = {
          chatId: chat.id,
          requestedByTelegramUserId: String(message.from.id),
          workspaceId: chat.workspaceId,
        };
        try {
          let text: string;
          if (sub === 'language') {
            text = strings.settingsLanguageSaved(await settings.setLanguage({ ...scope, language: value }));
          } else if (sub === 'timezone') {
            text = strings.settingsTimezoneSaved(await settings.setTimezone({ ...scope, timezone: value }));
          } else if (sub === 'digest') {
            text = strings.settingsDigestSaved(await settings.setDigestTime({ ...scope, time: value }));
          } else {
            const mode = sub === 'mode' ? value : sub;
            const savedMode = await settings.setMode({ ...scope, mode });
            const label = savedMode === 'suggest' ? 'Suggest' : savedMode === 'manual' ? 'Manual' : 'Silent Digest';
            text = strings.settingsModeSaved(label);
          }
          await messenger.sendGroupMessage?.({ telegramChatId: chat.telegramChatId, text });
        } catch (error: unknown) {
          if (error instanceof ChatSettingsError) {
            const text = error.code === 'UNAUTHORIZED'
              ? strings.settingsModeUnauthorized
              : error.code === 'INVALID_LANGUAGE'
                ? strings.settingsInvalidLanguage
                : error.code === 'INVALID_TIMEZONE'
                  ? strings.settingsInvalidTimezone
                  : error.code === 'INVALID_DIGEST_TIME'
                    ? strings.settingsInvalidDigest
                    : strings.settingsModeUsage;
            await messenger.sendGroupMessage?.({ telegramChatId: chat.telegramChatId, text });
            return;
          }
          throw error;
        }
        return;
      }
      if (command?.name === 'settings' || command?.name === 'start' || command?.name === 'tasks' || command?.name === 'check') {
        await messenger.sendGroupMessage?.({ telegramChatId: String(message.chat.id), text: strings.commandInPrivate });
        return;
      }
      if (command?.name === 'privacy' && command.argument?.toLowerCase() === 'delete' && input.deleteChatData && input.onboarding) {
        const chat = await input.onboarding.findActiveChatByTelegramChatId(String(message.chat.id));
        if (!chat) {
          return;
        }
        try {
          await input.deleteChatData(messenger.isCurrentChatAdmin ?? (() => Promise.resolve(false)))({
            chatId: chat.id,
            requestedByTelegramUserId: String(message.from.id),
            workspaceId: chat.workspaceId,
          });
          await messenger.sendGroupMessage?.({ telegramChatId: chat.telegramChatId, text: strings.privacyDeleted });
        } catch (error: unknown) {
          if (error instanceof ChatDataDeletionError) {
            await messenger.sendGroupMessage?.({
              telegramChatId: chat.telegramChatId,
              text: strings.privacyDeleteUnauthorized,
            });
            return;
          }
          throw error;
        }
        return;
      }
      if (command?.name === 'privacy') {
        await messenger.sendGroupMessage?.({
          telegramChatId: String(message.chat.id),
          text: strings.groupPrivacyInfo,
        });
        return;
      }
      if (message.reply_to_message && input.database && input.callbackSigningSecret) {
        const editSessions = createSuggestionEditSessionService(input.database);
        const session = await editSessions.findActiveForGroupReply({
          instructionTelegramMessageId: String(message.reply_to_message.message_id),
          telegramChatId: String(message.chat.id),
          telegramUserId: message.from.id,
        });
        if (session) {
          try {
            const patch = parseSuggestionEditInput(message.text);
            await createAuthorizeSuggestionAction(
              input.database,
              messenger.isCurrentChatAdmin ?? (() => Promise.resolve(false)),
            )({
              actor: { firstName: message.from.first_name, telegramUserId: message.from.id },
              suggestionId: session.suggestionId,
              telegramChatId: String(message.chat.id),
            });
            const updated = await editSessions.apply({
              actorUserId: session.actorUserId,
              patch,
              suggestionId: session.suggestionId,
            });
            const callbacks = await createCallbackTokenService(input.database).issueSuggestionCallbacks({
              actions: ['confirm', 'edit', 'reject'],
              suggestionId: updated.id,
            });
            if (!callbacks.confirm || !callbacks.edit || !callbacks.reject) {
              throw new Error('Suggestion callback nonce creation was incomplete');
            }
            const card = renderSuggestion(
              normalizeLocale(updated.language),
              updated,
              { confirm: callbacks.confirm, edit: callbacks.edit, reject: callbacks.reject },
              input.callbackSigningSecret,
            );
            await messenger.sendSuggestionReply({
              ...card,
              replyToTelegramMessageId: String(message.reply_to_message.message_id),
              telegramChatId: String(message.chat.id),
            });
            input.logger?.info('suggestion_group_edit_applied', {
              suggestionId: updated.id,
              telegramChatId: String(message.chat.id),
              telegramUserId: String(message.from.id),
              result: 'success',
            });
          } catch (error: unknown) {
            if (error instanceof SuggestionEditSessionError || error instanceof SuggestionActionAuthorizationError) {
              await messenger.sendGroupMessage?.({
                telegramChatId: String(message.chat.id),
                text: strings.editFailed,
              });
              return;
            }
            throw error;
          }
          return;
        }
      }
      if (command?.name === 'keep') {
        const source = message.reply_to_message;
        if (!source || source.from.is_bot || !input.analyzeGroupMessage) {
          await messenger.sendGroupMessage?.({
            telegramChatId: String(message.chat.id),
            text: strings.keepUsage,
          });
          return;
        }
        await input.analyzeGroupMessage({
          author: {
            firstName: source.from.first_name,
            telegramUserId: source.from.id,
            ...(source.from.last_name ? { lastName: source.from.last_name } : {}),
            ...(source.from.username ? { username: source.from.username } : {}),
          },
          messenger,
          sentAt: new Date(source.date * 1_000),
          telegramChatId: String(message.chat.id),
          telegramMessageId: String(source.message_id),
          manualCapture: true,
          text: source.text,
        });
        return;
      }
      if ((command?.name === 'invite' || command?.name === 'notifications') && input.onboarding) {
        const isAdmin = await (messenger.isCurrentChatAdmin ?? (() => Promise.resolve(false)))({
          telegramChatId: String(message.chat.id),
          telegramUserId: message.from.id,
        });
        if (!isAdmin) {
          await messenger.sendGroupMessage?.({
            telegramChatId: String(message.chat.id),
            text: strings.notificationsAdminOnly,
          });
          return;
        }
        const chat = await input.onboarding.findActiveChatByTelegramChatId(String(message.chat.id));
        if (!chat) {
          return;
        }
        if (command.name === 'invite') {
          const onboardingDeepLink = await input.onboarding.createOnboardingLink(chat.id);
          await messenger.sendOnboardingCard({
            buttonText: strings.onboardingButton,
            onboardingDeepLink,
            telegramChatId: chat.telegramChatId,
            text: renderOnboardingCard(locale),
          });
          return;
        }
        const status = await input.onboarding.notificationStatusForPrivateUser({
          chatId: chat.id,
          telegramUserId: String(message.from.id),
        });
        if (!status) {
          await messenger.sendGroupMessage?.({
            telegramChatId: chat.telegramChatId,
            text: strings.notificationStatusPrivateChatRequired,
          });
          return;
        }
        await messenger.sendPrivateMessage?.({
          telegramUserId: message.from.id,
          text: renderNotificationStatus(locale, status),
        });
        await messenger.sendGroupMessage?.({
          telegramChatId: chat.telegramChatId,
          text: strings.notificationStatusSent,
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

    const memberLocale = normalizeLocale(memberUpdate.from.language_code);
    await messenger.sendOnboardingCard({
      buttonText: t(memberLocale).onboardingButton,
      onboardingDeepLink: `https://t.me/${input.botUsername}?start=join_${invitation.onboardingToken}`,
      telegramChatId: invitation.telegramChatId,
      text: renderOnboardingCard(memberLocale),
    });
    await input.onboardingInvitations.markOnboardingMessageSent(invitation);
  };
}
