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
import {
  onboardingHelpText,
  onboardingTokenUnavailableText,
  renderOnboardingConnected,
} from '../messages.js';
import type { TelegramUpdate } from '../bot.js';

const privateMessageSchema = z
  .object({
    message: z.object({
      chat: z.object({ id: z.number().int(), type: z.literal('private') }),
      from: z.object({ first_name: z.string().min(1), id: z.number().int(), is_bot: z.boolean() }),
      text: z.string().min(1),
    }),
  })
  .passthrough();

export type PrivateMessenger = Readonly<{
  isCurrentChatAdmin?: CurrentChatAdminChecker;
  sendPrivateMessage: (input: Readonly<{ telegramUserId: number; text: string }>) => Promise<void>;
}>;

export type PrivateUpdateHandler = (update: TelegramUpdate, messenger: PrivateMessenger) => Promise<void>;

export function createPrivateUpdateHandler<TQueryResult extends PgQueryResultHKT>(input: Readonly<{
  database: RepositoryDatabase<TQueryResult>;
  isCurrentChatAdmin?: CurrentChatAdminChecker;
  logger?: Logger;
  onboarding?: OnboardingService;
}>): PrivateUpdateHandler {
  const editSessions = createSuggestionEditSessionService(input.database);
  return async (update, messenger) => {
    const parsed = privateMessageSchema.safeParse(update.payload);
    if (!parsed.success || parsed.data.message.from.is_bot) {
      return;
    }
    const message = parsed.data.message;
    const startMatch = /^\/start(?:\s+(.+))?$/i.exec(message.text.trim());
    if (startMatch) {
      const joinMatch = /^join_([A-Za-z0-9_-]+)$/.exec(startMatch[1] ?? '');
      if (!joinMatch || !input.onboarding) {
        await messenger.sendPrivateMessage({ telegramUserId: message.from.id, text: onboardingHelpText });
        return;
      }
      try {
        const membership = await input.onboarding.redeemOnboardingToken({
          telegramUserId: String(message.from.id),
          token: joinMatch[1]!,
        });
        await messenger.sendPrivateMessage({
          telegramUserId: message.from.id,
          text: renderOnboardingConnected(membership.chatTitle),
        });
        input.logger?.info('onboarding_completed', {
          telegramUserId: String(message.from.id),
          workspaceId: membership.workspaceId,
          result: 'success',
        });
      } catch (error: unknown) {
        if (error instanceof OnboardingError) {
          await messenger.sendPrivateMessage({ telegramUserId: message.from.id, text: onboardingTokenUnavailableText });
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
    const session = await editSessions.findActiveForTelegramUser(message.from.id);
    if (!session) {
      const reschedules = createCommitmentRescheduleService(
        input.database,
        input.isCurrentChatAdmin ?? messenger.isCurrentChatAdmin ?? (() => Promise.resolve(false)),
      );
      if (!(await reschedules.hasActive(message.from.id))) {
        return;
      }
      const dueMatch = /^due:\s*(.+)$/i.exec(message.text.trim());
      if (!dueMatch?.[1]) {
        await messenger.sendPrivateMessage({
          telegramUserId: message.from.id,
          text: 'Укажите новый срок в формате due: <срок>.',
        });
        return;
      }
      try {
        await reschedules.apply({
          actor: { firstName: message.from.first_name, telegramUserId: message.from.id },
          dueDateText: dueMatch[1],
        });
        await messenger.sendPrivateMessage({ telegramUserId: message.from.id, text: 'Новый срок сохранён.' });
      } catch (error: unknown) {
        if (error instanceof CommitmentRescheduleError) {
          await messenger.sendPrivateMessage({
            telegramUserId: message.from.id,
            text: 'Не удалось перенести срок. Откройте карточку заново.',
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
        text: 'Изменения сохранены. Подтвердите карточку в группе.',
      });
      input.logger?.info('commitment_updated', { telegramUserId: String(message.from.id), result: 'success' });
    } catch (error: unknown) {
      if (
        error instanceof SuggestionEditSessionError ||
        error instanceof SuggestionActionAuthorizationError
      ) {
        await messenger.sendPrivateMessage({
          telegramUserId: message.from.id,
          text: 'Не удалось применить изменения. Откройте карточку заново.',
        });
        return;
      }
      throw error;
    }
  };
}
