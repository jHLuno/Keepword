import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { isPotentialCommitment } from '../ai/prefilter.js';
import type { CommitmentExtractor } from '../ai/extractor.js';
import type { CommitmentCandidate } from '../domain/extraction.js';
import type { Logger } from '../observability/logger.js';
import { createMessagesRepository } from '../repositories/messages.js';
import type { RepositoryDatabase } from '../repositories/database.js';
import { createUsersRepository } from '../repositories/users.js';
import { renderSuggestion, type InlineKeyboardMarkup } from '../telegram/messages.js';

import { createSuggestion } from './create-suggestion.js';

const clarificationText = 'Похоже, это договорённость. Кто отвечает и к какому сроку?';

export type GroupMessageForAnalysis = Readonly<{
  author: Readonly<{
    firstName: string;
    lastName?: string;
    telegramUserId: number;
    username?: string;
  }>;
  sentAt: Date;
  telegramChatId: string;
  telegramMessageId: string;
  text: string;
}>;

export type SuggestionReply = Readonly<{
  replyMarkup: InlineKeyboardMarkup;
  replyToTelegramMessageId: string;
  telegramChatId: string;
  text: string;
}>;

export type ClarificationRequest = Readonly<{
  replyToTelegramMessageId: string;
  telegramChatId: string;
  text: string;
}>;

export type SuggestionMessenger = Readonly<{
  sendClarificationRequest: (request: ClarificationRequest) => Promise<void>;
  sendSuggestionReply: (reply: SuggestionReply) => Promise<void>;
}>;

export type AnalyzeGroupMessage = (
  input: GroupMessageForAnalysis & Readonly<{ messenger?: SuggestionMessenger }>,
) => Promise<'skipped' | 'suggested' | 'clarification-requested'>;

function hasAction(candidate: CommitmentCandidate): candidate is CommitmentCandidate & { title: string } {
  return candidate.is_commitment && candidate.category !== 'none' && candidate.title !== null && candidate.title.trim().length > 0;
}

function hasDueDateOrClarification(candidate: CommitmentCandidate): boolean {
  return candidate.due_at !== null || candidate.due_date_text !== null || candidate.needs_due_date_clarification;
}

function parseTelegramId(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }

  const telegramUserId = Number(value);
  return Number.isSafeInteger(telegramUserId) ? telegramUserId : null;
}

export function createAnalyzeGroupMessage<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
  extractor: CommitmentExtractor,
  messenger: SuggestionMessenger | undefined,
  logger?: Logger,
): AnalyzeGroupMessage {
  const messages = createMessagesRepository(database);
  const users = createUsersRepository(database);
  const createPendingSuggestion = createSuggestion(database);

  return async (input) => {
    const activeMessenger = input.messenger ?? messenger;
    const telegramChatId = Number(input.telegramChatId);
    const telegramMessageId = Number(input.telegramMessageId);
    if (!Number.isSafeInteger(telegramChatId) || !Number.isSafeInteger(telegramMessageId) || !isPotentialCommitment(input.text)) {
      return 'skipped';
    }

    const chat = await messages.findActiveChatByTelegramChatId(telegramChatId);
    if (!chat || chat.mode !== 'suggest') {
      return 'skipped';
    }

    const sourceMessage = await messages.persistCandidateSourceMessage({
      author: input.author,
      chatId: chat.id,
      sentAt: input.sentAt,
      telegramMessageId,
      text: input.text,
      workspaceId: chat.workspaceId,
    });
    logger?.info('message_candidate_detected', {
      messageId: sourceMessage.id,
      telegramChatId: input.telegramChatId,
      telegramUserId: String(input.author.telegramUserId),
      workspaceId: chat.workspaceId,
    });

    const recentMessages = await messages.findRecentScopedMessages({
      chatId: chat.id,
      limit: 5,
      workspaceId: chat.workspaceId,
    });
    const extractionMessage = recentMessages.find((message) => message.id === sourceMessage.id);
    if (!extractionMessage) {
      throw new Error('Persisted source message was not available for extraction');
    }

    const candidate = await extractor.extractCandidate({
      chatId: chat.id,
      message: extractionMessage,
      recentMessages,
    });

    if (candidate.confidence === 'medium' && candidate.is_commitment && candidate.category === 'follow_up') {
      if (!activeMessenger) {
        throw new Error('A Telegram messenger is required to request clarification');
      }
      await activeMessenger.sendClarificationRequest({
        replyToTelegramMessageId: input.telegramMessageId,
        telegramChatId: input.telegramChatId,
        text: clarificationText,
      });
      return 'clarification-requested';
    }

    const assigneeTelegramUserId = parseTelegramId(candidate.assignee_telegram_user_id);
    if (candidate.confidence !== 'high' || !hasAction(candidate) || assigneeTelegramUserId === null || !hasDueDateOrClarification(candidate)) {
      return 'skipped';
    }

    const assignee = await users.findScopedMember({
      chatId: chat.id,
      telegramUserId: assigneeTelegramUserId,
      workspaceId: chat.workspaceId,
    });
    if (!assignee) {
      return 'skipped';
    }

    const createdSuggestion = await createPendingSuggestion({
      assigneeUserId: assignee.id,
      chatId: chat.id,
      confidence: candidate.confidence,
      description: candidate.description,
      dueAt: candidate.due_at === null ? null : new Date(candidate.due_at),
      dueDateText: candidate.due_date_text,
      needsAssigneeClarification: candidate.needs_assignee_clarification,
      needsDueDateClarification: candidate.needs_due_date_clarification,
      sourceMessageId: sourceMessage.id,
      title: candidate.title,
      workspaceId: chat.workspaceId,
    });
    if (createdSuggestion.duplicate) {
      logger?.info('duplicate_commitment_detected', {
        commitmentId: createdSuggestion.id,
        messageId: sourceMessage.id,
        telegramChatId: input.telegramChatId,
        workspaceId: chat.workspaceId,
      });
      return 'skipped';
    }

    await messages.markUsedAsSource({
      chatId: chat.id,
      messageId: sourceMessage.id,
      workspaceId: chat.workspaceId,
    });
    const card = renderSuggestion({ dueDateText: candidate.due_date_text, title: candidate.title });
    if (!activeMessenger) {
      throw new Error('A Telegram messenger is required to send a suggestion');
    }
    await activeMessenger.sendSuggestionReply({
      ...card,
      replyToTelegramMessageId: input.telegramMessageId,
      telegramChatId: input.telegramChatId,
    });
    logger?.info('commitment_suggestion_created', {
      commitmentId: createdSuggestion.id,
      messageId: sourceMessage.id,
      telegramChatId: input.telegramChatId,
      workspaceId: chat.workspaceId,
    });

    return 'suggested';
  };
}
