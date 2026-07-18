import { createHmac, randomBytes } from 'node:crypto';

export type InlineKeyboardMarkup = Readonly<{
  inline_keyboard: InlineKeyboardButton[][];
}>;

export type InlineKeyboardButton = Readonly<{
  callback_data: string;
  text: string;
}>;

export type SuggestionCard = Readonly<{
  dueDateText: string | null;
  title: string;
}>;

const callbackSigningKey = randomBytes(32);

function createSignedCallback(action: 'confirm' | 'edit' | 'reject'): string {
  const nonce = randomBytes(9).toString('base64url');
  const signature = createHmac('sha256', callbackSigningKey)
    .update(`${action}:${nonce}`)
    .digest('base64url')
    .slice(0, 16);

  return `kw:${action}:${nonce}.${signature}`;
}

export function renderSuggestion(suggestion: SuggestionCard): Readonly<{
  replyMarkup: InlineKeyboardMarkup;
  text: string;
}> {
  const dueLine = suggestion.dueDateText ? `\nСрок: ${suggestion.dueDateText}` : '';

  return {
    replyMarkup: {
      inline_keyboard: [
        [
          { callback_data: createSignedCallback('confirm'), text: 'Подтвердить' },
          { callback_data: createSignedCallback('edit'), text: 'Изменить' },
          { callback_data: createSignedCallback('reject'), text: 'Не фиксировать' },
        ],
      ],
    },
    text: `📌 Keepword заметил договорённость\n\n${suggestion.title}${dueLine}`,
  };
}
