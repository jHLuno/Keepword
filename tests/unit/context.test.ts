import { expect, test } from 'vitest';

import {
  defaultContextMessageLimit,
  maximumContextMessageLimit,
  selectBoundedChatContext,
} from '../../src/ai/context.js';
import type { ExtractionInput, ExtractionMessage } from '../../src/domain/extraction.js';

function message(sequence: number, chatId = 'chat-1'): ExtractionMessage {
  return {
    id: `message-${sequence}`,
    chatId,
    authorTelegramUserId: `telegram-user-${sequence}`,
    text: `Message ${sequence}`,
    sentAt: `2026-07-18T09:${String(sequence).padStart(2, '0')}:00.000Z`,
  };
}

function extractionInput(maxContextMessages?: number): ExtractionInput {
  return {
    chatId: 'chat-1',
    message: message(6),
    recentMessages: [message(5), message(3), message(1), message(4), message(2)],
    ...(maxContextMessages === undefined ? {} : { maxContextMessages }),
  };
}

test('orders the selected same-chat messages chronologically and uses the default cap', () => {
  const context = selectBoundedChatContext(extractionInput());

  expect(context).toHaveLength(defaultContextMessageLimit);
  expect(context.map((item) => item.id)).toEqual([
    'message-2',
    'message-3',
    'message-4',
    'message-5',
    'message-6',
  ]);
});

test('uses a configured context cap', () => {
  const context = selectBoundedChatContext(extractionInput(2));

  expect(context.map((item) => item.id)).toEqual(['message-5', 'message-6']);
});

test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1])(
  'uses the safe default cap for invalid limit %s',
  (maxContextMessages) => {
    const context = selectBoundedChatContext(extractionInput(maxContextMessages));

    expect(context).toHaveLength(defaultContextMessageLimit);
  },
);

test('applies an absolute cap to configured limits', () => {
  const context = selectBoundedChatContext({
    chatId: 'chat-1',
    message: message(21),
    recentMessages: Array.from({ length: 20 }, (_, index) => message(index + 1)),
    maxContextMessages: 100,
  });

  expect(context).toHaveLength(maximumContextMessageLimit);
  expect(context[0]?.id).toBe('message-12');
  expect(context.at(-1)?.id).toBe('message-21');
});

test('excludes messages from other chats before applying the cap', () => {
  const context = selectBoundedChatContext({
    ...extractionInput(),
    recentMessages: [...extractionInput().recentMessages, message(99, 'chat-2')],
  });

  expect(context.map((item) => item.chatId)).toEqual(Array(defaultContextMessageLimit).fill('chat-1'));
  expect(context.map((item) => item.id)).not.toContain('message-99');
});
