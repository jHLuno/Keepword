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

export function createFakeTelegram(): FakeTelegram {
  const handledUpdateIds: number[] = [];
  const onboardingCards: RecordedOnboardingCard[] = [];

  const messenger: GroupMessenger = {
    sendOnboardingCard(card) {
      onboardingCards.push(card);
      return Promise.resolve();
    },
  };

  const telegramAdapterFactory: TelegramAdapterFactory = (groupUpdateHandler: GroupUpdateHandler): TelegramAdapter => ({
    async handleUpdate(update: TelegramUpdate) {
      handledUpdateIds.push(update.updateId);
      await groupUpdateHandler(update, messenger);
    },
  });

  return { handledUpdateIds, onboardingCards, telegramAdapterFactory };
}
