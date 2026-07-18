export type LogMetadata = Readonly<{
  requestId?: string;
  workspaceId?: string;
  telegramChatId?: string;
  telegramUserId?: string;
  messageId?: string;
  commitmentId?: string;
  durationMs?: number;
  result?: 'failure' | 'skipped' | 'success';
  errorCode?: string;
}>;

export type Logger = Readonly<{
  info: (event: string, metadata: LogMetadata) => void;
  error: (event: string, metadata: LogMetadata) => void;
}>;

function writeLog(
  output: NodeJS.WriteStream,
  level: 'error' | 'info',
  event: string,
  metadata: LogMetadata,
): void {
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

  output.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event_name: event,
    ...safeMetadata,
  })}\n`);
}

export function createLogger(): Logger {
  return {
    info(event, metadata) {
      writeLog(process.stdout, 'info', event, metadata);
    },
    error(event, metadata) {
      writeLog(process.stderr, 'error', event, metadata);
    },
  };
}
