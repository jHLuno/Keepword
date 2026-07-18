import {
  bigint,
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

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
    timezone: text('timezone').notNull().default('UTC'),
    dailyDigestTime: time('daily_digest_time').notNull().default('18:00:00'),
    analysisStartedAt: timestamp('analysis_started_at', { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('chats_telegram_chat_id_unique').on(table.telegramChatId),
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
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull().default('member'),
    notificationsEnabled: boolean('notifications_enabled').notNull().default(false),
    notificationsConnectedAt: timestamp('notifications_connected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('chat_memberships_chat_user_unique').on(table.chatId, table.userId),
    index('chat_memberships_workspace_chat_idx').on(table.workspaceId, table.chatId),
  ],
);

export const sourceMessages = pgTable(
  'source_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    telegramMessageId: bigint('telegram_message_id', { mode: 'number' }).notNull(),
    authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    messageText: text('message_text'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    usedAsSource: boolean('used_as_source').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('source_messages_chat_telegram_message_unique').on(table.chatId, table.telegramMessageId),
    index('source_messages_workspace_chat_sent_idx').on(table.workspaceId, table.chatId, table.sentAt),
  ],
);

export const commitmentSuggestions = pgTable(
  'commitment_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    sourceMessageId: uuid('source_message_id')
      .notNull()
      .references(() => sourceMessages.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
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
  ],
);

export const commitments = pgTable(
  'commitments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    dueDateText: text('due_date_text'),
    status: commitmentStatus('status').notNull().default('open'),
    confirmedByUserId: uuid('confirmed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('commitments_workspace_chat_status_idx').on(table.workspaceId, table.chatId, table.status),
    index('commitments_chat_assignee_due_idx').on(table.chatId, table.assigneeUserId, table.dueAt),
  ],
);

export const commitmentSources = pgTable(
  'commitment_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    commitmentId: uuid('commitment_id')
      .notNull()
      .references(() => commitments.id, { onDelete: 'cascade' }),
    sourceMessageId: uuid('source_message_id')
      .notNull()
      .references(() => sourceMessages.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('commitment_sources_commitment_source_unique').on(table.commitmentId, table.sourceMessageId),
    index('commitment_sources_workspace_chat_idx').on(table.workspaceId, table.chatId),
  ],
);

export const onboardingTokens = pgTable(
  'onboarding_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedByUserId: uuid('used_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('onboarding_tokens_token_hash_unique').on(table.tokenHash),
    index('onboarding_tokens_workspace_chat_expiry_idx').on(table.workspaceId, table.chatId, table.expiresAt),
  ],
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('pending'),
    commitmentId: uuid('commitment_id').references(() => commitments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    chatId: uuid('chat_id').references(() => chats.id, { onDelete: 'cascade' }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('notification_deliveries_idempotency_key_unique').on(table.idempotencyKey),
    index('notification_deliveries_scope_status_idx').on(table.workspaceId, table.chatId, table.userId, table.status),
  ],
);

export const processedUpdates = pgTable('processed_updates', {
  telegramUpdateId: bigint('telegram_update_id', { mode: 'number' }).primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});
