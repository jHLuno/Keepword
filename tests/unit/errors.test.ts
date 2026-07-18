import { expect, test } from 'vitest';

import { AppError, appErrorCodes } from '../../src/domain/errors.js';

test('AppError preserves one of the approved error codes', () => {
  const error = new AppError('DELIVERY_FAILED', 'Delivery failed');

  expect(error).toMatchObject({
    name: 'AppError',
    code: 'DELIVERY_FAILED',
    message: 'Delivery failed',
  });
  expect(appErrorCodes).toEqual([
    'INVALID_PAYLOAD',
    'UNAUTHORIZED',
    'EXPIRED_TOKEN',
    'DUPLICATE_CANDIDATE',
    'EXTRACTION_FAILED',
    'DELIVERY_FAILED',
  ]);
});
