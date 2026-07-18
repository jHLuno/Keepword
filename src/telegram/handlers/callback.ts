import { and, eq } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { chatMemberships, chats, commitments, commitmentSuggestions, users } from '../../db/schema.js';
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
import {
  createAuthorizedCommitmentAction,
  createAuthorizeCommitmentAction,
  CommitmentUpdateError,
} from '../../services/update-commitment.js';
import { createCommitmentRescheduleService, CommitmentRescheduleError } from '../../services/commitment-reschedule-sessions.js';
import { CallbackDataError, parseSignedCallbackData } from '../callback-data.js';
import type { TelegramUpdate } from '../bot.js';
import { createPrivateCommandHandler } from './commands.js';
import type { InlineKeyboardMarkup } from '../messages.js';

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
        chat: z.object({ id: z.number().int(), type: z.enum(['group', 'private', 'supergroup']) }),
        message_id: z.number().int().nonnegative().optional(),
      }),
    }),
  })
  .passthrough();

export type CallbackMessenger = Readonly<{
  answerCallbackQuery: (input: Readonly<{ callbackQueryId: string; text: string }>) => Promise<void>;
  isCurrentChatAdmin?: CurrentChatAdminChecker;
  editPrivateCheckMessage?: (input: Readonly<{
    replyMarkup?: InlineKeyboardMarkup;
    telegramChatId: string;
    telegramMessageId: string;
    text: string;
  }>) => Promise<void>;
  sendPrivateEditPrompt?: (input: Readonly<{ telegramUserId: number }>) => Promise<void>;
  sendActionFeedback?: (input: Readonly<{ telegramChatId: string; text: string }>) => Promise<void>;
}>;

export type CommitmentActionCallbackHandler = (
  update: TelegramUpdate,
  messenger: CallbackMessenger,
) => Promise<void>;

const unavailableText = 'Действие недоступно.';
const unauthorizedText = 'У вас нет прав на это действие.';

async function resolveSuggestionTelegramChatId<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
  suggestionId: string,
): Promise<string> {
  const scope = (
    await database
      .select({ telegramChatId: chats.telegramChatId })
      .from(commitmentSuggestions)
      .innerJoin(
        chats,
        and(eq(commitmentSuggestions.chatId, chats.id), eq(commitmentSuggestions.workspaceId, chats.workspaceId)),
      )
      .where(and(eq(commitmentSuggestions.id, suggestionId), eq(commitmentSuggestions.status, 'pending'), eq(chats.isActive, true)))
      .limit(1)
  )[0];
  if (!scope) {
    throw new SuggestionActionAuthorizationError('SUGGESTION_UNAVAILABLE');
  }
  return String(scope.telegramChatId);
}

