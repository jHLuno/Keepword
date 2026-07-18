export type LogMetadata = Readonly<{
  requestId?: string;
  workspaceId?: string;
  telegramChatId?: string;
  telegramUserId?: string;
  messageId?: string;
  commitmentId?: string;
  durationMs?: number;
  result?: string;
  errorCode?: string;
}>;

export type Logger = Readonly<{
  info: (event: string, metadata: LogMetadata) => void;
  error: (event: string, metadata: LogMetadata) => void;
}>;

export function serializeLog(event: string, metadata: LogMetadata, level: 'error' | 'info' = 'info'): string {
  const safeMetadata = {
    request_id: metadata.requestId,
    workspace_id: metadata.workspaceId,
    telegram_chat_id: metadata.telegramChatId,
    telegram_user_id: metadata.telegramUserId,
    message_id: metadata.messageId,
    commitment_id: metadata.commitmentId,
    duration_ms: metadata.durationMs,
    result: metadata.result,
    error_code: metadata.errorCode,
  };

  return `${JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event_name: event,
    ...safeMetadata,
  })}\n`;
}

export function createLogger(): Logger {
  return {
    info(event, metadata) {
      process.stdout.write(serializeLog(event, metadata));
    },
    error(event, metadata) {
      process.stderr.write(serializeLog(event, metadata, 'error'));
    },
  };
}
