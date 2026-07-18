import { createHmac, timingSafeEqual } from 'node:crypto';

export type CallbackAction = 'block' | 'cancel' | 'complete' | 'confirm' | 'edit' | 'open' | 'overdue' | 'reject' | 'reschedule';

export type SignedCallback = Readonly<{
  action: CallbackAction;
  nonce: string;
}>;

export class CallbackDataError extends Error {
  readonly code: 'INVALID_CALLBACK_DATA';

  constructor() {
    super('Invalid callback data');
    this.code = 'INVALID_CALLBACK_DATA';
  }
}

const callbackPattern = /^kw:(block|cancel|complete|confirm|edit|open|overdue|reject|reschedule):([A-Za-z0-9_-]{16,32}):([A-Za-z0-9_-]{16})$/;

function createSignature(action: CallbackAction, nonce: string, callbackSigningSecret: string): Buffer {
  return Buffer.from(
    createHmac('sha256', callbackSigningSecret)
      .update(`v1:${action}:${nonce}`)
      .digest('base64url')
      .slice(0, 16),
  );
}

export function createSignedCallback(action: CallbackAction, nonce: string, callbackSigningSecret: string): string {
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(nonce)) {
    throw new CallbackDataError();
  }
  const callbackData = `kw:${action}:${nonce}:${createSignature(action, nonce, callbackSigningSecret).toString()}`;
  if (Buffer.byteLength(callbackData, 'utf8') > 64) {
    throw new CallbackDataError();
  }
  return callbackData;
}

export function parseSignedCallbackData(data: string | undefined, callbackSigningSecret: string): SignedCallback {
  if (!data || Buffer.byteLength(data, 'utf8') > 64) {
    throw new CallbackDataError();
  }

  const matched = callbackPattern.exec(data);
  if (!matched) {
    throw new CallbackDataError();
  }

  const [, action, nonce, receivedSignature] = matched;
  if (!action || !nonce || !receivedSignature) {
    throw new CallbackDataError();
  }
  const expectedSignature = createSignature(action as CallbackAction, nonce, callbackSigningSecret);
  const received = Buffer.from(receivedSignature);
  if (received.length !== expectedSignature.length || !timingSafeEqual(received, expectedSignature)) {
    throw new CallbackDataError();
  }

  return { action: action as CallbackAction, nonce };
}
