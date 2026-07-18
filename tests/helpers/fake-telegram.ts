import type { TelegramAdapter, TelegramAdapterFactory, TelegramUpdate } from '../../src/telegram/bot.js';
import type { CallbackMessenger } from '../../src/telegram/handlers/callback.js';
import type { PrivateMessenger, PrivateUpdateHandler } from '../../src/telegram/handlers/private.js';
import type { GroupMessenger, GroupUpdateHandler } from '../../src/telegram/handlers/group.js';
import type { ClarificationRequest, SuggestionReply } from '../../src/services/analyze-message.js';
import type { InlineKeyboardMarkup } from '../../src/telegram/messages.js';

export type RecordedOnboardingCard = Readonly<{
  onboardingDeepLink: string;
  telegramChatId: string;
  text: string;
}>;

export type FakeTelegram = Readonly<{
  callbackAnswers: readonly string[];
  clarificationRequests: readonly ClarificationRequest[];
  handledUpdateIds: readonly number[];
  groupMessages: readonly string[];
  notificationInvites: readonly RecordedOnboardingCard[];
  onboardingCards: readonly RecordedOnboardingCard[];
  privateMessages: readonly string[];
  privateMessagesFor: (telegramUserId: number) => readonly string[];
  sendPrivateMessage: (input: Readonly<{ telegramUserId: number; text: string }>) => Promise<void>;
  privateSuggestionReplies: readonly Readonly<{
    replyMarkup: InlineKeyboardMarkup;
    replyToTelegramMessageId: string;
    telegramUserId: number;
    text: string;
  }>[];
  suggestionReplies: readonly SuggestionReply[];
  telegramAdapterFactory: TelegramAdapterFactory;
}>;

export type FakeTelegramOptions = Readonly<{
  currentAdminTelegramUserIds?: readonly number[];
  failureErrorCode?: string;
  failuresBeforeSuccess?: number;
  onboardingCardFailuresBeforeSuccess?: number;
}>;

export function createFakeTelegram(options: FakeTelegramOptions = {}): FakeTelegram {
  const callbackAnswers: string[] = [];
  const handledUpdateIds: number[] = [];
  const groupMessages: string[] = [];
  const notificationInvites: RecordedOnboardingCard[] = [];
  const onboardingCards: RecordedOnboardingCard[] = [];
  const privateMessages: string[] = [];
  const privateMessagesByUserId = new Map<number, string[]>();
  const privateSuggestionReplies: Array<{
    replyMarkup: InlineKeyboardMarkup;
    replyToTelegramMessageId: string;
    telegramUserId: number;
    text: string;
  }> = [];
  const clarificationRequests: ClarificationRequest[] = [];
  const suggestionReplies: SuggestionReply[] = [];
  let remainingOnboardingCardFailures = options.onboardingCardFailuresBeforeSuccess ?? 0;
  let remainingFailures = options.failuresBeforeSuccess ?? 0;

  function recordPrivateMessage(input: Readonly<{ telegramUserId: number; text: string }>): void {
    privateMessages.push(input.text);
    const messagesForUser = privateMessagesByUserId.get(input.telegramUserId) ?? [];
    messagesForUser.push(input.text);
    privateMessagesByUserId.set(input.telegramUserId, messagesForUser);
  }

  const messenger: GroupMessenger = {
    isCurrentChatAdmin({ telegramUserId }) {
      return Promise.resolve(options.currentAdminTelegramUserIds?.includes(telegramUserId) ?? false);
    },
    sendClarificationRequest(request) {
      clarificationRequests.push(request);
      return Promise.resolve();
    },

    sendOnboardingCard(card) {
      if (remainingOnboardingCardFailures > 0) {
        remainingOnboardingCardFailures -= 1;
        return Promise.reject(new Error('Fake onboarding card delivery failed'));
      }
      onboardingCards.push(card);
      return Promise.resolve();
    },

    sendNotificationInvite(invite) {
      notificationInvites.push(invite);
      return Promise.resolve();
    },

    sendGroupMessage({ text }) {
      groupMessages.push(text);
      return Promise.resolve();
    },

    sendSuggestionReply(reply) {
      suggestionReplies.push(reply);
      return Promise.resolve();
    },
  };

  const callbackMessenger: CallbackMessenger = {
    answerCallbackQuery(input) {
      callbackAnswers.push(input.text);
      return Promise.resolve();
    },

    isCurrentChatAdmin({ telegramUserId }) {
      return Promise.resolve(options.currentAdminTelegramUserIds?.includes(telegramUserId) ?? false);
    },
  };

  const privateMessenger: PrivateMessenger = {
    isCurrentChatAdmin({ telegramUserId }) {
      return Promise.resolve(options.currentAdminTelegramUserIds?.includes(telegramUserId) ?? false);
    },

    sendPrivateMessage(input) {
      const { text } = input;
      recordPrivateMessage(input);
      if (input.replyMarkup && input.replyToTelegramMessageId) {
        privateSuggestionReplies.push({
          replyMarkup: input.replyMarkup,
          replyToTelegramMessageId: input.replyToTelegramMessageId,
          telegramUserId: input.telegramUserId,
          text,
        });
      }
      return Promise.resolve();
    },
  };

  const telegramAdapterFactory: TelegramAdapterFactory = (
    groupUpdateHandler: GroupUpdateHandler,
    callbackUpdateHandler,
    privateUpdateHandler: PrivateUpdateHandler | undefined,
  ): TelegramAdapter => ({
    async handleUpdate(update: TelegramUpdate) {
      handledUpdateIds.push(update.updateId);
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        throw Object.assign(new Error('Fake Telegram adapter failed'), { code: options.failureErrorCode });
      }
      if (callbackUpdateHandler && isCallbackUpdate(update.payload)) {
        await callbackUpdateHandler(update, callbackMessenger);
        return;
      }
      if (privateUpdateHandler && isPrivateMessageUpdate(update.payload)) {
        await privateUpdateHandler(update, privateMessenger);
        return;
      }
      await groupUpdateHandler(update, messenger);
    },
  });

  return {
    callbackAnswers,
    clarificationRequests,
    handledUpdateIds,
    groupMessages,
    notificationInvites,
    onboardingCards,
    privateMessages,
    privateMessagesFor(telegramUserId) {
      return privateMessagesByUserId.get(telegramUserId) ?? [];
    },
    sendPrivateMessage(input) {
      recordPrivateMessage(input);
      return Promise.resolve();
    },
    privateSuggestionReplies,
    suggestionReplies,
    telegramAdapterFactory,
  };
}

function isCallbackUpdate(payload: unknown): boolean {
  return typeof payload === 'object' && payload !== null && 'callback_query' in payload;
}

function isPrivateMessageUpdate(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null || !('message' in payload)) {
    return false;
  }
  const message = payload.message;
  if (typeof message !== 'object' || message === null || !('chat' in message)) {
    return false;
  }
  const chat = message.chat;
  return typeof chat === 'object' && chat !== null && 'type' in chat && chat.type === 'private';
}
