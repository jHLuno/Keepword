export const appErrorCodes = [
  'INVALID_PAYLOAD',
  'UNAUTHORIZED',
  'EXPIRED_TOKEN',
  'DUPLICATE_CANDIDATE',
  'EXTRACTION_FAILED',
  'DELIVERY_FAILED',
] as const;

export type AppErrorCode = (typeof appErrorCodes)[number];

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
  }
}
