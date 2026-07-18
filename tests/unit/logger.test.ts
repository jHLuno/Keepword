import { afterEach, expect, test, vi } from 'vitest';

import { createLogger } from '../../src/observability/logger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

test('writes only approved metadata fields', () => {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const logger = createLogger();

  logger.info('commitment_confirmed', {
    requestId: 'request-1',
    commitmentId: 'commitment-1',
    result: 'success',
    privateMessageText: 'this must not be logged',
  } as never);

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
