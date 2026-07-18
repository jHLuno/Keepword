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

const safeInternalErrorCodes = new Map<string, string>([
  ['Expected a database row', 'DATABASE_RETURNING_EMPTY'],
  ['Connected chat no longer exists', 'ONBOARDING_CHAT_MISSING'],
  ['Extraction message must belong to the requested chat', 'EXTRACTION_CONTEXT_INVALID'],
  ['Suggestion callback nonce creation was incomplete', 'SUGGESTION_CALLBACKS_INCOMPLETE'],
  ['Could not issue reminder callbacks', 'REMINDER_CALLBACKS_INCOMPLETE'],
]);

function safeErrorCodeInner(error: unknown, fallback: string, seen: Set<object>): string {
  if (typeof error !== 'object' || error === null) {
    return fallback;
  }
  if (seen.has(error)) {
    return fallback;
  }
  seen.add(error);
  const candidate = error as Record<string, unknown>;
  if ('code' in candidate) {
    const code = candidate.code;
    if (typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code)) {
      return `${fallback}_${code}`;
    }
  }
  for (const property of ['error_code', 'status'] as const) {
    if (!(property in candidate)) {
      continue;
    }
    const status = candidate[property];
    if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) {
      return `${fallback}_HTTP_${status}`;
    }
  }
  if (error instanceof Error) {
    const internalCode = safeInternalErrorCodes.get(error.message);
    if (internalCode) {
      return `${fallback}_${internalCode}`;
    }
  }
  if (typeof candidate.stack === 'string') {
    const sourceFrame = candidate.stack
      .split('\n')
      .find((frame) => /\/(?:src|dist\/src)\//.test(frame));
    const sourceFunction = sourceFrame
      ? /\bat (?:async )?([A-Za-z][A-Za-z0-9_$]*)\s*\(/.exec(sourceFrame)?.[1]
      : undefined;
    if (sourceFunction) {
      return `${fallback}_AT_${sourceFunction.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`;
    }
  }
  for (const property of ['error', 'cause'] as const) {
    if (!(property in candidate)) {
      continue;
    }
    const nestedCode = safeErrorCodeInner(candidate[property], fallback, seen);
    if (nestedCode !== fallback) {
      return nestedCode;
    }
  }
  return fallback;
}

export function safeErrorCode(error: unknown, fallback: string): string {
  return safeErrorCodeInner(error, fallback, new Set());
}

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
