import { z } from 'zod';

export const candidateSchema = z
  .object({
    is_commitment: z.boolean(),
    category: z.enum(['promise', 'assignment', 'follow_up', 'none']),
    language: z.enum(['en', 'ru', 'es']),
    title: z.string().nullable(),
    description: z.string().nullable(),
    assignee_telegram_user_id: z.string().nullable(),
    due_at: z.string().datetime().nullable(),
    due_date_text: z.string().nullable(),
    confidence: z.enum(['high', 'medium', 'low']),
    source_message_ids: z.array(z.string()),
    needs_assignee_clarification: z.boolean(),
    needs_due_date_clarification: z.boolean(),
    reasoning_short: z.string().max(300),
  })
  .strict();

export type CommitmentCandidate = z.infer<typeof candidateSchema>;

export type ExtractionMessage = Readonly<{
  id: string;
  chatId: string;
  authorTelegramUserId: string;
  text: string;
  sentAt: string;
}>;

export type ExtractionInput = Readonly<{
  chatId: string;
  message: ExtractionMessage;
  recentMessages: readonly ExtractionMessage[];
  maxContextMessages?: number;
  /**
   * When set, the chat forces this language: the model must write `title` and
   * `description` in it and report it as `language`, ignoring the message's own
   * language. When omitted, the model detects and preserves the message
   * language.
   */
  targetLanguage?: 'en' | 'ru' | 'es';
}>;
