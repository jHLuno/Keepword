import { expect, test } from 'vitest';
import { loadConfig } from '../../src/config.js';

test('rejects a missing TELEGRAM_BOT_TOKEN', () => {
  expect(() => loadConfig({ DATABASE_URL: 'postgres://local/db', OPENAI_API_KEY: 'key' }))
    .toThrow('TELEGRAM_BOT_TOKEN');
});
