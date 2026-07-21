import { createSignedCallback } from './callback-data.js';
import { defaultLocale, locales, normalizeLocale, type Locale } from '../i18n/index.js';
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

type AttentionLabel = DigestSummary['items'][number]['attention'];

type Strings = Readonly<{
  onboardingCard: readonly string[];
  onboardingConnected: (chatTitle: string) => readonly string[];
  onboardingHelp: string;
  onboardingTokenUnavailable: string;
  notificationStatusSent: string;
  notificationStatusPrivateChatRequired: string;
  notificationInvite: (recipient: string) => string;
  notificationColleague: string;
  notificationStatusTitle: string;
  notificationStatusConnected: string;
  notificationStatusNotConnected: string;
  notificationStatusWithout: string;
  notificationStatusNone: string;
  clarification: string;
  toastUnavailable: string;
  toastUnauthorized: string;
  toastPageUpdated: string;
  toastStatusUpdated: string;
  toastCommitmentSaved: string;
  feedbackCommitmentSaved: string;
  toastCommitmentRejected: string;
  promptReschedule: string;
  promptEdit: string;
  promptGroupEdit: string;
  editInstructions: string;
  groupEditInstructions: string;
  suggestionHeading: string;
  privateSuggestionHeading: string;
  dueLabel: string;
  btnConfirm: string;
  btnEdit: string;
  btnReject: string;
  btnComplete: string;
  btnBlock: string;
  btnCancel: string;
  btnReopen: string;
  btnReschedule: string;
  reminderDueHeading: string;
  reminderOverdueHeading: string;
  checkTitle: string;
  checkOverdue: string;
  checkOpen: string;
  checkBlocked: string;
  checkEmpty: string;
  reliabilitySelfHeading: string;
  reliabilityLine: (input: Readonly<{ eligible: number; late: number; onTime: number; overdue: number }>) => string;
  navPrevious: string;
  navNext: string;
  userDigestTitle: string;
  labelCompletedToday: string;
  labelOpen: string;
  labelOverdue: string;
  labelDueTomorrow: string;
  labelNeedsAttention: string;
  userDigestNoAttention: string;
  attention: (attention: AttentionLabel) => string;
  adminDigestTitle: string;
  labelTasksAtRisk: string;
  labelToReview: string;
  adminNoRisks: string;
  adminNoReview: string;
  calibrationHeading: string;
  calibrationAccepted: string;
  calibrationEdited: string;
  calibrationRejected: string;
  reliabilityTeamHeading: string;
  reliabilityTeamLine: (input: Readonly<{ eligible: number; firstName: string; late: number; onTime: number; overdue: number }>) => string;
  groupHelp: string;
  settingsModeSaved: (label: string) => string;
  settingsModeUnauthorized: string;
  settingsModeUsage: string;
  commandInPrivate: string;
  privacyDeleted: string;
  privacyDeleteUnauthorized: string;
  groupPrivacyInfo: string;
  keepUsage: string;
  notificationsAdminOnly: string;
  manualCaptureConnectFirst: string;
  rescheduleUsage: string;
  rescheduleSaved: string;
  rescheduleFailed: string;
  reschedulePastDue: string;
  editSaved: string;
  editFailed: string;
  privateHelp: readonly string[];
  commandGroupOnly: string;
  connectFirst: string;
  privacyInfoPrivate: string;
  tasksChoose: string;
  tasksEmpty: string;
  settingsNotifTitle: string;
  settingsNoGroups: string;
  statusOn: string;
  statusOff: string;
  settingsNotifUsage: string;
  settingsChoose: string;
  settingsUpdated: (title: string, enabled: boolean) => string;
  settingsLanguageSaved: (value: string) => string;
  settingsTimezoneSaved: (value: string) => string;
  settingsDigestSaved: (value: string) => string;
  settingsInvalidLanguage: string;
  settingsInvalidTimezone: string;
  settingsInvalidDigest: string;
  onboardingButton: string;
  notificationInviteButton: string;
}>;

