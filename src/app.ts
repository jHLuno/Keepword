import Fastify, { type FastifyInstance } from 'fastify';

import type { AppConfig } from './config.js';

export function buildApp(config: AppConfig): FastifyInstance {
  void config;

  const app = Fastify({ logger: false });

  app.get('/health', () => ({ status: 'ok' }));

  return app;
}
