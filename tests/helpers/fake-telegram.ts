import type { TelegramAdapter, TelegramAdapterFactory, TelegramUpdate } from '../../src/telegram/bot.js';
import type { GroupMessenger, GroupUpdateHandler } from '../../src/telegram/handlers/group.js';

export type RecordedOnboardingCard = Readonly<{
  onboardingDeepLink: string;
  telegramChatId: string;
  text: string;
}>;

export type FakeTelegram = Readonly<{
  handledUpdateIds: readonly number[];
  onboardingCards: readonly RecordedOnboardingCard[];
  telegramAdapterFactory: TelegramAdapterFactory;
}>;

export type FakeTelegramOptions = Readonly<{
  failuresBeforeSuccess?: number;
}>;

export function createFakeTelegram(options: FakeTelegramOptions = {}): FakeTelegram {
  const handledUpdateIds: number[] = [];
  const onboardingCards: RecordedOnboardingCard[] = [];
  let remainingFailures = options.failuresBeforeSuccess ?? 0;

  const messenger: GroupMessenger = {
    sendOnboardingCard(card) {
      onboardingCards.push(card);
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

  return { handledUpdateIds, onboardingCards, telegramAdapterFactory };
}
