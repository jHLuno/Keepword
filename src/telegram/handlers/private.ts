import { z } from 'zod';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type { Logger } from '../../observability/logger.js';
import type { RepositoryDatabase } from '../../repositories/database.js';
import {
  createAuthorizeSuggestionAction,
  type CurrentChatAdminChecker,
  SuggestionActionAuthorizationError,
} from '../../services/authorize-action.js';
import {
  createSuggestionEditSessionService,
  parseSuggestionEditInput,
  SuggestionEditSessionError,
} from '../../services/suggestion-edit-sessions.js';
import {
  createCommitmentRescheduleService,
  CommitmentRescheduleError,
} from '../../services/commitment-reschedule-sessions.js';
import { OnboardingError, type OnboardingService } from '../../services/onboarding.js';
import type { ManualCapture } from '../../services/manual-capture.js';
import {
  renderOnboardingConnected,
  renderOnboardingHelp,
  renderOnboardingTokenUnavailable,
  t,
} from '../messages.js';
import { normalizeLocale } from '../../i18n/index.js';
import type { InlineKeyboardMarkup } from '../messages.js';
import type { TelegramUpdate } from '../bot.js';
import { createPrivateCommandHandler, parseTelegramCommand } from './commands.js';

const privateMessageSchema = z
  .object({
    message: z.object({
      chat: z.object({ id: z.number().int(), type: z.literal('private') }),
      date: z.number().int().nonnegative().optional(),
      forward_from_chat: z.object({ id: z.number().int() }).optional(),
      forward_origin: z.object({
        chat: z.object({ id: z.number().int() }).optional(),
        type: z.string(),
      }).passthrough().optional(),
      from: z.object({ first_name: z.string().min(1), id: z.number().int(), is_bot: z.boolean(), language_code: z.string().optional() }),
      message_id: z.number().int().nonnegative(),
      text: z.string().min(1),
    }),
  })
  .passthrough();

export type PrivateMessenger = Readonly<{
  isCurrentChatAdmin?: CurrentChatAdminChecker;
  sendPrivateMessage: (input: Readonly<{
    replyMarkup?: InlineKeyboardMarkup;
    replyToTelegramMessageId?: string;
    telegramUserId: number;
    text: string;
  }>) => Promise<void>;
}>;

export type PrivateUpdateHandler = (update: TelegramUpdate, messenger: PrivateMessenger) => Promise<void>;

