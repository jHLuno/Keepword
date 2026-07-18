import { Bot } from 'grammy';

import { loadConfig } from './config.js';
import { createDatabaseClient } from './db/client.js';
import { createDigestJob } from './jobs/digests.js';
import { createLogger } from './observability/logger.js';

const logger = createLogger();

async function startWorker(): Promise<void> {
  const config = loadConfig(process.env);
  const database = createDatabaseClient(config.databaseUrl);
  const bot = new Bot(config.telegramBotToken);
  const runDigestJob = createDigestJob({
    database: database.db,
    logger,
    messenger: {
      async sendPrivateMessage(input) {
        await bot.api.sendMessage(input.telegramUserId, input.text);
      },
    },
  });
  let running = false;
  const run = async (): Promise<void> => {
    if (running) {
      return;
    }
    running = true;
    try {
      await runDigestJob(new Date());
    } catch (error: unknown) {
      logger.error('daily_digest_failed', {
        errorCode: error instanceof Error ? 'DIGEST_JOB_FAILED' : 'UNKNOWN_DIGEST_JOB_ERROR',
        result: 'failure',
      });
    } finally {
      running = false;
    }
  };
  await run();
  setInterval(() => { void run(); }, 60_000);
  logger.info('worker_started', {});
}

void startWorker().catch((error: unknown) => {
  logger.error('worker_start_failed', {
    errorCode: error instanceof Error ? 'WORKER_START_FAILED' : 'UNKNOWN_STARTUP_ERROR',
    result: 'failure',
  });
  process.exitCode = 1;
});
