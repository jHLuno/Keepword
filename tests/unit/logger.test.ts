import { afterEach, expect, test, vi } from 'vitest';

import { createLogger, serializeLog, type LogMetadata } from '../../src/observability/logger.js';

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
