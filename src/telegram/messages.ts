import { createHmac } from 'node:crypto';

export type InlineKeyboardMarkup = Readonly<{
  inline_keyboard: InlineKeyboardButton[][];
}>;

export type InlineKeyboardButton = Readonly<{
  callback_data: string;
  text: string;
}>;

export type SuggestionCard = Readonly<{
  dueDateText: string | null;
  id: string;
  title: string;
}>;

type SuggestionAction = 'confirm' | 'edit' | 'reject';

function createSignedCallback(action: SuggestionAction, suggestionId: string, callbackSigningSecret: string): string {
  const signature = createHmac('sha256', callbackSigningSecret)
    .update(`v1:${action}:${suggestionId}`)
    .digest('base64url')
    .slice(0, 16);
  const callbackData = `kw:${action}:${suggestionId}:${signature}`;

  if (Buffer.byteLength(callbackData, 'utf8') > 64) {
    throw new Error('Suggestion callback data exceeds Telegram\'s 64-byte limit');
  }

  return callbackData;
}

export function renderSuggestion(
  suggestion: SuggestionCard,
  callbackSigningSecret: string,
): Readonly<{
  replyMarkup: InlineKeyboardMarkup;
  text: string;
}> {
  const dueDateText = suggestion.dueDateText?.trim();
  const dueLine = dueDateText ? `\nСрок: ${dueDateText}` : '';

  return {
    replyMarkup: {
      inline_keyboard: [
        [
          { callback_data: createSignedCallback('confirm', suggestion.id, callbackSigningSecret), text: 'Подтвердить' },
          { callback_data: createSignedCallback('edit', suggestion.id, callbackSigningSecret), text: 'Изменить' },
          { callback_data: createSignedCallback('reject', suggestion.id, callbackSigningSecret), text: 'Не фиксировать' },
        ],
      ],
    },
    text: `📌 Keepword заметил договорённость\n\n${suggestion.title}${dueLine}`,
  };
}
