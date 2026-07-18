import { expect, test } from 'vitest';

import { renderSuggestion } from '../../src/telegram/messages.js';

const suggestion = {
  dueDateText: 'сегодня',
  id: 'be3f0c64-94c6-46a8-9d08-89649a6e7ae2',
  title: 'Отправить КП',
};

test('renders stable, signed callback data with the server-resolvable suggestion ID', () => {
  const first = renderSuggestion(suggestion, 'callback-signing-secret');
  const second = renderSuggestion(suggestion, 'callback-signing-secret');
  const callbacks = first.replyMarkup.inline_keyboard.flat().map((button) => button.callback_data);

  expect(callbacks).toEqual(second.replyMarkup.inline_keyboard.flat().map((button) => button.callback_data));
  expect(callbacks).toEqual([
    expect.stringMatching(/^kw:confirm:be3f0c64-94c6-46a8-9d08-89649a6e7ae2:[A-Za-z0-9_-]{16}$/),
    expect.stringMatching(/^kw:edit:be3f0c64-94c6-46a8-9d08-89649a6e7ae2:[A-Za-z0-9_-]{16}$/),
    expect.stringMatching(/^kw:reject:be3f0c64-94c6-46a8-9d08-89649a6e7ae2:[A-Za-z0-9_-]{16}$/),
  ]);
  expect(callbacks.every((callback) => Buffer.byteLength(callback, 'utf8') <= 64)).toBe(true);
});
