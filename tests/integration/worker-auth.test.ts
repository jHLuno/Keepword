import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildApp } from '../../src/app.js';
import { createFakeTelegram } from '../helpers/fake-telegram.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;

function buildWorkerApp(runJobs?: () => Promise<void>) {
  const fakeTelegram = createFakeTelegram();
  const config = {
    callbackSigningSecret: 'callback-test-secret',
    databaseUrl: 'postgres://unused/test',
    openAiApiKey: 'unused',
    port: 3_000,
    telegramBotToken: 'unused',
    telegramBotUsername: 'keepword_test_bot',
    telegramWebhookSecret: 'webhook-test-secret',
    workerSecret: 'worker-test-secret',
  };
  const dependencies = { database: database.db, telegramAdapterFactory: fakeTelegram.telegramAdapterFactory };

  if (runJobs) {
    return buildApp(config, { ...dependencies, runJobs });
  }

  return buildApp(
    config,
    dependencies,
  );
}

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('operational endpoints', () => {
  test('reports health without exposing configuration', async () => {
    const app = buildWorkerApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  test('rejects unauthenticated job execution', async () => {
    const app = buildWorkerApp();

    expect((await app.inject({ method: 'POST', url: '/internal/run-jobs' })).statusCode).toBe(401);
    await app.close();
  });

  test('runs jobs when authorized with the worker secret', async () => {
    let runs = 0;
    const app = buildWorkerApp(() => {
      runs += 1;
      return Promise.resolve();
    });

    const response = await app.inject({
      headers: { authorization: 'Bearer worker-test-secret' },
      method: 'POST',
      url: '/internal/run-jobs',
    });

    expect(response.statusCode).toBe(200);
    expect(runs).toBe(1);
    await app.close();
  });
});