const catalog: Record<Locale, Strings> = {
  en: {
    onboardingCard: [
      '👋 Keepword connected',
      '',
      'I notice work commitments only in new messages after I am connected, and help the team keep them.',
      '',
      'I never create tasks silently: every commitment must be confirmed by its author or an administrator.',
      '',
      'To get personal reminders and evening summaries, connect private notifications.',
    ],
    onboardingConnected: (chatTitle) => [
      '✅ Notifications connected',
      '',
      'Now I can send you task reminders, overdue alerts, and your personal evening summary.',
      '',
      `Group: ${chatTitle}`,
    ],
    onboardingHelp: 'To connect notifications, open the invitation link from the group you need.',
    onboardingTokenUnavailable: 'This link is no longer valid. Ask an administrator to send a new invitation.',
    notificationStatusSent: 'The notification status was sent to your private chat.',
    notificationStatusPrivateChatRequired: 'Open a private chat with Keepword and press Start to receive the notification status.',
    notificationInvite: (recipient) => `🔔 ${recipient}, connect Keepword to get personal reminders and the evening summary.`,
    notificationColleague: 'Colleague',
    notificationStatusTitle: '🔔 Notification status',
    notificationStatusConnected: 'Connected',
    notificationStatusNotConnected: 'Not connected',
    notificationStatusWithout: 'Without notifications:',
    notificationStatusNone: '— none',
    clarification: 'This looks like a commitment. Who owns it and by when?',
    toastUnavailable: 'Action unavailable.',
    toastUnauthorized: 'You do not have permission for this action.',
    toastPageUpdated: 'Page updated.',
    toastStatusUpdated: 'Task status updated.',
    toastCommitmentSaved: 'Commitment saved.',
    feedbackCommitmentSaved: '✅ Commitment saved.',
    toastCommitmentRejected: 'The commitment will not be saved.',
    promptReschedule: 'In your private chat with Keepword, send the new deadline — e.g. "today 22:00", "tomorrow 18:00", or "2026-07-20 22:00".',
    promptEdit: 'In your private chat with Keepword, send e.g. "due: tomorrow 18:00" or "title: New title" — one field per line.',
    promptGroupEdit: 'Reply to the instruction in this group.',
    editInstructions: [
      'To edit, send the changed fields in this chat, one per line:',
      '',
      'title: New title',
      'due: tomorrow 18:00   (or "friday", "2026-07-20 22:00")',
      'description: extra details   (send "-" to clear)',
      '',
      'You can send just one line.',
    ].join('\n'),
    groupEditInstructions: [
      'Reply to this message with the fields to change:',
      '',
      'title: New title',
      'due: tomorrow 18:00',
      'description: extra details',
      '',
      'You can send just one line.',
    ].join('\n'),
    suggestionHeading: '📌 Keepword spotted a commitment',
    privateSuggestionHeading: '📌 I found a commitment',
    dueLabel: 'Due',
    btnConfirm: 'Confirm',
    btnEdit: 'Edit',
    btnReject: 'Skip',
    btnComplete: 'Done',
    btnBlock: 'Blocked',
    btnCancel: 'Cancel',
    btnReopen: 'Reopen',
    btnReschedule: 'Reschedule',
    reminderDueHeading: '⏰ Commitment reminder',
    reminderOverdueHeading: '⚠️ Commitment overdue',
    checkTitle: '📋 My commitments',
    checkOverdue: '🔴 Overdue',
    checkOpen: '🟡 Open',
    checkBlocked: '🟠 Blocked',
    checkEmpty: '— no active commitments',
    reliabilitySelfHeading: '🤝 My reliability · last 30 days',
    reliabilityLine: (r) => `On time: ${r.onTime}/${r.eligible} · Late: ${r.late} · At risk: ${r.overdue}`,
    navPrevious: '◀ Back',
    navNext: 'Next ▶',
    userDigestTitle: '📋 Personal evening summary',
    labelCompletedToday: 'Completed today',
    labelOpen: 'Open',
    labelOverdue: 'Overdue',
    labelDueTomorrow: 'Due tomorrow',
    labelNeedsAttention: 'Needs attention:',
    userDigestNoAttention: '— nothing needs attention',
    attention: (attention) => ({
      'due-today': 'Due: today',
      'due-tomorrow': 'Due: tomorrow',
      'no-deadline': 'No deadline',
      overdue: 'Overdue',
    })[attention],
    adminDigestTitle: '📊 Team risks',
    labelTasksAtRisk: 'Tasks at risk:',
    labelToReview: 'To review:',
    adminNoRisks: '— no risks',
    adminNoReview: '— no candidates',
    calibrationHeading: 'Keepword accuracy · last 90 days',
    calibrationAccepted: 'As proposed',
    calibrationEdited: 'After edits',
    calibrationRejected: 'Rejected',
    reliabilityTeamHeading: '🤝 Reliability · last 30 days',
    reliabilityTeamLine: (r) => `— ${r.firstName}: ${r.onTime}/${r.eligible} on time · ${r.late} late · ${r.overdue} at risk`,
    groupHelp: 'Group commands: reply /keep to a message, /invite, /notifications. Private commands: /tasks, /check, /settings, /privacy.',
    settingsModeSaved: (label) => `Keepword mode: ${label}.`,
    settingsModeUnauthorized: 'Only a current chat administrator can change the Keepword mode.',
    settingsModeUsage: 'Use: /settings mode suggest|manual|silent_digest, /settings language auto|en|ru|es, /settings timezone <IANA>, /settings digest HH:MM',
    commandInPrivate: 'This command works in a private chat with Keepword.',
    privacyDeleted: 'Keepword data for this chat has been deleted.',
    privacyDeleteUnauthorized: 'Only a current chat administrator can delete Keepword data.',
    groupPrivacyInfo: 'Keepword analyzes only new messages after it is connected. A current administrator can delete the data with /privacy delete.',
    keepUsage: 'Reply /keep to a message that contains a commitment.',
    notificationsAdminOnly: 'Only a chat administrator can manage notifications.',
    manualCaptureConnectFirst: 'Connect notifications for one group to save this commitment.',
    rescheduleUsage: 'Send the new deadline, e.g. "today 22:00", "tomorrow 18:00", "friday", or "2026-07-20 22:00".',
    rescheduleSaved: 'New deadline saved.',
    rescheduleFailed: 'Could not read that deadline. Send a future time like "today 22:00", "tomorrow 18:00", or "2026-07-20 22:00".',
    reschedulePastDue: 'That time has already passed. Send a future time like "today 22:00" or "tomorrow 18:00".',
    editSaved: 'Changes saved. Confirm the card in the group.',
    editFailed: 'Could not apply the changes. Open the card again.',
    privateHelp: [
      'Keepword helps you keep confirmed commitments.',
      '',
      '/tasks — my tasks in a connected group',
      '/check — my commitments across all connected groups',
      '/settings on|off [number] — personal notifications',
      '/privacy — how data is handled; deletion: /privacy delete in the group by a current administrator',
      '',
      'Forward a message with a promise — I will offer a card to confirm.',
    ],
    commandGroupOnly: 'Use this command in a connected Keepword group.',
    connectFirst: 'First connect notifications via the link from the group you need.',
    privacyInfoPrivate: 'I process only new messages from connected groups and store the source for a confirmed task. To delete data, a current administrator sends /privacy delete in the group.',
    tasksChoose: 'Choose a group: /tasks <number>',
    tasksEmpty: '— no open tasks',
    settingsNotifTitle: '🔔 Personal notifications',
    settingsNoGroups: 'No connected groups.',
    statusOn: 'on',
    statusOff: 'off',
    settingsNotifUsage: 'Use: /settings on|off [number]',
    settingsChoose: 'Choose a group: /settings on|off <number>',
    settingsUpdated: (title, enabled) => `Personal notifications for “${title}” ${enabled ? 'enabled' : 'disabled'}.`,
    settingsLanguageSaved: (value) => `Keepword language: ${value}.`,
    settingsTimezoneSaved: (value) => `Time zone: ${value}.`,
    settingsDigestSaved: (value) => `Daily summary time: ${value}.`,
    settingsInvalidLanguage: 'Use: /settings language auto|en|ru|es',
    settingsInvalidTimezone: 'Provide a valid IANA time zone, e.g. /settings timezone Europe/Madrid',
    settingsInvalidDigest: 'Provide the daily summary time as HH:MM, e.g. /settings digest 18:00',
    onboardingButton: '🔔 Connect notifications',
    notificationInviteButton: 'Connect notifications',
  },
  ru: {
    onboardingCard: [
      '👋 Keepword подключён',
      '',
      'Я замечаю рабочие договорённости только в новых сообщениях после подключения и помогаю не терять их.',
      '',
      'Я не создаю задачи молча: каждая договорённость должна быть подтверждена автором или администратором.',
      '',
      'Чтобы получать личные напоминания и вечерние сводки, подключите личные уведомления.',
    ],
    onboardingConnected: (chatTitle) => [
      '✅ Уведомления подключены',
      '',
      'Теперь я смогу отправлять вам напоминания о задачах, уведомления о просрочках и личную вечернюю сводку.',
      '',
      `Группа: ${chatTitle}`,
    ],
    onboardingHelp: 'Чтобы подключить уведомления, откройте ссылку приглашения из нужной группы.',
    onboardingTokenUnavailable: 'Эта ссылка больше не действует. Попросите администратора отправить новое приглашение.',
    notificationStatusSent: 'Статус уведомлений отправлен вам в личный чат.',
    notificationStatusPrivateChatRequired: 'Откройте личный чат с Keepword и нажмите Start, чтобы получить статус уведомлений.',
    notificationInvite: (recipient) => `🔔 ${recipient}, чтобы получать личные напоминания и вечернюю сводку, подключите Keepword.`,
    notificationColleague: 'Коллега',
    notificationStatusTitle: '🔔 Notification status',
    notificationStatusConnected: 'Connected',
    notificationStatusNotConnected: 'Not connected',
    notificationStatusWithout: 'Without notifications:',
    notificationStatusNone: '— нет',
    clarification: 'Похоже, это договорённость. Кто отвечает и к какому сроку?',
    toastUnavailable: 'Действие недоступно.',
    toastUnauthorized: 'У вас нет прав на это действие.',
    toastPageUpdated: 'Страница обновлена.',
    toastStatusUpdated: 'Статус задачи обновлён.',
    toastCommitmentSaved: 'Договорённость сохранена.',
    feedbackCommitmentSaved: '✅ Договорённость сохранена.',
    toastCommitmentRejected: 'Договорённость не будет сохранена.',
    promptReschedule: 'В личном чате с Keepword отправьте новый срок — например «сегодня 22:00», «завтра 18:00» или «2026-07-20 22:00».',
    promptEdit: 'В личном чате с Keepword отправьте, например «due: завтра 18:00» или «title: Новый заголовок» — по одному полю в строке.',
    promptGroupEdit: 'Ответьте на инструкцию в этой группе.',
    editInstructions: [
      'Чтобы изменить, отправьте нужные поля в этом чате, по одному в строке:',
      '',
      'title: Новый заголовок',
      'due: завтра 18:00   (или «в пятницу», «2026-07-20 22:00»)',
      'description: детали   (отправьте «-», чтобы очистить)',
      '',
      'Можно отправить только одну строку.',
    ].join('\n'),
    groupEditInstructions: [
      'Ответьте на это сообщение полями, которые нужно изменить:',
      '',
      'название: Новый заголовок',
      'срок: завтра 18:00',
      'описание: детали',
      '',
      'Можно отправить только одну строку.',
    ].join('\n'),
    suggestionHeading: '📌 Keepword заметил договорённость',
    privateSuggestionHeading: '📌 Я нашёл обязательство',
    dueLabel: 'Срок',
    btnConfirm: 'Подтвердить',
    btnEdit: 'Изменить',
    btnReject: 'Не фиксировать',
    btnComplete: 'Готово',
    btnBlock: 'Есть блокер',
    btnCancel: 'Отменить',
    btnReopen: 'Возобновить',
    btnReschedule: 'Перенести срок',
    reminderDueHeading: '⏰ Напоминание о договорённости',
    reminderOverdueHeading: '⚠️ Срок обязательства истёк',
    checkTitle: '📋 Мои обязательства',
    checkOverdue: '🔴 Просрочены',
    checkOpen: '🟡 Открытые',
    checkBlocked: '🟠 Есть блокер',
    checkEmpty: '— активных обязательств нет',
    reliabilitySelfHeading: '🤝 Моя надёжность · последние 30 дней',
    reliabilityLine: (r) => `Вовремя: ${r.onTime}/${r.eligible} · С опозданием: ${r.late} · Риск: ${r.overdue}`,
    navPrevious: '◀ Назад',
    navNext: 'Вперёд ▶',
    userDigestTitle: '📋 Личная вечерняя сводка',
    labelCompletedToday: 'Выполнено сегодня',
    labelOpen: 'Открыто',
    labelOverdue: 'Просрочено',
    labelDueTomorrow: 'На завтра',
    labelNeedsAttention: 'Требуют внимания:',
    userDigestNoAttention: '— нет задач, требующих внимания',
    attention: (attention) => ({
      'due-today': 'Срок: сегодня',
      'due-tomorrow': 'Срок: завтра',
      'no-deadline': 'Нет срока',
      overdue: 'Просрочено',
    })[attention],
    adminDigestTitle: '📊 Риски команды',
    labelTasksAtRisk: 'Задачи с риском:',
    labelToReview: 'На проверку:',
    adminNoRisks: '— рисков нет',
    adminNoReview: '— нет кандидатов',
    calibrationHeading: 'Точность Keepword · последние 90 дней',
    calibrationAccepted: 'Без правок',
    calibrationEdited: 'После правок',
    calibrationRejected: 'Отклонено',
    reliabilityTeamHeading: '🤝 Надёжность · последние 30 дней',
    reliabilityTeamLine: (r) => `— ${r.firstName}: ${r.onTime}/${r.eligible} вовремя · ${r.late} с опозданием · ${r.overdue} риск`,
    groupHelp: 'Команды группы: /keep ответом на сообщение, /invite, /notifications. Личные команды: /tasks, /check, /settings, /privacy.',
    settingsModeSaved: (label) => `Режим Keepword: ${label}.`,
    settingsModeUnauthorized: 'Только текущий администратор чата может менять режим Keepword.',
    settingsModeUsage: 'Используйте: /settings mode suggest|manual|silent_digest, /settings language auto|en|ru|es, /settings timezone <IANA>, /settings digest HH:MM',
    commandInPrivate: 'Эта команда работает в личном чате с Keepword.',
    privacyDeleted: 'Данные Keepword для этого чата удалены.',
    privacyDeleteUnauthorized: 'Только текущий администратор чата может удалить данные Keepword.',
    groupPrivacyInfo: 'Keepword анализирует только новые сообщения после подключения. Текущий администратор может удалить данные командой /privacy delete.',
    keepUsage: 'Ответьте командой /keep на сообщение с договорённостью.',
    notificationsAdminOnly: 'Только администратор чата может управлять уведомлениями.',
    manualCaptureConnectFirst: 'Подключите уведомления для одной группы, чтобы сохранить это обязательство.',
    rescheduleUsage: 'Отправьте новый срок, например «сегодня 22:00», «завтра 18:00», «в пятницу» или «2026-07-20 22:00».',
    rescheduleSaved: 'Новый срок сохранён.',
    rescheduleFailed: 'Не понял срок. Отправьте будущее время, например «сегодня 22:00», «завтра 18:00» или «2026-07-20 22:00».',
    reschedulePastDue: 'Это время уже прошло. Отправьте будущий срок, например «сегодня 22:00» или «завтра 18:00».',
    editSaved: 'Изменения сохранены. Подтвердите карточку в группе.',
    editFailed: 'Не удалось применить изменения. Откройте карточку заново.',
    privateHelp: [
      'Keepword помогает не терять подтверждённые договорённости.',
      '',
      '/tasks — мои задачи в подключённой группе',
      '/check — мои обязательства во всех подключённых группах',
      '/settings on|off [номер] — личные уведомления',
      '/privacy — как обрабатываются данные; удаление: /privacy delete в группе для текущего администратора',
      '',
      'Перешлите сообщение с обещанием — я предложу карточку для подтверждения.',
    ],
    commandGroupOnly: 'Используйте эту команду в подключённой группе Keepword.',
    connectFirst: 'Сначала подключите уведомления через ссылку из нужной группы.',
    privacyInfoPrivate: 'Я обрабатываю только новые сообщения подключённых групп и храню источник для подтверждённой задачи. Для удаления данных текущий администратор отправляет /privacy delete в нужной группе.',
    tasksChoose: 'Выберите группу: /tasks <номер>',
    tasksEmpty: '— открытых задач нет',
    settingsNotifTitle: '🔔 Личные уведомления',
    settingsNoGroups: 'Нет подключённых групп.',
    statusOn: 'вкл.',
    statusOff: 'выкл.',
    settingsNotifUsage: 'Используйте: /settings on|off [номер]',
    settingsChoose: 'Выберите группу: /settings on|off <номер>',
    settingsUpdated: (title, enabled) => `Личные уведомления для «${title}» ${enabled ? 'включены' : 'выключены'}.`,
    settingsLanguageSaved: (value) => `Язык Keepword: ${value}.`,
    settingsTimezoneSaved: (value) => `Часовой пояс: ${value}.`,
    settingsDigestSaved: (value) => `Время вечерней сводки: ${value}.`,
    settingsInvalidLanguage: 'Используйте: /settings language auto|en|ru|es',
    settingsInvalidTimezone: 'Укажите корректный IANA-часовой пояс, например /settings timezone Europe/Moscow',
    settingsInvalidDigest: 'Укажите время сводки в формате ЧЧ:ММ, например /settings digest 18:00',
    onboardingButton: '🔔 Подключить уведомления',
    notificationInviteButton: 'Подключить уведомления',
  },
  es: {
    onboardingCard: [
      '👋 Keepword conectado',
      '',
      'Detecto compromisos de trabajo solo en los mensajes nuevos tras conectarme y ayudo al equipo a no perderlos.',
      '',
      'Nunca creo tareas en silencio: cada compromiso debe confirmarlo su autor o un administrador.',
      '',
      'Para recibir recordatorios personales y resúmenes de la tarde, conecta las notificaciones privadas.',
    ],
    onboardingConnected: (chatTitle) => [
      '✅ Notificaciones conectadas',
      '',
      'Ahora puedo enviarte recordatorios de tareas, avisos de vencimiento y tu resumen personal de la tarde.',
      '',
      `Grupo: ${chatTitle}`,
    ],
    onboardingHelp: 'Para conectar las notificaciones, abre el enlace de invitación del grupo que necesites.',
    onboardingTokenUnavailable: 'Este enlace ya no es válido. Pide a un administrador que envíe una nueva invitación.',
    notificationStatusSent: 'El estado de las notificaciones se envió a tu chat privado.',
    notificationStatusPrivateChatRequired: 'Abre un chat privado con Keepword y pulsa Start para recibir el estado de las notificaciones.',
    notificationInvite: (recipient) => `🔔 ${recipient}, conecta Keepword para recibir recordatorios personales y el resumen de la tarde.`,
    notificationColleague: 'Colega',
    notificationStatusTitle: '🔔 Estado de notificaciones',
    notificationStatusConnected: 'Conectadas',
    notificationStatusNotConnected: 'Sin conectar',
    notificationStatusWithout: 'Sin notificaciones:',
    notificationStatusNone: '— ninguno',
    clarification: 'Esto parece un compromiso. ¿Quién lo asume y para cuándo?',
    toastUnavailable: 'Acción no disponible.',
    toastUnauthorized: 'No tienes permiso para esta acción.',
    toastPageUpdated: 'Página actualizada.',
    toastStatusUpdated: 'Estado de la tarea actualizado.',
    toastCommitmentSaved: 'Compromiso guardado.',
    feedbackCommitmentSaved: '✅ Compromiso guardado.',
    toastCommitmentRejected: 'El compromiso no se guardará.',
    promptReschedule: 'En tu chat privado con Keepword envía la nueva fecha — p. ej. «hoy 22:00», «mañana 18:00» o «2026-07-20 22:00».',
    promptEdit: 'En tu chat privado con Keepword envía p. ej. «due: mañana 18:00» o «title: Nuevo título» — un campo por línea.',
    promptGroupEdit: 'Responde a la instrucción en este grupo.',
    editInstructions: [
      'Para editar, envía los campos cambiados en este chat, uno por línea:',
      '',
      'title: Nuevo título',
      'due: mañana 18:00   (o «viernes», «2026-07-20 22:00»)',
      'description: detalles   (envía «-» para borrar)',
      '',
      'Puedes enviar una sola línea.',
    ].join('\n'),
    groupEditInstructions: [
      'Responde a este mensaje con los campos que quieres cambiar:',
      '',
      'title: Nuevo título',
      'due: mañana 18:00',
      'description: detalles',
      '',
      'Puedes enviar solo una línea.',
    ].join('\n'),
    suggestionHeading: '📌 Keepword detectó un compromiso',
    privateSuggestionHeading: '📌 Encontré un compromiso',
    dueLabel: 'Fecha límite',
    btnConfirm: 'Confirmar',
    btnEdit: 'Editar',
    btnReject: 'Descartar',
    btnComplete: 'Hecho',
    btnBlock: 'Bloqueado',
    btnCancel: 'Cancelar',
    btnReopen: 'Reabrir',
    btnReschedule: 'Reprogramar',
    reminderDueHeading: '⏰ Recordatorio de compromiso',
    reminderOverdueHeading: '⚠️ Compromiso vencido',
    checkTitle: '📋 Mis compromisos',
    checkOverdue: '🔴 Vencidos',
    checkOpen: '🟡 Abiertos',
    checkBlocked: '🟠 Bloqueados',
    checkEmpty: '— no hay compromisos activos',
    reliabilitySelfHeading: '🤝 Mi fiabilidad · últimos 30 días',
    reliabilityLine: (r) => `A tiempo: ${r.onTime}/${r.eligible} · Tarde: ${r.late} · En riesgo: ${r.overdue}`,
    navPrevious: '◀ Atrás',
    navNext: 'Siguiente ▶',
    userDigestTitle: '📋 Resumen personal de la tarde',
    labelCompletedToday: 'Completado hoy',
    labelOpen: 'Abierto',
    labelOverdue: 'Vencido',
    labelDueTomorrow: 'Para mañana',
    labelNeedsAttention: 'Requiere atención:',
    userDigestNoAttention: '— nada requiere atención',
    attention: (attention) => ({
      'due-today': 'Fecha: hoy',
      'due-tomorrow': 'Fecha: mañana',
      'no-deadline': 'Sin fecha límite',
      overdue: 'Vencido',
    })[attention],
    adminDigestTitle: '📊 Riesgos del equipo',
    labelTasksAtRisk: 'Tareas en riesgo:',
    labelToReview: 'Para revisar:',
    adminNoRisks: '— sin riesgos',
    adminNoReview: '— sin candidatos',
    calibrationHeading: 'Precisión de Keepword · últimos 90 días',
    calibrationAccepted: 'Sin cambios',
    calibrationEdited: 'Tras editar',
    calibrationRejected: 'Rechazados',
    reliabilityTeamHeading: '🤝 Fiabilidad · últimos 30 días',
    reliabilityTeamLine: (r) => `— ${r.firstName}: ${r.onTime}/${r.eligible} a tiempo · ${r.late} tarde · ${r.overdue} en riesgo`,
    groupHelp: 'Comandos de grupo: responde /keep a un mensaje, /invite, /notifications. Comandos privados: /tasks, /check, /settings, /privacy.',
    settingsModeSaved: (label) => `Modo de Keepword: ${label}.`,
    settingsModeUnauthorized: 'Solo un administrador actual del chat puede cambiar el modo de Keepword.',
    settingsModeUsage: 'Usa: /settings mode suggest|manual|silent_digest, /settings language auto|en|ru|es, /settings timezone <IANA>, /settings digest HH:MM',
    commandInPrivate: 'Este comando funciona en un chat privado con Keepword.',
    privacyDeleted: 'Los datos de Keepword para este chat se han eliminado.',
    privacyDeleteUnauthorized: 'Solo un administrador actual del chat puede eliminar los datos de Keepword.',
    groupPrivacyInfo: 'Keepword analiza solo los mensajes nuevos tras conectarse. Un administrador actual puede eliminar los datos con /privacy delete.',
    keepUsage: 'Responde /keep a un mensaje que contenga un compromiso.',
    notificationsAdminOnly: 'Solo un administrador del chat puede gestionar las notificaciones.',
    manualCaptureConnectFirst: 'Conecta las notificaciones de un grupo para guardar este compromiso.',
    rescheduleUsage: 'Envía la nueva fecha, p. ej. «hoy 22:00», «mañana 18:00», «viernes» o «2026-07-20 22:00».',
    rescheduleSaved: 'Nueva fecha límite guardada.',
    rescheduleFailed: 'No entendí la fecha. Envía una hora futura como «hoy 22:00», «mañana 18:00» o «2026-07-20 22:00».',
    reschedulePastDue: 'Esa hora ya pasó. Envía una fecha futura como «hoy 22:00» o «mañana 18:00».',
    editSaved: 'Cambios guardados. Confirma la tarjeta en el grupo.',
    editFailed: 'No se pudieron aplicar los cambios. Abre la tarjeta de nuevo.',
    privateHelp: [
      'Keepword te ayuda a no perder los compromisos confirmados.',
      '',
      '/tasks — mis tareas en un grupo conectado',
      '/check — mis compromisos en todos los grupos conectados',
      '/settings on|off [número] — notificaciones personales',
      '/privacy — cómo se tratan los datos; eliminación: /privacy delete en el grupo por un administrador actual',
      '',
      'Reenvía un mensaje con una promesa y te ofreceré una tarjeta para confirmar.',
    ],
    commandGroupOnly: 'Usa este comando en un grupo de Keepword conectado.',
    connectFirst: 'Primero conecta las notificaciones con el enlace del grupo que necesites.',
    privacyInfoPrivate: 'Solo proceso los mensajes nuevos de los grupos conectados y guardo la fuente de una tarea confirmada. Para eliminar datos, un administrador actual envía /privacy delete en el grupo.',
    tasksChoose: 'Elige un grupo: /tasks <número>',
    tasksEmpty: '— no hay tareas abiertas',
    settingsNotifTitle: '🔔 Notificaciones personales',
    settingsNoGroups: 'No hay grupos conectados.',
    statusOn: 'activadas',
    statusOff: 'desactivadas',
    settingsNotifUsage: 'Usa: /settings on|off [número]',
    settingsChoose: 'Elige un grupo: /settings on|off <número>',
    settingsUpdated: (title, enabled) => `Notificaciones personales para «${title}» ${enabled ? 'activadas' : 'desactivadas'}.`,
    settingsLanguageSaved: (value) => `Idioma de Keepword: ${value}.`,
    settingsTimezoneSaved: (value) => `Zona horaria: ${value}.`,
    settingsDigestSaved: (value) => `Hora del resumen diario: ${value}.`,
    settingsInvalidLanguage: 'Usa: /settings language auto|en|ru|es',
    settingsInvalidTimezone: 'Indica una zona horaria IANA válida, p. ej. /settings timezone Europe/Madrid',
    settingsInvalidDigest: 'Indica la hora del resumen como HH:MM, p. ej. /settings digest 18:00',
    onboardingButton: '🔔 Conectar notificaciones',
    notificationInviteButton: 'Conectar notificaciones',
  },
};

