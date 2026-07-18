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

export const onboardingCardText = [
  '👋 Keepword подключён',
  '',
  'Я замечаю рабочие договорённости только в новых сообщениях после подключения и помогаю не терять их.',
  '',
  'Я не создаю задачи молча: каждая договорённость должна быть подтверждена автором или администратором.',
  '',
  'Чтобы получать личные напоминания и вечерние сводки, подключите личные уведомления.',
].join('\n');

export function renderOnboardingConnected(chatTitle: string): string {
  return [
    '✅ Уведомления подключены',
    '',
    'Теперь я смогу отправлять вам напоминания о задачах, уведомления о просрочках и личную вечернюю сводку.',
    '',
    `Группа: ${chatTitle}`,
  ].join('\n');
}

export const onboardingHelpText = 'Чтобы подключить уведомления, откройте ссылку приглашения из нужной группы.';

export const onboardingTokenUnavailableText = 'Эта ссылка больше не действует. Попросите администратора отправить новое приглашение.';

export const notificationStatusSentText = 'Статус уведомлений отправлен вам в личный чат.';

export const notificationStatusPrivateChatRequiredText = 'Откройте личный чат с Keepword и нажмите Start, чтобы получить статус уведомлений.';

export function renderNotificationInvite(name: string | null): string {
  const recipient = name ? `@${name}` : 'Коллега';
  return `🔔 ${recipient}, чтобы получать личные напоминания и вечернюю сводку, подключите Keepword.`;
}

export function renderNotificationStatus(input: Readonly<{
  connected: number;
  notConnected: readonly string[];
}>): string {
  const missing = input.notConnected.length > 0
    ? input.notConnected.map((name) => `— ${name}`).join('\n')
    : '— нет';
  return `🔔 Notification status\n\nConnected: ${input.connected}\nNot connected: ${input.notConnected.length}\n\nWithout notifications:\n${missing}`;
}

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

export function renderPrivateSuggestionText(suggestionText: string): string {
  return suggestionText.replace('📌 Keepword заметил договорённость', '📌 Я нашёл обязательство');
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
