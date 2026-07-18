import { expect, test } from 'vitest';

import { createCommitmentExtractor } from '../../src/ai/extractor.js';
import type { ExtractionInput } from '../../src/domain/extraction.js';
import { createFakeOpenAi } from '../helpers/fake-openai.js';

const validCandidate = {
  is_commitment: true,
  category: 'promise',
  title: 'Отправить КП',
  description: 'Отправить клиенту коммерческое предложение.',
  assignee_telegram_user_id: 'telegram-user-1',
  due_at: null,
  due_date_text: 'сегодня',
  confidence: 'high',
  source_message_ids: ['message-2'],
  needs_assignee_clarification: false,
  needs_due_date_clarification: true,
  reasoning_short: 'Автор явно обещает отправить КП.',
};

const input: ExtractionInput = {
  chatId: 'chat-1',
  message: {
    id: 'message-2',
    chatId: 'chat-1',
    authorTelegramUserId: 'telegram-user-1',
    text: 'Я отправлю КП сегодня',
    sentAt: '2026-07-18T09:02:00.000Z',
  },
  recentMessages: [
    {
      id: 'other-chat-message',
      chatId: 'chat-2',
      authorTelegramUserId: 'telegram-user-2',
      text: 'Это сообщение другого чата.',
      sentAt: '2026-07-18T09:00:00.000Z',
    },
    {
      id: 'message-1',
      chatId: 'chat-1',
      authorTelegramUserId: 'telegram-user-2',
      text: 'Клиент ждёт КП.',
      sentAt: '2026-07-18T09:01:00.000Z',
    },
  ],
  maxContextMessages: 2,
};

test('extracts a Zod-validated candidate from bounded same-chat context', async () => {
  const openAi = createFakeOpenAi(validCandidate);
  const extractor = createCommitmentExtractor(openAi);

  await expect(extractor.extractCandidate(input)).resolves.toEqual(validCandidate);

  expect(openAi.responses.parse).toHaveBeenCalledOnce();
  const request = openAi.responses.parse.mock.calls[0]?.[0] as {
    input: Array<{ content: string; role: string }>;
  };

  expect(request.input).toHaveLength(2);
  expect(request.input[1]?.content).toContain('message-1');
  expect(request.input[1]?.content).toContain('message-2');
  expect(request.input[1]?.content).not.toContain('other-chat-message');
});

test('rejects an invalid AI response instead of inventing a candidate', async () => {
  const openAi = createFakeOpenAi({ ...validCandidate, confidence: 'certain' });
  const extractor = createCommitmentExtractor(openAi);

  await expect(extractor.extractCandidate(input)).rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
});

test('rejects a candidate that references a source message outside selected context', async () => {
  const openAi = createFakeOpenAi({ ...validCandidate, source_message_ids: ['unknown-message'] });
  const extractor = createCommitmentExtractor(openAi);

  await expect(extractor.extractCandidate(input)).rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
});
