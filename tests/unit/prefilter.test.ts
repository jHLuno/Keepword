import { expect, test } from 'vitest';

import { isPotentialCommitment } from '../../src/ai/prefilter.js';

test.each([
  'Я созвонюсь с Анель завтра',
  'Составлю КП к вечеру',
  'Анель, подготовь смету до пятницы',
  'Нужно согласовать договор до понедельника',
  'We will send the contract by Friday',
  'Please review the budget today',
])('flags a commitment candidate: %s', (text) => {
  expect(isPotentialCommitment(text)).toBe(true);
});

test.each([
  'Доброе утро, коллеги!',
  'Как прошел созвон?',
  'КП уже отправили клиенту',
  'Созвон в 15:00?',
])('skips non-candidate text: %s', (text) => {
  expect(isPotentialCommitment(text)).toBe(false);
});