export function t(locale: Locale): Strings {
  return catalog[locale] ?? catalog[defaultLocale];
}

export function renderOnboardingCard(locale: Locale): string {
  return t(locale).onboardingCard.join('\n');
}

export function renderOnboardingConnected(locale: Locale, chatTitle: string): string {
  return t(locale).onboardingConnected(chatTitle).join('\n');
}

export function renderOnboardingHelp(locale: Locale): string {
  return t(locale).onboardingHelp;
}

export function renderOnboardingTokenUnavailable(locale: Locale): string {
  return t(locale).onboardingTokenUnavailable;
}

export function renderNotificationStatusSent(locale: Locale): string {
  return t(locale).notificationStatusSent;
}

export function renderNotificationStatusPrivateChatRequired(locale: Locale): string {
  return t(locale).notificationStatusPrivateChatRequired;
}

export function renderNotificationInvite(locale: Locale, name: string | null): string {
  const strings = t(locale);
  const recipient = name ? `@${name}` : strings.notificationColleague;
  return strings.notificationInvite(recipient);
}

export function renderNotificationStatus(locale: Locale, input: Readonly<{
  connected: number;
  notConnected: readonly string[];
}>): string {
  const strings = t(locale);
  const missing = input.notConnected.length > 0
    ? input.notConnected.map((name) => `— ${name}`).join('\n')
    : strings.notificationStatusNone;
  return `${strings.notificationStatusTitle}\n\n${strings.notificationStatusConnected}: ${input.connected}\n${strings.notificationStatusNotConnected}: ${input.notConnected.length}\n\n${strings.notificationStatusWithout}\n${missing}`;
}