export function createPrivateUpdateHandler<TQueryResult extends PgQueryResultHKT>(input: Readonly<{
  callbackSigningSecret?: string;
  database: RepositoryDatabase<TQueryResult>;
  isCurrentChatAdmin?: CurrentChatAdminChecker;
  logger?: Logger;
  manualCapture?: ManualCapture;
  onboarding?: OnboardingService;
}>): PrivateUpdateHandler {
  const editSessions = createSuggestionEditSessionService(input.database);
  const commands = createPrivateCommandHandler(input.database, input.callbackSigningSecret);
  return async (update, messenger) => {
    const parsed = privateMessageSchema.safeParse(update.payload);
    if (!parsed.success || parsed.data.message.from.is_bot) {
      return;
    }
    const message = parsed.data.message;
    const locale = normalizeLocale(message.from.language_code);
    const strings = t(locale);
    const command = parseTelegramCommand(message.text);
    const startMatch = /^\/start(?:\s+(.+))?$/i.exec(message.text.trim());
    if (startMatch) {
      const joinMatch = /^join_([A-Za-z0-9_-]+)$/.exec(startMatch[1] ?? '');
      if (!joinMatch || !input.onboarding) {
        await messenger.sendPrivateMessage({ telegramUserId: message.from.id, text: renderOnboardingHelp(locale) });
        return;
      }
      try {
        const membership = await input.onboarding.redeemOnboardingToken({
          telegramUserId: String(message.from.id),
          token: joinMatch[1]!,
        });
        await messenger.sendPrivateMessage({
          telegramUserId: message.from.id,
          text: renderOnboardingConnected(locale, membership.chatTitle),
        });
        input.logger?.info('onboarding_completed', {
          telegramUserId: String(message.from.id),
          workspaceId: membership.workspaceId,
          result: 'success',
        });
      } catch (error: unknown) {
        if (error instanceof OnboardingError) {
          await messenger.sendPrivateMessage({ telegramUserId: message.from.id, text: renderOnboardingTokenUnavailable(locale) });
          input.logger?.info('onboarding_completed', {
            errorCode: error.code,
            telegramUserId: String(message.from.id),
            result: 'failure',
          });
          return;
        }
        throw error;
      }
      return;
    }
    if (command) {
      const result = await commands.handle({ command, languageCode: message.from.language_code, telegramUserId: message.from.id });
      if (result.handled) {
        await messenger.sendPrivateMessage({
          ...(result.replyMarkup ? { replyMarkup: result.replyMarkup } : {}),
          telegramUserId: message.from.id,
          text: result.text ?? renderOnboardingHelp(locale),
        });
        return;
      }
    }
    const session = await editSessions.findActiveForTelegramUser(message.from.id);
    if (!session) {
      const reschedules = createCommitmentRescheduleService(
        input.database,
        input.isCurrentChatAdmin ?? messenger.isCurrentChatAdmin ?? (() => Promise.resolve(false)),
      );
      if (!(await reschedules.hasActive(message.from.id))) {
        if (input.manualCapture) {
          const forwardChat = message.forward_origin?.chat ?? message.forward_from_chat;
          const result = await input.manualCapture.capturePrivateMessage({
            messenger: { sendPrivateSuggestion: (suggestion) => messenger.sendPrivateMessage(suggestion) },
            sender: { firstName: message.from.first_name, telegramUserId: message.from.id },
            sentAt: new Date((message.date ?? Math.floor(Date.now() / 1_000)) * 1_000),
            ...(forwardChat
              ? { telegramChatId: String(forwardChat.id) }
              : {}),
            telegramMessageId: String(message.message_id),
            text: message.text,
          });
          if (result.status === 'unavailable') {
            await messenger.sendPrivateMessage({
              telegramUserId: message.from.id,
              text: strings.manualCaptureConnectFirst,
            });
          }
        }
        return;
      }
      const dueMatch = /^due:\s*(.+)$/i.exec(message.text.trim());
      if (!dueMatch?.[1]) {
        await messenger.sendPrivateMessage({
          telegramUserId: message.from.id,
          text: strings.rescheduleUsage,
        });
        return;
      }
      try {
        await reschedules.apply({
          actor: { firstName: message.from.first_name, telegramUserId: message.from.id },
          dueDateText: dueMatch[1],
        });
        await messenger.sendPrivateMessage({ telegramUserId: message.from.id, text: strings.rescheduleSaved });
      } catch (error: unknown) {
        if (error instanceof CommitmentRescheduleError) {
          await messenger.sendPrivateMessage({
            telegramUserId: message.from.id,
            text: strings.rescheduleFailed,
          });
          return;
        }
        throw error;
      }
      return;
    }
    try {
      const patch = parseSuggestionEditInput(message.text);
      const authorize = createAuthorizeSuggestionAction(
        input.database,
        input.isCurrentChatAdmin ?? messenger.isCurrentChatAdmin ?? (() => Promise.resolve(false)),
      );
      await authorize({
        actor: { firstName: message.from.first_name, telegramUserId: message.from.id },
        suggestionId: session.suggestionId,
        telegramChatId: session.telegramChatId,
      });
      await editSessions.apply({
        actorUserId: session.actorUserId,
        patch,
        suggestionId: session.suggestionId,
      });
      await messenger.sendPrivateMessage({
        telegramUserId: message.from.id,
        text: strings.editSaved,
      });
      input.logger?.info('commitment_updated', { telegramUserId: String(message.from.id), result: 'success' });
    } catch (error: unknown) {
      if (
        error instanceof SuggestionEditSessionError ||
        error instanceof SuggestionActionAuthorizationError
      ) {
        await messenger.sendPrivateMessage({
          telegramUserId: message.from.id,
          text: strings.editFailed,
        });
        return;
      }
      throw error;
    }
  };
}
