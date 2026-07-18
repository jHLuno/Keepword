import { expect, test } from 'vitest';
import { loadConfig } from '../../src/config.js';

test('rejects a missing TELEGRAM_BOT_TOKEN', () => {
  expect(() =>
    loadConfig({
      CALLBACK_SIGNING_SECRET: 'callback-signing-secret',
      DATABASE_URL: 'postgres://local/db',
      OPENAI_API_KEY: 'key',
      TELEGRAM_BOT_USERNAME: 'keepword_test_bot',
      TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
      WORKER_SECRET: 'worker-secret',
    }),
  ).toThrow('TELEGRAM_BOT_TOKEN');
});

test('rejects a missing CALLBACK_SIGNING_SECRET', () => {
  expect(() =>
    loadConfig({
      DATABASE_URL: 'postgres://local/db',
      OPENAI_API_KEY: 'key',
      TELEGRAM_BOT_TOKEN: 'bot-token',
      TELEGRAM_BOT_USERNAME: 'keepword_test_bot',
      TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
      WORKER_SECRET: 'worker-secret',
    }),
  ).toThrow('CALLBACK_SIGNING_SECRET');
});
