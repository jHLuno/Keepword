import { createSignedCallback } from './callback-data.js';
import type { DigestSummary, TeamRiskSummary } from '../services/send-digest.js';
import type { ReliabilitySummary } from '../repositories/reliability.js';

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

export type PrivateCheckItem = Readonly<{
  callbacks?: Readonly<Pick<CommitmentCallbackNonces, 'block' | 'complete' | 'reschedule'>>;
  chatTitle: string;
  dueDateText: string | null;
  status: 'blocked' | 'open' | 'overdue';
  title: string;
}>;

export type ReminderCard = Readonly<{
  dueDateText: string | null;
  status: 'open' | 'overdue';
  title: string;
}>;

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

export function renderPrivateCheck(input: Readonly<{
  items: readonly PrivateCheckItem[];
  nextPageCallback?: string | undefined;
  previousPageCallback?: string | undefined;
  reliability?: ReliabilitySummary | null;
}>): Readonly<{ replyMarkup?: InlineKeyboardMarkup; text: string }> {
  const sections: ReadonlyArray<Readonly<{ heading: string; status: PrivateCheckItem['status'] }>> = [
    { heading: '🔴 Просрочены', status: 'overdue' },
    { heading: '🟡 Открытые', status: 'open' },
    { heading: '🟠 Есть блокер', status: 'blocked' },
  ];
  const renderedSections = sections.flatMap(({ heading, status }) => {
    const tasks = input.items.filter((item) => item.status === status);
    if (tasks.length === 0) {
      return [];
    }
    return [`${heading}\n${tasks.map((task) => `— [${task.chatTitle}] ${task.title}${task.dueDateText ? ` · ${task.dueDateText}` : ''}`).join('\n')}`];
  });
  const reliability = input.reliability
    ? [
      '🤝 Моя надёжность · последние 30 дней',
      `Вовремя: ${input.reliability.onTime}/${input.reliability.eligible} · С опозданием: ${input.reliability.late} · Риск: ${input.reliability.overdue}`,
    ].join('\n')
    : null;
  const content = [
    renderedSections.length === 0 ? '— активных обязательств нет' : renderedSections.join('\n\n'),
    reliability,
  ].filter((section): section is string => Boolean(section)).join('\n\n');
  const text = `📋 Мои обязательства\n\n${content}`;
  if (input.items.length === 0) {
    return { text };
  }
  const inlineKeyboard = input.items.flatMap((item) => item.callbacks ? [[
    { callback_data: item.callbacks.complete, text: 'Готово' },
    { callback_data: item.callbacks.block, text: 'Есть блокер' },
    { callback_data: item.callbacks.reschedule, text: 'Перенести срок' },
  ]] : []);
  const navigation = [
    ...(input.previousPageCallback ? [{ callback_data: input.previousPageCallback, text: '◀ Назад' }] : []),
    ...(input.nextPageCallback ? [{ callback_data: input.nextPageCallback, text: 'Вперёд ▶' }] : []),
  ];
  if (navigation.length > 0) {
    inlineKeyboard.push(navigation);
  }
  return inlineKeyboard.length > 0 ? { replyMarkup: { inline_keyboard: inlineKeyboard }, text } : { text };
}

export function renderReminderCard(
  reminder: ReminderCard,
  callbackNonces: Readonly<Pick<CommitmentCallbackNonces, 'block' | 'cancel' | 'complete' | 'reschedule'>>,
  callbackSigningSecret: string,
): Readonly<{
  replyMarkup: InlineKeyboardMarkup;
  text: string;
}> {
  const dueLine = reminder.dueDateText?.trim() ? `\nСрок: ${reminder.dueDateText.trim()}` : '';
  const heading = reminder.status === 'overdue'
    ? '⚠️ Срок обязательства истёк'
    : '⏰ Напоминание о договорённости';
  return {
    replyMarkup: renderCommitmentActions(reminder.status, {
      block: callbackNonces.block,
      cancel: callbackNonces.cancel,
      complete: callbackNonces.complete,
      open: callbackNonces.complete,
      reschedule: callbackNonces.reschedule,
    }, callbackSigningSecret),
    text: `${heading}\n\n${reminder.title}${dueLine}`,
  };
}

function attentionLabel(attention: DigestSummary['items'][number]['attention']): string {
  switch (attention) {
    case 'due-today':
      return 'Срок: сегодня';
    case 'due-tomorrow':
      return 'Срок: завтра';
    case 'no-deadline':
      return 'Нет срока';
    case 'overdue':
      return 'Просрочено';
  }
}

export function renderUserDigest(summary: DigestSummary): string {
  const items = summary.items.length === 0
    ? '— нет задач, требующих внимания'
    : summary.items.map((item) => `— ${item.title}\n  ${attentionLabel(item.attention)}`).join('\n');
  return [
    '📋 Личная вечерняя сводка',
    '',
    `Выполнено сегодня: ${summary.completedToday}`,
    `Открыто: ${summary.open}`,
    `Просрочено: ${summary.overdue}`,
    `На завтра: ${summary.dueTomorrow}`,
    '',
    'Требуют внимания:',
    items,
  ].join('\n');
}

export function renderAdminDigest(summary: TeamRiskSummary): string {
  const risks = summary.riskTitles.length === 0
    ? '— рисков нет'
    : summary.riskTitles.map((title) => `— ${title}`).join('\n');
  const review = summary.reviewTitles.length === 0
    ? '— нет кандидатов'
    : summary.reviewTitles.map((title) => `— ${title}`).join('\n');
  const calibration = summary.calibration
    ? [
      '',
      'Точность Keepword · последние 90 дней',
      `Без правок: ${summary.calibration.acceptedAsProposed} (${Math.round(summary.calibration.acceptedAsProposed / summary.calibration.resolved * 100)}%)`,
      `После правок: ${summary.calibration.editedBeforeConfirmation} (${Math.round(summary.calibration.editedBeforeConfirmation / summary.calibration.resolved * 100)}%)`,
      `Отклонено: ${summary.calibration.rejected} (${Math.round(summary.calibration.rejected / summary.calibration.resolved * 100)}%)`,
    ]
    : [];
  const reliability = summary.reliability && summary.reliability.length > 0
    ? [
      '',
      '🤝 Надёжность · последние 30 дней',
      ...summary.reliability.map((line) =>
        `— ${line.firstName}: ${line.onTime}/${line.eligible} вовремя · ${line.late} с опозданием · ${line.overdue} риск`,
      ),
    ]
    : [];
  return [
    '📊 Риски команды',
    '',
    `Выполнено сегодня: ${summary.completedToday}`,
    `Открыто: ${summary.open}`,
    `Просрочено: ${summary.overdue}`,
    `На завтра: ${summary.dueTomorrow}`,
    '',
    'Задачи с риском:',
    risks,
    '',
    'На проверку:',
    review,
    ...calibration,
    ...reliability,
  ].join('\n');
}
