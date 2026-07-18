import { Bot, type Context } from 'grammy';
import type { Update } from 'grammy/types';

import type { GroupMessenger, GroupUpdateHandler, OnboardingCard } from './handlers/group.js';

export type TelegramUpdate = Readonly<{
  payload: unknown;
  updateId: number;
}>;

export type TelegramAdapter = Readonly<{
  handleUpdate: (update: TelegramUpdate) => Promise<void>;
}>;

export type TelegramAdapterFactory = (groupUpdateHandler: GroupUpdateHandler) => TelegramAdapter;

function createGrammYMessenger(context: Context): GroupMessenger {
  return {
    async sendClarificationRequest(request) {
      await context.api.sendMessage(Number(request.telegramChatId), request.text, {
        reply_parameters: { message_id: Number(request.replyToTelegramMessageId) },
      });
    },

    async sendOnboardingCard(card: OnboardingCard) {
      await context.api.sendMessage(Number(card.telegramChatId), card.text, {
        reply_markup: {
          inline_keyboard: [[{ text: '🔔 Подключить уведомления', url: card.onboardingDeepLink }]],
        },
      });
    },

    async sendSuggestionReply(reply) {
      await context.api.sendMessage(Number(reply.telegramChatId), reply.text, {
        reply_markup: reply.replyMarkup,
        reply_parameters: { message_id: Number(reply.replyToTelegramMessageId) },
      });
    },
  };
}

export function createTelegramBot(input: Readonly<{
  groupUpdateHandler: GroupUpdateHandler;
  token: string;
}>): TelegramAdapter {
  const bot = new Bot<Context>(input.token);

  bot.on('my_chat_member', async (context) => {
    await input.groupUpdateHandler(
      { payload: context.update, updateId: context.update.update_id },
      createGrammYMessenger(context),
    );
  });

  bot.on('message', async (context) => {
    await input.groupUpdateHandler(
      { payload: context.update, updateId: context.update.update_id },
      createGrammYMessenger(context),
    );
  });

  return {
    async handleUpdate(update) {
      await bot.handleUpdate(update.payload as Update);
    },
  };
}
