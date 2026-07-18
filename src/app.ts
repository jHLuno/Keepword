import { timingSafeEqual } from 'node:crypto';

import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from './config.js';
import { createLogger, type Logger } from './observability/logger.js';
import type { RepositoryDatabase } from './repositories/database.js';
import { createUpdatesRepository } from './repositories/updates.js';
import { createConnectChat } from './services/connect-chat.js';
import { createTelegramBot, type TelegramAdapterFactory } from './telegram/bot.js';
import { createGroupUpdateHandler } from './telegram/handlers/group.js';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

const telegramUpdateSchema = z
  .object({
    update_id: z.number().int().nonnegative(),
  })
  .passthrough();

export type AppDependencies<TQueryResult extends PgQueryResultHKT> = Readonly<{
  database: RepositoryDatabase<TQueryResult>;
  logger?: Logger;
  telegramAdapterFactory?: TelegramAdapterFactory;
}>;

function hasValidWebhookSecret(receivedSecret: string | string[] | undefined, expectedSecret: string): boolean {
  if (typeof receivedSecret !== 'string') {
    return false;
  }

  const received = Buffer.from(receivedSecret);
  const expected = Buffer.from(expectedSecret);

  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function buildApp<TQueryResult extends PgQueryResultHKT>(
  config: AppConfig,
  dependencies: AppDependencies<TQueryResult>,
): FastifyInstance {
  const logger = dependencies.logger ?? createLogger();
  const connectChat = createConnectChat(dependencies.database);
  const groupUpdateHandler = createGroupUpdateHandler({
    botUsername: config.telegramBotUsername,
    connectChat,
  });
  const telegram = dependencies.telegramAdapterFactory
    ? dependencies.telegramAdapterFactory(groupUpdateHandler)
    : createTelegramBot({ groupUpdateHandler, token: config.telegramBotToken });
  const updates = createUpdatesRepository(dependencies.database);

  const app = Fastify({ logger: false });

  app.get('/health', () => ({ status: 'ok' }));

  app.post('/telegram/webhook', async (request, reply) => {
    if (!hasValidWebhookSecret(request.headers['x-telegram-bot-api-secret-token'], config.telegramWebhookSecret)) {
      logger.info('authorization_denied', {
        errorCode: 'INVALID_TELEGRAM_WEBHOOK_SECRET',
        requestId: request.id,
        result: 'failure',
      });
      return reply.code(401).send();
    }

    const parsedUpdate = telegramUpdateSchema.safeParse(request.body);
    if (!parsedUpdate.success) {
      logger.info('telegram_update_received', {
        errorCode: 'INVALID_TELEGRAM_UPDATE',
        requestId: request.id,
        result: 'failure',
      });
      return reply.code(400).send();
    }

    const updateId = parsedUpdate.data.update_id;
    const isNewUpdate = await updates.recordUpdate(updateId);
    if (!isNewUpdate) {
      logger.info('telegram_update_received', {
        requestId: request.id,
        result: 'duplicate',
      });
      return reply.code(200).send();
    }

    try {
      await telegram.handleUpdate({ payload: request.body, updateId });
    } catch (error: unknown) {
      await updates.releaseUpdate(updateId);
      logger.error('telegram_update_dispatch_failed', {
        errorCode: error instanceof Error ? 'TELEGRAM_UPDATE_DISPATCH_FAILED' : 'UNKNOWN_TELEGRAM_DISPATCH_FAILURE',
        requestId: request.id,
        result: 'failure',
      });
      throw error;
    }
    logger.info('telegram_update_received', {
      requestId: request.id,
      result: 'processed',
    });

    return reply.code(200).send();
  });

  return app;
}
