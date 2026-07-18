export type AppConfig = Readonly<{
  callbackSigningSecret: string;
  telegramBotToken: string;
  telegramBotUsername: string;
  telegramWebhookSecret: string;
  databaseUrl: string;
  openRouterApiKey: string;
  port: number;
  workerSecret: string;
}>;

const requiredEnvironmentVariables = [
  'CALLBACK_SIGNING_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_BOT_USERNAME',
  'TELEGRAM_WEBHOOK_SECRET',
  'DATABASE_URL',
  'OPENROUTER_API_KEY',
  'WORKER_SECRET',
] as const;

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  for (const key of requiredEnvironmentVariables) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    callbackSigningSecret: env.CALLBACK_SIGNING_SECRET!,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN!,
    telegramBotUsername: env.TELEGRAM_BOT_USERNAME!,
    telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET!,
    databaseUrl: env.DATABASE_URL!,
    openRouterApiKey: env.OPENROUTER_API_KEY!,
    port: Number(env.PORT ?? 3000),
    workerSecret: env.WORKER_SECRET!,
  };
}
