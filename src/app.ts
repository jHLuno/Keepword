import { timingSafeEqual } from 'node:crypto';

import Fastify, { type FastifyInstance } from 'fastify';
import OpenAI from 'openai';
import { z } from 'zod';

import { createCommitmentExtractor } from './ai/extractor.js';
import type { AppConfig } from './config.js';
import { createLogger, type Logger } from './observability/logger.js';
import type { RepositoryDatabase } from './repositories/database.js';
import { createUpdatesRepository } from './repositories/updates.js';
import { createConnectChat } from './services/connect-chat.js';
import { createChatSettingsService } from './services/chat-settings.js';
import { createDeleteChatData } from './services/delete-chat-data.js';
import { createOnboardingInvitationService } from './services/onboarding-invitation.js';
import { createOnboardingService } from './services/onboarding.js';
import { createAnalyzeGroupMessage, type AnalyzeGroupMessage } from './services/analyze-message.js';
import { createManualCapture } from './services/manual-capture.js';
import { createTelegramBot, type TelegramAdapterFactory } from './telegram/bot.js';
import { createCommitmentActionCallbackHandler } from './telegram/handlers/callback.js';
import { createGroupUpdateHandler } from './telegram/handlers/group.js';
import { createPrivateUpdateHandler } from './telegram/handlers/private.js';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

const telegramUpdateSchema = z
  .object({
    update_id: z.number().int().nonnegative(),
  })
  .passthrough();

export type AppDependencies<TQueryResult extends PgQueryResultHKT> = Readonly<{
  analyzeGroupMessage?: AnalyzeGroupMessage;
  database: RepositoryDatabase<TQueryResult>;
  logger?: Logger;
  runJobs?: () => Promise<void>;
  telegramAdapterFactory?: TelegramAdapterFactory;
}>;

function hasValidSecret(receivedSecret: string | string[] | undefined, expectedSecret: string): boolean {
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
  const onboardingInvitations = createOnboardingInvitationService(dependencies.database);
  const onboarding = createOnboardingService(dependencies.database, { botUsername: config.telegramBotUsername });
  const extractor = createCommitmentExtractor(new OpenAI({ apiKey: config.openAiApiKey }), { logger });
  const analyzeGroupMessage =
    dependencies.analyzeGroupMessage ??
    createAnalyzeGroupMessage(
      dependencies.database,
      extractor,
      undefined,
      config.callbackSigningSecret,
      logger,
      onboarding,
    );
  const groupUpdateHandler = createGroupUpdateHandler({
    analyzeGroupMessage,
    botUsername: config.telegramBotUsername,
    chatSettings: (isCurrentChatAdmin) => createChatSettingsService(dependencies.database, isCurrentChatAdmin),
    connectChat,
    deleteChatData: (isCurrentChatAdmin) => createDeleteChatData(dependencies.database, isCurrentChatAdmin),
    onboardingInvitations,
    onboarding,
  });
  const callbackUpdateHandler = createCommitmentActionCallbackHandler({
    callbackSigningSecret: config.callbackSigningSecret,
    database: dependencies.database,
    logger,
  });
  const privateUpdateHandler = createPrivateUpdateHandler({
    database: dependencies.database,
    logger,
    manualCapture: createManualCapture(dependencies.database, extractor, config.callbackSigningSecret, logger),
    onboarding,
  });
  const telegram = dependencies.telegramAdapterFactory
    ? dependencies.telegramAdapterFactory(groupUpdateHandler, callbackUpdateHandler, privateUpdateHandler)
    : createTelegramBot({ callbackUpdateHandler, groupUpdateHandler, privateUpdateHandler, token: config.telegramBotToken });
  const updates = createUpdatesRepository(dependencies.database);

  const app = Fastify({ logger: false });

  app.get('/health', () => ({ status: 'ok' }));

  app.post('/internal/run-jobs', async (request, reply) => {
    if (!hasValidSecret(request.headers.authorization, `Bearer ${config.workerSecret}`)) {
      logger.info('authorization_denied', {
        errorCode: 'INVALID_WORKER_SECRET',
        requestId: request.id,
        result: 'failure',
      });
      return reply.code(401).send();
    }

    if (!dependencies.runJobs) {
      logger.error('internal_jobs_run_failed', {
        errorCode: 'JOB_RUNNER_UNAVAILABLE',
        requestId: request.id,
        result: 'failure',
      });
      return reply.code(503).send();
    }

    try {
      await dependencies.runJobs();
    } catch (error: unknown) {
      logger.error('internal_jobs_run_failed', {
        errorCode: error instanceof Error ? 'JOB_RUNNER_FAILED' : 'UNKNOWN_JOB_RUNNER_FAILURE',
        requestId: request.id,
        result: 'failure',
      });
      return reply.code(500).send();
    }

    logger.info('internal_jobs_run_completed', { requestId: request.id, result: 'success' });
    return reply.code(200).send({ status: 'ok' });
  });

  app.post('/telegram/webhook', async (request, reply) => {
    if (!hasValidSecret(request.headers['x-telegram-bot-api-secret-token'], config.telegramWebhookSecret)) {
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