export function renderSuggestion(
  locale: Locale,
  suggestion: SuggestionCard,
  callbackNonces: SuggestionCallbackNonces,
  callbackSigningSecret: string,
): Readonly<{
  replyMarkup: InlineKeyboardMarkup;
  text: string;
}> {
  const strings = t(locale);
  const dueDateText = suggestion.dueDateText?.trim();
  const dueLine = dueDateText ? `\n${strings.dueLabel}: ${dueDateText}` : '';

  return {
    replyMarkup: {
      inline_keyboard: [
        [
          { callback_data: createSignedCallback('confirm', callbackNonces.confirm, callbackSigningSecret), text: strings.btnConfirm },
          { callback_data: createSignedCallback('edit', callbackNonces.edit, callbackSigningSecret), text: strings.btnEdit },
          { callback_data: createSignedCallback('reject', callbackNonces.reject, callbackSigningSecret), text: strings.btnReject },
        ],
      ],
    },
    text: `${strings.suggestionHeading}\n\n${suggestion.title}${dueLine}`,
  };
}

export function renderPrivateSuggestionText(suggestionText: string): string {
  for (const locale of locales) {
    const strings = catalog[locale];
    if (suggestionText.includes(strings.suggestionHeading)) {
      return suggestionText.replace(strings.suggestionHeading, strings.privateSuggestionHeading);
    }
  }
  return suggestionText;
}

