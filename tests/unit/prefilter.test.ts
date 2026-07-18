import { expect, test } from 'vitest';

import { isPotentialCommitment } from '../../src/ai/prefilter.js';

test.each(['Я отправлю КП сегодня', 'Настя, проверь бюджет до завтра'])(
  'flags a likely commitment: %s',
  (text) => {
    expect(isPotentialCommitment(text)).toBe(true);
  },
);

test('normalizes whitespace and case before checking triggers', () => {
  expect(isPotentialCommitment('  WE\nWILL\tSEND the proposal tomorrow  ')).toBe(true);
});

test('skips irrelevant conversation without invoking OpenAI', () => {
  expect(isPotentialCommitment('Доброе утро, коллеги!')).toBe(false);
});
