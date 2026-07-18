import { expect, test } from 'vitest';

import { renderCommitmentActions, renderSuggestion } from '../../src/telegram/messages.js';

const suggestion = {
  dueDateText: 'сегодня',
  id: 'be3f0c64-94c6-46a8-9d08-89649a6e7ae2',
  title: 'Отправить КП',
};

test('renders stable, signed callback data with the server-resolvable suggestion ID', () => {
  const callbackNonces = {
    confirm: 'mRCODVXLcP6BCEgKrA0pZW1z',
    edit: 'sMt0MEaxPBQQoTfGi_BS5h9V',
    reject: 's16Zo4NmuUcznlUymPSY1lZQ',
  };
  const first = renderSuggestion(suggestion, callbackNonces, 'callback-signing-secret');
  const second = renderSuggestion(suggestion, callbackNonces, 'callback-signing-secret');
  const callbacks = first.replyMarkup.inline_keyboard.flat().map((button) => button.callback_data);

  expect(callbacks).toEqual(second.replyMarkup.inline_keyboard.flat().map((button) => button.callback_data));
  expect(callbacks).toEqual([
    expect.stringMatching(/^kw:confirm:mRCODVXLcP6BCEgKrA0pZW1z:[A-Za-z0-9_-]{16}$/),
    expect.stringMatching(/^kw:edit:sMt0MEaxPBQQoTfGi_BS5h9V:[A-Za-z0-9_-]{16}$/),
    expect.stringMatching(/^kw:reject:s16Zo4NmuUcznlUymPSY1lZQ:[A-Za-z0-9_-]{16}$/),
  ]);
  expect(callbacks.every((callback) => !callback.includes(suggestion.id))).toBe(true);
  expect(callbacks.every((callback) => Buffer.byteLength(callback, 'utf8') <= 64)).toBe(true);
});

test('renders private lifecycle controls without commitment identifiers', () => {
  const buttons = renderCommitmentActions(
    'overdue',
    {
      block: 'aL4BNU4F1XEl1R7W2lHjV3k8',
      cancel: 'bM4BNU4F1XEl1R7W2lHjV3k8',
      complete: 'cN4BNU4F1XEl1R7W2lHjV3k8',
      open: 'dO4BNU4F1XEl1R7W2lHjV3k8',
      reschedule: 'eP4BNU4F1XEl1R7W2lHjV3k8',
    },
    'callback-signing-secret',
  );

  expect(buttons.inline_keyboard.flat().map((button) => button.text)).toEqual([
    'Готово',
    'Есть блокер',
    'Отменить',
    'Перенести срок',
  ]);
  expect(buttons.inline_keyboard.flat().every((button) => !button.callback_data.includes(suggestion.id))).toBe(true);
});
