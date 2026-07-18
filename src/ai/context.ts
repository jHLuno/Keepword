import type { ExtractionInput, ExtractionMessage } from '../domain/extraction.js';

export const defaultContextMessageLimit = 5;
export const maximumContextMessageLimit = 10;

function compareMessagesBySentAt(left: ExtractionMessage, right: ExtractionMessage): number {
  const timeDifference = Date.parse(left.sentAt) - Date.parse(right.sentAt);

  return timeDifference !== 0 ? timeDifference : left.id.localeCompare(right.id);
}

function contextLimit(configuredLimit: number | undefined): number {
  if (
    configuredLimit === undefined ||
    !Number.isSafeInteger(configuredLimit) ||
    configuredLimit < 1
  ) {
    return defaultContextMessageLimit;
  }

  return Math.min(configuredLimit, maximumContextMessageLimit);
}

export function selectBoundedChatContext(input: ExtractionInput): ExtractionMessage[] {
  if (input.message.chatId !== input.chatId) {
    throw new Error('Extraction message must belong to the requested chat');
  }

  const currentAndRecentMessages = [...input.recentMessages, input.message];
  const selectedById = new Map<string, ExtractionMessage>();

  for (const message of currentAndRecentMessages) {
    if (message.chatId === input.chatId) {
      selectedById.set(message.id, message);
    }
  }

  return [...selectedById.values()].sort(compareMessagesBySentAt).slice(-contextLimit(input.maxContextMessages));
}
