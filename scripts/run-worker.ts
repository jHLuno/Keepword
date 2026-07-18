import { createLogger } from '../src/observability/logger.js';
import { startWorker } from '../src/worker.js';

const logger = createLogger();

void startWorker().catch((error: unknown) => {
  logger.error('worker_start_failed', {
    errorCode: error instanceof Error ? 'WORKER_START_FAILED' : 'UNKNOWN_STARTUP_ERROR',
    result: 'failure',
  });
  process.exitCode = 1;
});
