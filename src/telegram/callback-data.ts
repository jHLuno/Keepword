import { createHmac, timingSafeEqual } from 'node:crypto';

export type CallbackAction = 'block' | 'cancel' | 'complete' | 'confirm' | 'edit' | 'open' | 'overdue' | 'reject';

export type SignedCallback = Readonly<{
  action: CallbackAction;
  entityId: string;
}>;

export class CallbackDataError extends Error {
  readonly code: 'INVALID_CALLBACK_DATA';

  constructor() {
    super('Invalid callback data');
    this.code = 'INVALID_CALLBACK_DATA';
  }
}

const callbackPattern = /^kw:(block|cancel|complete|confirm|edit|open|overdue|reject):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([A-Za-z0-9_-]{16})$/i;

function createSignature(action: CallbackAction, entityId: string, callbackSigningSecret: string): Buffer {
  return Buffer.from(
    createHmac('sha256', callbackSigningSecret)
      .update(`v1:${action}:${entityId}`)
      .digest('base64url')
      .slice(0, 16),
  );
}

export function parseSignedCallbackData(data: string | undefined, callbackSigningSecret: string): SignedCallback {
  if (!data || Buffer.byteLength(data, 'utf8') > 64) {
    throw new CallbackDataError();
  }

  const matched = callbackPattern.exec(data);
  if (!matched) {
    throw new CallbackDataError();
  }

  const [, action, entityId, receivedSignature] = matched;
  if (!action || !entityId || !receivedSignature) {
    throw new CallbackDataError();
  }
  const expectedSignature = createSignature(action as CallbackAction, entityId, callbackSigningSecret);
  const received = Buffer.from(receivedSignature);
  if (received.length !== expectedSignature.length || !timingSafeEqual(received, expectedSignature)) {
    throw new CallbackDataError();
  }

  return { action: action as CallbackAction, entityId };
}
