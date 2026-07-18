import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabaseClient } from './db/client.js';
import { createLogger } from './observability/logger.js';
import { createTelegramJobRunner } from './worker.js';

const logger = createLogger();

async function start(): Promise<void> {
  const config = loadConfig(process.env);
  const database = createDatabaseClient(config.databaseUrl);
  const runJobs = createTelegramJobRunner({ config, database: database.db, logger });
  const app = buildApp(config, { database: database.db, logger, runJobs });

  await app.listen({ host: '0.0.0.0', port: config.port });
  logger.info('http_server_started', { result: 'success' });
}

void start().catch((error: unknown) => {
  logger.error('http_server_start_failed', {
    errorCode: error instanceof Error ? 'HTTP_SERVER_START_FAILED' : 'UNKNOWN_STARTUP_ERROR',
    result: 'failure',
  });
  process.exitCode = 1;
});
