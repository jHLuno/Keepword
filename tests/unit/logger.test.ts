import { afterEach, expect, test, vi } from 'vitest';

import { createLogger, safeErrorCode, serializeLog, type LogMetadata } from '../../src/observability/logger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

test('does not serialize an unapproved private messageText field', () => {
  const serializedLog = serializeLog(
    'message_candidate_detected',
    {
      messageText: 'private message',
      telegramChatId: '1',
    } as unknown as LogMetadata,
  );

  expect(serializedLog).not.toContain('messageText');
  expect(serializedLog).not.toContain('private message');
  expect(JSON.parse(serializedLog)).toMatchObject({
    event_name: 'message_candidate_detected',
    telegram_chat_id: '1',
  });
});

test('writes only approved metadata fields', () => {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const logger = createLogger();

  logger.info('commitment_confirmed', {
    requestId: 'request-1',
    commitmentId: 'commitment-1',
    result: 'success',
  });

  const serializedLog = write.mock.calls[0]?.[0];

  expect(typeof serializedLog).toBe('string');
  expect(JSON.parse(serializedLog as string)).toMatchObject({
    level: 'info',
    event_name: 'commitment_confirmed',
    request_id: 'request-1',
    commitment_id: 'commitment-1',
    result: 'success',
  });
  expect(serializedLog).not.toContain('privateMessageText');
  expect(serializedLog).not.toContain('this must not be logged');
});

test('uses a safe upstream error code without serializing an error message', () => {
  const error = Object.assign(new Error('relation commitments does not exist'), { code: '42P01' });

  expect(safeErrorCode(error, 'WORKER_JOBS_FAILED')).toBe('WORKER_JOBS_FAILED_42P01');
});

test('uses a safe Telegram API status without serializing its description', () => {
  const error = Object.assign(new Error('Bad Request: chat not found'), { error_code: 400 });

  expect(safeErrorCode(error, 'TELEGRAM_UPDATE_DISPATCH_FAILED')).toBe(
    'TELEGRAM_UPDATE_DISPATCH_FAILED_HTTP_400',
  );
});

test('maps a known internal error to a safe diagnostic code', () => {
  const error = new Error('Expected a database row');

  expect(safeErrorCode(error, 'TELEGRAM_UPDATE_DISPATCH_FAILED')).toBe(
    'TELEGRAM_UPDATE_DISPATCH_FAILED_DATABASE_RETURNING_EMPTY',
  );
});

test('uses a safe source module name for an otherwise unknown error', () => {
  const error = {
    stack: 'Error: unexpected\n    at createConnectChat (file:///app/dist/src/services/connect-chat.js:27:11)',
  };

  expect(safeErrorCode(error, 'TELEGRAM_UPDATE_DISPATCH_FAILED')).toBe(
    'TELEGRAM_UPDATE_DISPATCH_FAILED_AT_CREATE_CONNECT_CHAT',
  );
});

test('uses a safe code from a grammY-style wrapped error', () => {
  const error = { error: Object.assign(new Error('relation missing'), { code: '42P01' }) };

  expect(safeErrorCode(error, 'TELEGRAM_UPDATE_DISPATCH_FAILED')).toBe(
    'TELEGRAM_UPDATE_DISPATCH_FAILED_42P01',
  );
});
