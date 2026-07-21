import { afterAll, beforeAll, expect, test } from 'vitest';

import { buildApp } from '../../src/app.js';
import { createFakeTelegram } from '../helpers/fake-telegram.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;

beforeAll(async () => { database = await createPgliteTestDatabase(); });
afterAll(async () => { await database.client.close(); });

test('serves the landing page from the root URL without replacing health', async () => {
  const fakeTelegram = createFakeTelegram();
  const app = buildApp({
    callbackSigningSecret: 'callback', databaseUrl: 'unused', openRouterApiKey: 'unused', port: 3000,
    telegramBotToken: 'unused', telegramBotUsername: 'keepword_test_bot', telegramWebhookSecret: 'secret', workerSecret: 'worker',
  }, {
    database: database.db,
    landingDirectory: new URL('../fixtures/landing/', import.meta.url).pathname,
    telegramAdapterFactory: fakeTelegram.telegramAdapterFactory,
  });

  const landing = await app.inject({ method: 'GET', url: '/' });
  expect(landing.statusCode).toBe(200);
  expect(landing.headers['content-type']).toContain('text/html');
  expect(landing.body).toContain('Keepword landing');
  expect((await app.inject({ method: 'GET', url: '/health' })).json()).toEqual({ status: 'ok' });
  await app.close();
});
