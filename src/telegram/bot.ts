import { Bot, type Context } from 'grammy';
import type { Update } from 'grammy/types';

import type { GroupMessenger, GroupUpdateHandler, OnboardingCard } from './handlers/group.js';
import type { CallbackMessenger, CommitmentActionCallbackHandler } from './handlers/callback.js';
import type { PrivateMessenger, PrivateUpdateHandler } from './handlers/private.js';

export type TelegramUpdate = Readonly<{
  payload: unknown;
  updateId: number;
}>;

export type TelegramAdapter = Readonly<{
  handleUpdate: (update: TelegramUpdate) => Promise<void>;
}>;

export type TelegramAdapterFactory = (
  groupUpdateHandler: GroupUpdateHandler,
  callbackUpdateHandler?: CommitmentActionCallbackHandler,
  privateUpdateHandler?: PrivateUpdateHandler,
) => TelegramAdapter;

function createGrammYMessenger(context: Context): GroupMessenger {
  return {
    async isCurrentChatAdmin(input) {
      const member = await context.api.getChatMember(Number(input.telegramChatId), input.telegramUserId);
      return member.status === 'administrator' || member.status === 'creator';
    },

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

    async sendNotificationInvite(invite) {
      await context.api.sendMessage(Number(invite.telegramChatId), invite.text, {
        reply_markup: {
          inline_keyboard: [[{ text: 'Подключить уведомления', url: invite.onboardingDeepLink }]],
        },
      });
    },

    async sendGroupMessage(input) {
      await context.api.sendMessage(Number(input.telegramChatId), input.text);
    },

    async sendPrivateMessage(input) {
      await context.api.sendMessage(input.telegramUserId, input.text);
    },

    async sendSuggestionReply(reply) {
      await context.api.sendMessage(Number(reply.telegramChatId), reply.text, {
        reply_markup: reply.replyMarkup,
        reply_parameters: { message_id: Number(reply.replyToTelegramMessageId) },
      });
    },
  };
}

function createGrammYCallbackMessenger(context: Context): CallbackMessenger {
  return {
    async answerCallbackQuery(input) {
      await context.api.answerCallbackQuery(input.callbackQueryId, { text: input.text });
    },

    async isCurrentChatAdmin(input) {
      const member = await context.api.getChatMember(Number(input.telegramChatId), input.telegramUserId);
      return member.status === 'administrator' || member.status === 'creator';
    },

    async sendActionFeedback(input) {
      await context.api.sendMessage(Number(input.telegramChatId), input.text);
    },
  };
}

function createGrammYPrivateMessenger(context: Context): PrivateMessenger {
  return {
    async isCurrentChatAdmin(input) {
      const member = await context.api.getChatMember(Number(input.telegramChatId), input.telegramUserId);
      return member.status === 'administrator' || member.status === 'creator';
    },

    async sendPrivateMessage(input) {
      await context.api.sendMessage(input.telegramUserId, input.text);
    },
  };
}

export function createTelegramBot(input: Readonly<{
  callbackUpdateHandler?: CommitmentActionCallbackHandler;
  groupUpdateHandler: GroupUpdateHandler;
  privateUpdateHandler?: PrivateUpdateHandler;
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
    if (context.chat?.type === 'private' && input.privateUpdateHandler) {
      await input.privateUpdateHandler(
        { payload: context.update, updateId: context.update.update_id },
        createGrammYPrivateMessenger(context),
      );
      return;
    }
    await input.groupUpdateHandler(
      { payload: context.update, updateId: context.update.update_id },
      createGrammYMessenger(context),
    );
  });

  bot.on('callback_query', async (context) => {
    if (!input.callbackUpdateHandler) {
      return;
    }
    await input.callbackUpdateHandler(
      { payload: context.update, updateId: context.update.update_id },
      createGrammYCallbackMessenger(context),
    );
  });

  return {
    async handleUpdate(update) {
      await bot.handleUpdate(update.payload as Update);
    },
  };
}
