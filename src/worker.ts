import { loadConfig } from './config.js';
import { createLogger } from './observability/logger.js';

const logger = createLogger();

function startWorker(): void {
  loadConfig(process.env);
  logger.info('worker_started', {});
}

try {
  startWorker();
} catch (error: unknown) {
  logger.error('worker_start_failed', {
    error_name: error instanceof Error ? error.name : 'UnknownError',
  });
  process.exitCode = 1;
}
