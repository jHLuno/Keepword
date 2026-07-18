import { createSignedCallback } from './callback-data.js';

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

export type SuggestionCallbackNonces = Readonly<Record<SuggestionAction, string>>;

type CommitmentAction = 'block' | 'cancel' | 'complete' | 'open' | 'reschedule';

export type CommitmentCallbackNonces = Readonly<Record<CommitmentAction, string>>;

export function renderSuggestion(
  suggestion: SuggestionCard,
  callbackNonces: SuggestionCallbackNonces,
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
          { callback_data: createSignedCallback('confirm', callbackNonces.confirm, callbackSigningSecret), text: 'Подтвердить' },
          { callback_data: createSignedCallback('edit', callbackNonces.edit, callbackSigningSecret), text: 'Изменить' },
          { callback_data: createSignedCallback('reject', callbackNonces.reject, callbackSigningSecret), text: 'Не фиксировать' },
        ],
      ],
    },
    text: `📌 Keepword заметил договорённость\n\n${suggestion.title}${dueLine}`,
  };
}

export function renderCommitmentActions(
  status: 'blocked' | 'open' | 'overdue',
  callbackNonces: CommitmentCallbackNonces,
  callbackSigningSecret: string,
): InlineKeyboardMarkup {
  const firstRow = [
    { callback_data: createSignedCallback('complete', callbackNonces.complete, callbackSigningSecret), text: 'Готово' },
    { callback_data: createSignedCallback('block', callbackNonces.block, callbackSigningSecret), text: 'Есть блокер' },
    { callback_data: createSignedCallback('cancel', callbackNonces.cancel, callbackSigningSecret), text: 'Отменить' },
  ];
  if (status === 'blocked') {
    return {
      inline_keyboard: [
        firstRow,
        [{ callback_data: createSignedCallback('open', callbackNonces.open, callbackSigningSecret), text: 'Возобновить' }],
      ],
    };
  }
  return {
    inline_keyboard: [
      firstRow,
      [{ callback_data: createSignedCallback('reschedule', callbackNonces.reschedule, callbackSigningSecret), text: 'Перенести срок' }],
    ],
  };
}
