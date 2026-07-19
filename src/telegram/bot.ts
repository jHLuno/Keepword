import { Bot, type Context } from 'grammy';
import type { Update } from 'grammy/types';
import { autoRetry } from '@grammyjs/auto-retry';
import { apiThrottler } from '@grammyjs/transformer-throttler';

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
          inline_keyboard: [[{ text: card.buttonText, url: card.onboardingDeepLink }]],
        },
      });
    },

    async sendNotificationInvite(invite) {
      await context.api.sendMessage(Number(invite.telegramChatId), invite.text, {
        reply_markup: {
          inline_keyboard: [[{ text: invite.buttonText, url: invite.onboardingDeepLink }]],
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

    async editPrivateCheckMessage(input) {
      await context.api.editMessageText(Number(input.telegramChatId), Number(input.telegramMessageId), input.text, {
        ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
      });
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
      await context.api.sendMessage(input.telegramUserId, input.text, {
        ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
        ...(input.replyToTelegramMessageId ? { reply_parameters: { message_id: Number(input.replyToTelegramMessageId) } } : {}),
      });
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
  // Respect Telegram's global (~30 msg/s) and per-chat rate limits: the
  // throttler queues outgoing API calls, and auto-retry honours 429
  // `retry_after` so bursts of reminders or digests are never dropped.
  bot.api.config.use(apiThrottler());
  bot.api.config.use(autoRetry({ maxDelaySeconds: 60, maxRetryAttempts: 5 }));
  let initialization: Promise<void> | undefined;

  function initialize(): Promise<void> {
    initialization ??= bot.init();
    return initialization;
  }

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
      await initialize();
      await bot.handleUpdate(update.payload as Update);
    },
  };
}
