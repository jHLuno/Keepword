export type AppConfig = Readonly<{
  telegramBotToken: string;
  telegramWebhookSecret: string;
  databaseUrl: string;
  openAiApiKey: string;
  port: number;
  workerSecret: string;
}>;

const requiredEnvironmentVariables = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'DATABASE_URL',
  'OPENAI_API_KEY',
  'WORKER_SECRET',
] as const;

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  for (const key of requiredEnvironmentVariables) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    telegramBotToken: env.TELEGRAM_BOT_TOKEN!,
    telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET!,
    databaseUrl: env.DATABASE_URL!,
    openAiApiKey: env.OPENAI_API_KEY!,
    port: Number(env.PORT ?? 3000),
    workerSecret: env.WORKER_SECRET!,
  };
}