export function renderCommitmentActions(
  locale: Locale,
  status: 'blocked' | 'open' | 'overdue',
  callbackNonces: CommitmentCallbackNonces,
  callbackSigningSecret: string,
): InlineKeyboardMarkup {
  const strings = t(locale);
  const firstRow = [
    { callback_data: createSignedCallback('complete', callbackNonces.complete, callbackSigningSecret), text: strings.btnComplete },
    { callback_data: createSignedCallback('block', callbackNonces.block, callbackSigningSecret), text: strings.btnBlock },
    { callback_data: createSignedCallback('cancel', callbackNonces.cancel, callbackSigningSecret), text: strings.btnCancel },
  ];
  if (status === 'blocked') {
    return {
      inline_keyboard: [
        firstRow,
        [{ callback_data: createSignedCallback('open', callbackNonces.open, callbackSigningSecret), text: strings.btnReopen }],
      ],
    };
  }
  return {
    inline_keyboard: [
      firstRow,
      [{ callback_data: createSignedCallback('reschedule', callbackNonces.reschedule, callbackSigningSecret), text: strings.btnReschedule }],
    ],
  };
}

export function renderPrivateCheck(locale: Locale, input: Readonly<{
  items: readonly PrivateCheckItem[];
  nextPageCallback?: string | undefined;
  previousPageCallback?: string | undefined;
  reliability?: ReliabilitySummary | null;
}>): Readonly<{ replyMarkup?: InlineKeyboardMarkup; text: string }> {
  const strings = t(locale);
  const sections: ReadonlyArray<Readonly<{ heading: string; status: PrivateCheckItem['status'] }>> = [
    { heading: strings.checkOverdue, status: 'overdue' },
    { heading: strings.checkOpen, status: 'open' },
    { heading: strings.checkBlocked, status: 'blocked' },
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
      strings.reliabilitySelfHeading,
      strings.reliabilityLine(input.reliability),
    ].join('\n')
    : null;
  const content = [
    renderedSections.length === 0 ? strings.checkEmpty : renderedSections.join('\n\n'),
    reliability,
  ].filter((section): section is string => Boolean(section)).join('\n\n');
  const text = `${strings.checkTitle}\n\n${content}`;
  if (input.items.length === 0) {
    return { text };
  }
  const inlineKeyboard = input.items.flatMap((item) => item.callbacks ? [[
    { callback_data: item.callbacks.complete, text: strings.btnComplete },
    { callback_data: item.callbacks.block, text: strings.btnBlock },
    { callback_data: item.callbacks.reschedule, text: strings.btnReschedule },
  ]] : []);
  const navigation = [
    ...(input.previousPageCallback ? [{ callback_data: input.previousPageCallback, text: strings.navPrevious }] : []),
    ...(input.nextPageCallback ? [{ callback_data: input.nextPageCallback, text: strings.navNext }] : []),
  ];
  if (navigation.length > 0) {
    inlineKeyboard.push(navigation);
  }
  return inlineKeyboard.length > 0 ? { replyMarkup: { inline_keyboard: inlineKeyboard }, text } : { text };
}

