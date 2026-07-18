import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { chatMemberships, chats, users } from '../../db/schema.js';
import type { Logger } from '../../observability/logger.js';
import type { RepositoryDatabase } from '../../repositories/database.js';
import {
  createAuthorizeSuggestionAction,
  type CurrentChatAdminChecker,
  SuggestionActionAuthorizationError,
} from '../../services/authorize-action.js';
import {
  createConfirmSuggestion,
  createRejectSuggestion,
  SuggestionActionError,
} from '../../services/confirm-suggestion.js';
import { createCallbackTokenService, CallbackTokenError } from '../../services/callback-tokens.js';
import { createSuggestionEditSessionService } from '../../services/suggestion-edit-sessions.js';
import { createAuthorizedCommitmentAction, CommitmentUpdateError } from '../../services/update-commitment.js';
import { createCommitmentRescheduleService, CommitmentRescheduleError } from '../../services/commitment-reschedule-sessions.js';
import { CallbackDataError, parseSignedCallbackData } from '../callback-data.js';
import type { TelegramUpdate } from '../bot.js';

const callbackUpdateSchema = z
  .object({
    callback_query: z.object({
      data: z.string().max(64).optional(),
      from: z.object({
        first_name: z.string().min(1),
        id: z.number().int(),
      }),
      id: z.string().min(1),
      message: z.object({
        chat: z.object({ id: z.number().int(), type: z.enum(['group', 'supergroup']) }),
      }),
    }),
  })
  .passthrough();

export type CallbackMessenger = Readonly<{
  answerCallbackQuery: (input: Readonly<{ callbackQueryId: string; text: string }>) => Promise<void>;
  isCurrentChatAdmin?: CurrentChatAdminChecker;
  sendPrivateEditPrompt?: (input: Readonly<{ telegramUserId: number }>) => Promise<void>;
  sendActionFeedback?: (input: Readonly<{ telegramChatId: string; text: string }>) => Promise<void>;
}>;

export type CommitmentActionCallbackHandler = (
  update: TelegramUpdate,
  messenger: CallbackMessenger,
) => Promise<void>;

const unavailableText = 'Действие недоступно.';
const unauthorizedText = 'У вас нет прав на это действие.';

