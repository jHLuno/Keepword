import type { TelegramAdapter, TelegramAdapterFactory, TelegramUpdate } from '../../src/telegram/bot.js';
import type { GroupMessenger, GroupUpdateHandler } from '../../src/telegram/handlers/group.js';
import type { ClarificationRequest, SuggestionReply } from '../../src/services/analyze-message.js';

export type RecordedOnboardingCard = Readonly<{
  onboardingDeepLink: string;
  telegramChatId: string;
  text: string;
}>;

export type FakeTelegram = Readonly<{
  clarificationRequests: readonly ClarificationRequest[];
  handledUpdateIds: readonly number[];
  onboardingCards: readonly RecordedOnboardingCard[];
  suggestionReplies: readonly SuggestionReply[];
  telegramAdapterFactory: TelegramAdapterFactory;
}>;

export type FakeTelegramOptions = Readonly<{
  failuresBeforeSuccess?: number;
  onboardingCardFailuresBeforeSuccess?: number;
}>;

export function createFakeTelegram(options: FakeTelegramOptions = {}): FakeTelegram {
  const handledUpdateIds: number[] = [];
  const onboardingCards: RecordedOnboardingCard[] = [];
  const clarificationRequests: ClarificationRequest[] = [];
  const suggestionReplies: SuggestionReply[] = [];
  let remainingOnboardingCardFailures = options.onboardingCardFailuresBeforeSuccess ?? 0;
  let remainingFailures = options.failuresBeforeSuccess ?? 0;

  const messenger: GroupMessenger = {
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

    sendSuggestionReply(reply) {
      suggestionReplies.push(reply);
      return Promise.resolve();
    },
  };

  const telegramAdapterFactory: TelegramAdapterFactory = (groupUpdateHandler: GroupUpdateHandler): TelegramAdapter => ({
    async handleUpdate(update: TelegramUpdate) {
      handledUpdateIds.push(update.updateId);
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        throw new Error('Fake Telegram adapter failed');
      }
      await groupUpdateHandler(update, messenger);
    },
  });

  return {
    clarificationRequests,
    handledUpdateIds,
    onboardingCards,
    suggestionReplies,
    telegramAdapterFactory,
  };
}
