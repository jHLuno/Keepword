import { expect, test } from 'vitest';

import { createSignedCallback, parseSignedCallbackData } from '../../src/telegram/callback-data.js';

test('signs and verifies an opaque callback nonce without embedding the entity identifier', () => {
  const nonce = 'rBf6El6Zt18q_jpDa0x3WQ';
  const callback = createSignedCallback('confirm', nonce, 'callback-signing-secret');

  expect(callback).toMatch(/^kw:confirm:rBf6El6Zt18q_jpDa0x3WQ:[A-Za-z0-9_-]{16}$/);
  expect(callback).not.toContain('be3f0c64-94c6-46a8-9d08-89649a6e7ae2');
  expect(parseSignedCallbackData(callback, 'callback-signing-secret')).toEqual({ action: 'confirm', nonce });
});