export function renderReminderCard(
  locale: Locale,
  reminder: ReminderCard,
  callbackNonces: Readonly<Pick<CommitmentCallbackNonces, 'block' | 'cancel' | 'complete' | 'reschedule'>>,
  callbackSigningSecret: string,
): Readonly<{
  replyMarkup: InlineKeyboardMarkup;
  text: string;
}> {
  const strings = t(locale);
  const dueLine = reminder.dueDateText?.trim() ? `\n${strings.dueLabel}: ${reminder.dueDateText.trim()}` : '';
  const heading = reminder.status === 'overdue'
    ? strings.reminderOverdueHeading
    : strings.reminderDueHeading;
  return {
    replyMarkup: renderCommitmentActions(locale, reminder.status, {
      block: callbackNonces.block,
      cancel: callbackNonces.cancel,
      complete: callbackNonces.complete,
      open: callbackNonces.complete,
      reschedule: callbackNonces.reschedule,
    }, callbackSigningSecret),
    text: `${heading}\n\n${reminder.title}${dueLine}`,
  };
}

export function renderUserDigest(locale: Locale, summary: DigestSummary): string {
  const strings = t(locale);
  const items = summary.items.length === 0
    ? strings.userDigestNoAttention
    : summary.items.map((item) => `— ${item.title}\n  ${strings.attention(item.attention)}`).join('\n');
  return [
    strings.userDigestTitle,
    '',
    `${strings.labelCompletedToday}: ${summary.completedToday}`,
    `${strings.labelOpen}: ${summary.open}`,
    `${strings.labelOverdue}: ${summary.overdue}`,
    `${strings.labelDueTomorrow}: ${summary.dueTomorrow}`,
    '',
    strings.labelNeedsAttention,
    items,
  ].join('\n');
}

