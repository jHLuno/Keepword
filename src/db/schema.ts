import {
  bigint,
  boolean,
  foreignKey,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const commitmentStatus = pgEnum('commitment_status', [
  'open',
  'completed',
  'overdue',
  'cancelled',
  'blocked',
]);

export const suggestionStatus = pgEnum('suggestion_status', [
  'pending',
  'confirmed',
  'rejected',
  'expired',
]);

export const suggestionEventType = pgEnum('suggestion_event_type', [
  'suggested',
  'edited',
  'confirmed',
  'rejected',
]);

export const membershipRole = pgEnum('membership_role', ['admin', 'member']);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chats = pgTable(
  'chats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    telegramChatId: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
    title: text('title').notNull(),
    mode: text('mode').notNull().default('suggest'),
    language: text('language').notNull().default('auto'),
    timezone: text('timezone').notNull().default('UTC'),
    dailyDigestTime: time('daily_digest_time').notNull().default('18:00:00'),
    analysisStartedAt: timestamp('analysis_started_at', { withTimezone: true }).notNull().defaultNow(),
    onboardingMessageSentAt: timestamp('onboarding_message_sent_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('chats_telegram_chat_id_unique').on(table.telegramChatId),
    unique('chats_id_workspace_unique').on(table.id, table.workspaceId),
    index('chats_workspace_id_idx').on(table.workspaceId),
  ],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    telegramUserId: bigint('telegram_user_id', { mode: 'number' }).notNull(),
    username: text('username'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name'),
    privateChatStartedAt: timestamp('private_chat_started_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('users_telegram_user_id_unique').on(table.telegramUserId)],
);

export const chatMemberships = pgTable(
  'chat_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull().default('member'),
    notificationsEnabled: boolean('notifications_enabled').notNull().default(false),
    notificationsConnectedAt: timestamp('notifications_connected_at', { withTimezone: true }),
    lastNotificationInviteAt: timestamp('last_notification_invite_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('chat_memberships_chat_user_unique').on(table.chatId, table.userId),
    unique('chat_memberships_chat_workspace_user_unique').on(
      table.chatId,
      table.workspaceId,
      table.userId,
    ),
    index('chat_memberships_workspace_chat_idx').on(table.workspaceId, table.chatId),
    foreignKey({
      name: 'chat_memberships_chat_workspace_fkey',
      columns: [table.chatId, table.workspaceId],
      foreignColumns: [chats.id, chats.workspaceId],
    }).onDelete('cascade'),
  ],
);

export const sourceMessages = pgTable(
  'source_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id').notNull(),
    telegramMessageId: bigint('telegram_message_id', { mode: 'number' }).notNull(),
    authorUserId: uuid('author_user_id').notNull(),
    messageText: text('message_text'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    usedAsSource: boolean('used_as_source').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('source_messages_chat_telegram_message_unique').on(table.chatId, table.telegramMessageId),
    unique('source_messages_id_workspace_chat_unique').on(table.id, table.workspaceId, table.chatId),
    index('source_messages_workspace_chat_sent_idx').on(table.workspaceId, table.chatId, table.sentAt),
    foreignKey({
      name: 'source_messages_chat_workspace_fkey',
      columns: [table.chatId, table.workspaceId],
      foreignColumns: [chats.id, chats.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'source_messages_author_membership_fkey',
      columns: [table.chatId, table.workspaceId, table.authorUserId],
      foreignColumns: [chatMemberships.chatId, chatMemberships.workspaceId, chatMemberships.userId],
    }),
  ],
);

export const manualCaptureSources = pgTable(
  'manual_capture_sources',
  {
    id: serial('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id').notNull(),
    senderTelegramUserId: bigint('sender_telegram_user_id', { mode: 'number' }).notNull(),
    privateTelegramMessageId: bigint('private_telegram_message_id', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('manual_capture_sources_chat_sender_message_unique').on(
      table.chatId,
      table.senderTelegramUserId,
      table.privateTelegramMessageId,
    ),
    foreignKey({
      name: 'manual_capture_sources_chat_workspace_fkey',
      columns: [table.chatId, table.workspaceId],
      foreignColumns: [chats.id, chats.workspaceId],
    }).onDelete('cascade'),
  ],
);

export const commitmentSuggestions = pgTable(
  'commitment_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id').notNull(),
    sourceMessageId: uuid('source_message_id').notNull(),
    title: text('title').notNull(),
    normalizedTitle: text('normalized_title').notNull(),
    description: text('description'),
    language: text('language').notNull().default('en'),
    assigneeUserId: uuid('assignee_user_id'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    dueDateText: text('due_date_text'),
    confidence: text('confidence').notNull(),
    needsAssigneeClarification: boolean('needs_assignee_clarification').notNull().default(false),
    needsDueDateClarification: boolean('needs_due_date_clarification').notNull().default(false),
    status: suggestionStatus('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('commitment_suggestions_workspace_chat_status_idx').on(
      table.workspaceId,
      table.chatId,
      table.status,
    ),
    index('commitment_suggestions_chat_assignee_due_idx').on(table.chatId, table.assigneeUserId, table.dueAt),
    unique('commitment_suggestions_id_workspace_chat_unique').on(table.id, table.workspaceId, table.chatId),
    uniqueIndex('commitment_suggestions_pending_normalized_unique')
      .on(table.workspaceId, table.chatId, table.assigneeUserId, table.normalizedTitle)
      .where(sql`${table.status} = 'pending' and ${table.assigneeUserId} is not null`),
    foreignKey({
      name: 'commitment_suggestions_chat_workspace_fkey',
      columns: [table.chatId, table.workspaceId],
      foreignColumns: [chats.id, chats.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'commitment_suggestions_source_scope_fkey',
      columns: [table.sourceMessageId, table.workspaceId, table.chatId],
      foreignColumns: [sourceMessages.id, sourceMessages.workspaceId, sourceMessages.chatId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'commitment_suggestions_assignee_membership_fkey',
      columns: [table.chatId, table.workspaceId, table.assigneeUserId],
      foreignColumns: [chatMemberships.chatId, chatMemberships.workspaceId, chatMemberships.userId],
    }),
  ],
);

export const suggestionEvents = pgTable(
  'suggestion_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id').notNull(),
    suggestionId: uuid('suggestion_id').notNull(),
    eventType: suggestionEventType('event_type').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('suggestion_events_workspace_chat_created_idx').on(table.workspaceId, table.chatId, table.createdAt),
    index('suggestion_events_suggestion_created_idx').on(table.suggestionId, table.createdAt),
    foreignKey({
      name: 'suggestion_events_chat_workspace_fkey',
      columns: [table.chatId, table.workspaceId],
      foreignColumns: [chats.id, chats.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'suggestion_events_suggestion_scope_fkey',
      columns: [table.suggestionId, table.workspaceId, table.chatId],
      foreignColumns: [commitmentSuggestions.id, commitmentSuggestions.workspaceId, commitmentSuggestions.chatId],
    }).onDelete('cascade'),
  ],
);

export const commitments = pgTable(
  'commitments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    language: text('language').notNull().default('en'),
    assigneeUserId: uuid('assignee_user_id'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    dueDateText: text('due_date_text'),
    status: commitmentStatus('status').notNull().default('open'),
    confirmedByUserId: uuid('confirmed_by_user_id'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('commitments_workspace_chat_status_idx').on(table.workspaceId, table.chatId, table.status),
    index('commitments_chat_assignee_due_idx').on(table.chatId, table.assigneeUserId, table.dueAt),
    unique('commitments_id_workspace_chat_unique').on(table.id, table.workspaceId, table.chatId),
    foreignKey({
      name: 'commitments_chat_workspace_fkey',
      columns: [table.chatId, table.workspaceId],
      foreignColumns: [chats.id, chats.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'commitments_assignee_membership_fkey',
      columns: [table.chatId, table.workspaceId, table.assigneeUserId],
      foreignColumns: [chatMemberships.chatId, chatMemberships.workspaceId, chatMemberships.userId],
    }),
    foreignKey({
      name: 'commitments_confirmer_membership_fkey',
      columns: [table.chatId, table.workspaceId, table.confirmedByUserId],
      foreignColumns: [chatMemberships.chatId, chatMemberships.workspaceId, chatMemberships.userId],
    }),
  ],
);

export const commitmentSources = pgTable(
  'commitment_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id').notNull(),
    commitmentId: uuid('commitment_id').notNull(),
    sourceMessageId: uuid('source_message_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('commitment_sources_commitment_source_unique').on(table.commitmentId, table.sourceMessageId),
    index('commitment_sources_workspace_chat_idx').on(table.workspaceId, table.chatId),
    foreignKey({
      name: 'commitment_sources_chat_workspace_fkey',
      columns: [table.chatId, table.workspaceId],
      foreignColumns: [chats.id, chats.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'commitment_sources_commitment_scope_fkey',
      columns: [table.commitmentId, table.workspaceId, table.chatId],
      foreignColumns: [commitments.id, commitments.workspaceId, commitments.chatId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'commitment_sources_source_scope_fkey',
      columns: [table.sourceMessageId, table.workspaceId, table.chatId],
      foreignColumns: [sourceMessages.id, sourceMessages.workspaceId, sourceMessages.chatId],
    }).onDelete('cascade'),
  ],
);

export const callbackTokens = pgTable(
  'callback_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    action: text('action').notNull(),
    nonceHash: text('nonce_hash').notNull(),
    suggestionId: uuid('suggestion_id'),
    commitmentId: uuid('commitment_id'),
    checkPage: integer('check_page'),
    telegramUserId: bigint('telegram_user_id', { mode: 'number' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('callback_tokens_nonce_hash_unique').on(table.nonceHash),
    index('callback_tokens_action_expiry_idx').on(table.action, table.expiresAt),
    foreignKey({
      name: 'callback_tokens_suggestion_fkey',
      columns: [table.suggestionId],
      foreignColumns: [commitmentSuggestions.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'callback_tokens_commitment_fkey',
      columns: [table.commitmentId],
      foreignColumns: [commitments.id],
    }).onDelete('cascade'),
  ],
);

export const suggestionEditSessions = pgTable(
  'suggestion_edit_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    suggestionId: uuid('suggestion_id').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    workspaceId: uuid('workspace_id'),
    chatId: uuid('chat_id'),
    instructionTelegramMessageId: bigint('instruction_telegram_message_id', { mode: 'number' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('suggestion_edit_sessions_actor_expiry_idx').on(table.actorUserId, table.expiresAt),
    index('suggestion_edit_sessions_group_reply_idx').on(
      table.actorUserId,
      table.workspaceId,
      table.chatId,
      table.instructionTelegramMessageId,
      table.expiresAt,
    ),
    foreignKey({
      name: 'suggestion_edit_sessions_suggestion_fkey',
      columns: [table.suggestionId],
      foreignColumns: [commitmentSuggestions.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'suggestion_edit_sessions_actor_fkey',
      columns: [table.actorUserId],
      foreignColumns: [users.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'suggestion_edit_sessions_chat_workspace_fkey',
      columns: [table.chatId, table.workspaceId],
      foreignColumns: [chats.id, chats.workspaceId],
    }).onDelete('cascade'),
  ],
);

export const commitmentRescheduleSessions = pgTable(
  'commitment_reschedule_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commitmentId: uuid('commitment_id').notNull(),
    actorTelegramUserId: bigint('actor_telegram_user_id', { mode: 'number' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('commitment_reschedule_sessions_actor_expiry_idx').on(table.actorTelegramUserId, table.expiresAt),
    foreignKey({
      name: 'commitment_reschedule_sessions_commitment_fkey',
      columns: [table.commitmentId],
      foreignColumns: [commitments.id],
    }).onDelete('cascade'),
  ],
);

export const onboardingTokens = pgTable(
  'onboarding_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedByUserId: uuid('used_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('onboarding_tokens_token_hash_unique').on(table.tokenHash),
    index('onboarding_tokens_workspace_chat_expiry_idx').on(table.workspaceId, table.chatId, table.expiresAt),
    foreignKey({
      name: 'onboarding_tokens_chat_workspace_fkey',
      columns: [table.chatId, table.workspaceId],
      foreignColumns: [chats.id, chats.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'onboarding_tokens_consumer_membership_fkey',
      columns: [table.chatId, table.workspaceId, table.usedByUserId],
      foreignColumns: [chatMemberships.chatId, chatMemberships.workspaceId, chatMemberships.userId],
    }),
  ],
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('pending'),
    commitmentId: uuid('commitment_id'),
    userId: uuid('user_id'),
    chatId: uuid('chat_id').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('notification_deliveries_idempotency_key_unique').on(table.idempotencyKey),
    index('notification_deliveries_scope_status_idx').on(table.workspaceId, table.chatId, table.userId, table.status),
    foreignKey({
      name: 'notification_deliveries_chat_workspace_fkey',
      columns: [table.chatId, table.workspaceId],
      foreignColumns: [chats.id, chats.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'notification_deliveries_commitment_scope_fkey',
      columns: [table.commitmentId, table.workspaceId, table.chatId],
      foreignColumns: [commitments.id, commitments.workspaceId, commitments.chatId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'notification_deliveries_recipient_membership_fkey',
      columns: [table.chatId, table.workspaceId, table.userId],
      foreignColumns: [chatMemberships.chatId, chatMemberships.workspaceId, chatMemberships.userId],
    }),
  ],
);

export const processedUpdates = pgTable('processed_updates', {
  telegramUpdateId: bigint('telegram_update_id', { mode: 'number' }).primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});
