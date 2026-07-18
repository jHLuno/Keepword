import { Bot } from 'grammy';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { loadConfig, type AppConfig } from './config.js';
import { createDatabaseClient } from './db/client.js';
import { createDigestJob } from './jobs/digests.js';
import { createReminderJob } from './jobs/reminders.js';
import { createLogger, safeErrorCode } from './observability/logger.js';
import type { Logger } from './observability/logger.js';
import type { RepositoryDatabase } from './repositories/database.js';
import type { ReminderMessenger } from './services/send-reminder.js';

export type RunJobs = () => Promise<void>;

export type WorkerMessenger = Readonly<{
  sendPrivateMessage: (input: Readonly<{
    replyMarkup?: Parameters<ReminderMessenger['sendPrivateMessage']>[0]['replyMarkup'];
    telegramUserId: number;
    text: string;
  }>) => Promise<void>;
}>;

export function createJobRunner<TQueryResult extends PgQueryResultHKT>(input: Readonly<{
  config: Pick<AppConfig, 'callbackSigningSecret'>;
  database: RepositoryDatabase<TQueryResult>;
  logger: Logger;
  messenger: WorkerMessenger;
}>): RunJobs {
  const runReminderJob = createReminderJob({
    callbackSigningSecret: input.config.callbackSigningSecret,
    database: input.database,
    logger: input.logger,
    messenger: input.messenger,
  });
  const runDigestJob = createDigestJob({
    database: input.database,
    logger: input.logger,
    messenger: input.messenger,
  });

  return async () => {
    await Promise.all([runReminderJob(new Date()), runDigestJob(new Date())]);
  };
}

export function createTelegramJobRunner<TQueryResult extends PgQueryResultHKT>(input: Readonly<{
  config: Pick<AppConfig, 'callbackSigningSecret' | 'telegramBotToken'>;
  database: RepositoryDatabase<TQueryResult>;
  logger: Logger;
}>): RunJobs {
  const bot = new Bot(input.config.telegramBotToken);
  return createJobRunner({
    config: input.config,
    database: input.database,
    logger: input.logger,
    messenger: {
      async sendPrivateMessage(input) {
        if (input.replyMarkup) {
          await bot.api.sendMessage(input.telegramUserId, input.text, { reply_markup: input.replyMarkup });
          return;
        }
        await bot.api.sendMessage(input.telegramUserId, input.text);
      },
    },
  });
}

export async function startWorker(): Promise<void> {
  const logger = createLogger();
  const config = loadConfig(process.env);
  const database = createDatabaseClient(config.databaseUrl);
  const runJobs = createTelegramJobRunner({ config, database: database.db, logger });
  let running = false;
  const run = async (): Promise<void> => {
    if (running) {
      return;
    }
    running = true;
    try {
      await runJobs();
    } catch (error: unknown) {
      logger.error('worker_jobs_failed', {
        errorCode: safeErrorCode(
          error,
          error instanceof Error ? 'WORKER_JOBS_FAILED' : 'UNKNOWN_WORKER_JOBS_ERROR',
        ),
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