export function renderAdminDigest(locale: Locale, summary: TeamRiskSummary): string {
  const strings = t(locale);
  const risks = summary.riskTitles.length === 0
    ? strings.adminNoRisks
    : summary.riskTitles.map((title) => `— ${title}`).join('\n');
  const review = summary.reviewTitles.length === 0
    ? strings.adminNoReview
    : summary.reviewTitles.map((title) => `— ${title}`).join('\n');
  const calibration = summary.calibration
    ? [
      '',
      strings.calibrationHeading,
      `${strings.calibrationAccepted}: ${summary.calibration.acceptedAsProposed} (${Math.round(summary.calibration.acceptedAsProposed / summary.calibration.resolved * 100)}%)`,
      `${strings.calibrationEdited}: ${summary.calibration.editedBeforeConfirmation} (${Math.round(summary.calibration.editedBeforeConfirmation / summary.calibration.resolved * 100)}%)`,
      `${strings.calibrationRejected}: ${summary.calibration.rejected} (${Math.round(summary.calibration.rejected / summary.calibration.resolved * 100)}%)`,
    ]
    : [];
  const reliability = summary.reliability && summary.reliability.length > 0
    ? [
      '',
      strings.reliabilityTeamHeading,
      ...summary.reliability.map((line) => strings.reliabilityTeamLine(line)),
    ]
    : [];
  return [
    strings.adminDigestTitle,
    '',
    `${strings.labelCompletedToday}: ${summary.completedToday}`,
    `${strings.labelOpen}: ${summary.open}`,
    `${strings.labelOverdue}: ${summary.overdue}`,
    `${strings.labelDueTomorrow}: ${summary.dueTomorrow}`,
    '',
    strings.labelTasksAtRisk,
    risks,
    '',
    strings.labelToReview,
    review,
    ...calibration,
    ...reliability,
  ].join('\n');
}

export { normalizeLocale };
export type { Locale };