async function resolveCommitmentTelegramChatId<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
  commitmentId: string,
): Promise<string> {
  const scope = (
    await database
      .select({ telegramChatId: chats.telegramChatId })
      .from(commitments)
      .innerJoin(
        chats,
        and(eq(commitments.chatId, chats.id), eq(commitments.workspaceId, chats.workspaceId)),
      )
      .where(and(eq(commitments.id, commitmentId), eq(chats.isActive, true)))
      .limit(1)
  )[0];
  if (!scope) {
    throw new CommitmentUpdateError('COMMITMENT_NOT_FOUND');
  }
  return String(scope.telegramChatId);
}

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
      const callbackTokens = createCallbackTokenService(input.database);
      const resolvedCallback = await callbackTokens.resolve(signedCallback);
      const currentAdminChecker = input.isCurrentChatAdmin ?? messenger.isCurrentChatAdmin ?? (() => Promise.resolve(false));
      if (resolvedCallback.kind === 'check_page') {
        if (
          signedCallback.action !== 'check_page' ||
          callback.message.chat.type !== 'private' ||
          callback.message.message_id === undefined ||
          resolvedCallback.telegramUserId !== telegramUserId
        ) {
          throw new CommitmentUpdateError('UNAUTHORIZED');
        }
        if (!messenger.editPrivateCheckMessage) {
          throw new CallbackDataError();
        }
        await callbackTokens.claim(signedCallback);
        const page = await createPrivateCommandHandler(input.database, input.callbackSigningSecret).getCheckPage({
          page: resolvedCallback.page,
          telegramUserId,
        });
        await messenger.editPrivateCheckMessage({
          telegramChatId,
          telegramMessageId: String(callback.message.message_id),
          text: page.text ?? unavailableText,
          ...(page.replyMarkup ? { replyMarkup: page.replyMarkup } : {}),
        });
        await messenger.answerCallbackQuery({ callbackQueryId: callback.id, text: 'Страница обновлена.' });
        return;
      }
      if (resolvedCallback.kind === 'commitment') {
        const commitmentAuthorization = createAuthorizeCommitmentAction(input.database, currentAdminChecker);
        const actionTelegramChatId = callback.message.chat.type === 'private'
          ? await resolveCommitmentTelegramChatId(input.database, resolvedCallback.commitmentId)
          : telegramChatId;
        if (signedCallback.action === 'reschedule') {
          await commitmentAuthorization({
            actor: { firstName: callback.from.first_name, telegramUserId },
            commitmentId: resolvedCallback.commitmentId,
            telegramChatId: actionTelegramChatId,
          });
          await callbackTokens.claim(signedCallback);
          await createCommitmentRescheduleService(input.database, currentAdminChecker).begin({
            actorTelegramUserId: telegramUserId,
            commitmentId: resolvedCallback.commitmentId,
            telegramChatId: actionTelegramChatId,
          });
          await messenger.answerCallbackQuery({
            callbackQueryId: callback.id,
            text: 'Откройте личный чат с Keepword и отправьте due: <будущий ISO-срок с timezone>.',
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
        await commitmentAuthorization({
          actor: { firstName: callback.from.first_name, telegramUserId },
          commitmentId: resolvedCallback.commitmentId,
          telegramChatId: actionTelegramChatId,
        });
        await callbackTokens.claim(signedCallback);
        await createAuthorizedCommitmentAction(input.database, currentAdminChecker)({
          action: signedCallback.action,
          actor: { firstName: callback.from.first_name, telegramUserId },
          commitmentId: resolvedCallback.commitmentId,
          telegramChatId: actionTelegramChatId,
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
        const actionTelegramChatId = callback.message.chat.type === 'private'
          ? await resolveSuggestionTelegramChatId(input.database, resolvedCallback.suggestionId)
          : telegramChatId;
        const authorize = createAuthorizeSuggestionAction(
          input.database,
          currentAdminChecker,
        );
        await authorize({
          actor: { firstName: callback.from.first_name, telegramUserId },
          suggestionId: resolvedCallback.suggestionId,
          telegramChatId: actionTelegramChatId,
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
          .where(and(eq(users.telegramUserId, telegramUserId), eq(chats.telegramChatId, Number(actionTelegramChatId))))
          .limit(1);
        const actor = scopedActor[0];
        if (!actor) {
          throw new Error('Authorized edit actor could not be scoped');
        }
        await callbackTokens.claim(signedCallback);
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

      const actionTelegramChatId = callback.message.chat.type === 'private'
        ? await resolveSuggestionTelegramChatId(input.database, resolvedCallback.suggestionId)
        : telegramChatId;
      const authorize = createAuthorizeSuggestionAction(
        input.database,
        currentAdminChecker,
      );
      await authorize({
        actor: { firstName: callback.from.first_name, telegramUserId },
        suggestionId: resolvedCallback.suggestionId,
        telegramChatId: actionTelegramChatId,
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
        .where(and(eq(users.telegramUserId, telegramUserId), eq(chats.telegramChatId, Number(actionTelegramChatId))))
        .limit(1);
      const scopedActor = scopedActors[0];
      if (!scopedActor) {
        throw new Error('Authorized callback actor could not be scoped');
      }
      await callbackTokens.claim(signedCallback);

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

      await createRejectSuggestion(input.database)({
        rejectedByUserId: scopedActor.userId,
        suggestionId: resolvedCallback.suggestionId,
      });
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
