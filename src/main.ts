import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './observability/logger.js';

const logger = createLogger();

async function start(): Promise<void> {
  const config = loadConfig(process.env);
  const app = buildApp(config);

  await app.listen({ host: '0.0.0.0', port: config.port });
  logger.info('http_server_started', { port: config.port });
}

void start().catch((error: unknown) => {
  logger.error('http_server_start_failed', {
    error_name: error instanceof Error ? error.name : 'UnknownError',
  });
  process.exitCode = 1;
});