export function createCommitmentActionCallbackHandler<TQueryResult extends PgQueryResultHKT>(input: Readonly<{
  callbackSigningSecret: string;
  database: RepositoryDatabase<TQueryResult>;
  isCurrentChatAdmin?: CurrentChatAdminChecker;
  logger?: Logger;
}>): CommitmentActionCallbackHandler {
  return async (update, messenger) => {
    const parsedUpdate = callbackUpdateSchema.safeParse(update.payload);
    if (!parsedUpdate.success) {
      return;
    }
    const callback = parsedUpdate.data.callback_query;
    const telegramChatId = String(callback.message.chat.id);
    const telegramUserId = callback.from.id;
    try {
      const signedCallback = parseSignedCallbackData(callback.data, input.callbackSigningSecret);
      const resolvedCallback = await createCallbackTokenService(input.database).claim(signedCallback);
      const currentAdminChecker = input.isCurrentChatAdmin ?? messenger.isCurrentChatAdmin ?? (() => Promise.resolve(false));
      if (resolvedCallback.kind === 'commitment') {
        if (signedCallback.action === 'reschedule') {
          await createCommitmentRescheduleService(input.database, currentAdminChecker).begin({
            actorTelegramUserId: telegramUserId,
            commitmentId: resolvedCallback.commitmentId,
            telegramChatId,
          });
          await messenger.answerCallbackQuery({
            callbackQueryId: callback.id,
            text: 'Откройте личный чат с Keepword и отправьте новую строку due: <срок>.',
          });
          return;
        }
        if (
          signedCallback.action !== 'block' &&
          signedCallback.action !== 'cancel' &&
          signedCallback.action !== 'complete' &&
          signedCallback.action !== 'open'
        ) {
          throw new CallbackDataError();
        }
        await createAuthorizedCommitmentAction(input.database, currentAdminChecker)({
          action: signedCallback.action,
          actor: { firstName: callback.from.first_name, telegramUserId },
          commitmentId: resolvedCallback.commitmentId,
          telegramChatId,
        });
        await messenger.answerCallbackQuery({ callbackQueryId: callback.id, text: 'Статус задачи обновлён.' });
        input.logger?.info('commitment_updated', {
          telegramChatId,
          telegramUserId: String(telegramUserId),
          result: 'success',
        });
        return;
      }
      if (signedCallback.action === 'edit') {
        const authorize = createAuthorizeSuggestionAction(
          input.database,
          currentAdminChecker,
        );
        await authorize({
          actor: { firstName: callback.from.first_name, telegramUserId },
          suggestionId: resolvedCallback.suggestionId,
          telegramChatId,
        });
        const scopedActor = await input.database
          .select({ userId: chatMemberships.userId })
          .from(chatMemberships)
          .innerJoin(users, eq(chatMemberships.userId, users.id))
          .innerJoin(
            chats,
            and(
              eq(chatMemberships.chatId, chats.id),
              eq(chatMemberships.workspaceId, chats.workspaceId),
            ),
          )
          .where(and(eq(users.telegramUserId, telegramUserId), eq(chats.telegramChatId, callback.message.chat.id)))
          .limit(1);
        const actor = scopedActor[0];
        if (!actor) {
          throw new Error('Authorized edit actor could not be scoped');
        }
        await createSuggestionEditSessionService(input.database).begin({
          actorUserId: actor.userId,
          suggestionId: resolvedCallback.suggestionId,
        });
        await messenger.answerCallbackQuery({
          callbackQueryId: callback.id,
          text: 'Откройте личный чат с Keepword и отправьте поля title, description или due.',
        });
        await messenger.sendPrivateEditPrompt?.({ telegramUserId });
        return;
      }
      if (signedCallback.action !== 'confirm' && signedCallback.action !== 'reject') {
        throw new CallbackDataError();
      }

      const authorize = createAuthorizeSuggestionAction(
        input.database,
        currentAdminChecker,
      );
      await authorize({
        actor: { firstName: callback.from.first_name, telegramUserId },
        suggestionId: resolvedCallback.suggestionId,
        telegramChatId,
      });
      const scopedActors = await input.database
        .select({ userId: chatMemberships.userId })
        .from(chatMemberships)
        .innerJoin(users, eq(chatMemberships.userId, users.id))
        .innerJoin(
          chats,
          and(
            eq(chatMemberships.chatId, chats.id),
            eq(chatMemberships.workspaceId, chats.workspaceId),
          ),
        )
        .where(and(eq(users.telegramUserId, telegramUserId), eq(chats.telegramChatId, callback.message.chat.id)))
        .limit(1);
      const scopedActor = scopedActors[0];
      if (!scopedActor) {
        throw new Error('Authorized callback actor could not be scoped');
      }

      if (signedCallback.action === 'confirm') {
        await createConfirmSuggestion(input.database)({
          confirmedByUserId: scopedActor.userId,
          suggestionId: resolvedCallback.suggestionId,
        });
        await messenger.answerCallbackQuery({ callbackQueryId: callback.id, text: 'Договорённость сохранена.' });
        await messenger.sendActionFeedback?.({ telegramChatId, text: '✅ Договорённость сохранена.' });
        input.logger?.info('commitment_confirmed', {
          telegramChatId,
          telegramUserId: String(telegramUserId),
          result: 'success',
        });
        return;
      }

      await createRejectSuggestion(input.database)({ suggestionId: resolvedCallback.suggestionId });
      await messenger.answerCallbackQuery({ callbackQueryId: callback.id, text: 'Договорённость не будет сохранена.' });
      await messenger.sendActionFeedback?.({ telegramChatId, text: 'Договорённость не будет сохранена.' });
      input.logger?.info('commitment_rejected', {
        telegramChatId,
        telegramUserId: String(telegramUserId),
        result: 'success',
      });
    } catch (error: unknown) {
      const isUnauthorized =
        (error instanceof SuggestionActionAuthorizationError && error.code === 'UNAUTHORIZED') ||
        (error instanceof CommitmentUpdateError && error.code === 'UNAUTHORIZED');
      const isExpectedUnavailable =
        error instanceof CallbackDataError ||
        error instanceof CallbackTokenError ||
        error instanceof SuggestionActionError ||
        error instanceof CommitmentUpdateError ||
        error instanceof CommitmentRescheduleError ||
        (error instanceof SuggestionActionAuthorizationError && error.code === 'SUGGESTION_UNAVAILABLE');
      if (isUnauthorized || isExpectedUnavailable) {
        await messenger.answerCallbackQuery({
          callbackQueryId: callback.id,
          text: isUnauthorized ? unauthorizedText : unavailableText,
        });
        input.logger?.info('authorization_denied', {
          errorCode: isUnauthorized ? 'UNAUTHORIZED_CALLBACK_ACTION' : 'INVALID_OR_REPLAYED_CALLBACK_ACTION',
          telegramChatId,
          telegramUserId: String(telegramUserId),
          result: 'failure',
        });
        return;
      }
      throw error;
    }
  };
}
