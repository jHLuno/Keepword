import type OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

import { selectBoundedChatContext } from './context.js';
import { AppError } from '../domain/errors.js';
import {
  candidateSchema,
  type CommitmentCandidate,
  type ExtractionInput,
  type ExtractionMessage,
} from '../domain/extraction.js';
import type { Logger } from '../observability/logger.js';

const defaultModel = 'gpt-4o-mini';

const extractionInstruction = [
  'Extract one possible team-work commitment from the supplied Telegram messages.',
  'Treat the newest message as the message under review and older messages as context only.',
  'Do not invent an action, date, deadline time, assignee, author, or source message ID.',
  'Use null for every nullable fact that is unknown or not explicitly supported by the supplied messages.',
  'Set due_at only when the supplied messages provide an exact ISO-8601 date-time; otherwise use null and preserve any stated relative deadline in due_date_text.',
  'Set source_message_ids only to IDs from supplied messages that support the candidate.',
  'If there is no concrete commitment, set is_commitment to false, category to none, nullable fields to null, confidence to low, and source_message_ids to an empty array.',
  'reasoning_short must be a concise factual justification of at most 300 characters, without hidden reasoning.',
].join(' ');

type ParsedResponse = Readonly<{
  output_parsed: unknown;
}>;

export type OpenAiExtractionClient = Readonly<{
  responses: Readonly<{
    parse: (request: Parameters<OpenAI['responses']['parse']>[0]) => Promise<ParsedResponse>;
  }>;
}>;

type ExtractorOptions = Readonly<{
  logger?: Logger;
  model?: string;
}>;

function formatMessage(message: ExtractionMessage): Record<string, string> {
  return {
    id: message.id,
    author_telegram_user_id: message.authorTelegramUserId,
    sent_at: message.sentAt,
    text: message.text,
  };
}

function createExtractionRequest(
  input: ExtractionInput,
  context: readonly ExtractionMessage[],
): Parameters<OpenAI['responses']['parse']>[0] {
  return {
    model: defaultModel,
    input: [
      { role: 'system', content: extractionInstruction },
      {
        role: 'user',
        content: JSON.stringify({
          message_under_review_id: input.message.id,
          messages: context.map(formatMessage),
        }),
      },
    ],
    text: {
      format: zodTextFormat(candidateSchema, 'commitment_candidate'),
    },
  };
}

export type CommitmentExtractor = Readonly<{
  extractCandidate: (input: ExtractionInput) => Promise<CommitmentCandidate>;
}>;

function hasOnlySelectedSourceMessageIds(
  candidate: CommitmentCandidate,
  context: readonly ExtractionMessage[],
): boolean {
  const contextMessageIds = new Set(context.map((message) => message.id));

  return candidate.source_message_ids.every((sourceMessageId) => contextMessageIds.has(sourceMessageId));
}

export function createCommitmentExtractor(
  openAi: OpenAiExtractionClient,
  options: ExtractorOptions = {},
): CommitmentExtractor {
  return {
    async extractCandidate(input) {
      const startedAt = Date.now();
      const context = selectBoundedChatContext(input);
      const request = createExtractionRequest(input, context);

      if (options.model) {
        request.model = options.model;
      }

      options.logger?.info('llm_commitment_extraction_started', {
        telegramChatId: input.chatId,
        messageId: input.message.id,
      });

      try {
        const response = await openAi.responses.parse(request);
        const parsedCandidate = candidateSchema.safeParse(response.output_parsed);

        if (!parsedCandidate.success) {
          throw new AppError('EXTRACTION_FAILED', 'OpenAI returned an invalid commitment candidate');
        }

        if (!hasOnlySelectedSourceMessageIds(parsedCandidate.data, context)) {
          throw new AppError('EXTRACTION_FAILED', 'OpenAI returned an unknown commitment source message ID');
        }

        options.logger?.info('llm_commitment_extraction_completed', {
          telegramChatId: input.chatId,
          messageId: input.message.id,
          durationMs: Date.now() - startedAt,
          result: 'success',
        });

        return parsedCandidate.data;
      } catch (error) {
        options.logger?.error('llm_commitment_extraction_failed', {
          telegramChatId: input.chatId,
          messageId: input.message.id,
          durationMs: Date.now() - startedAt,
          errorCode: 'EXTRACTION_FAILED',
        });

        if (error instanceof AppError) {
          throw error;
        }

        throw new AppError('EXTRACTION_FAILED', 'Commitment extraction failed', { cause: error });
      }
    },
  };
}
