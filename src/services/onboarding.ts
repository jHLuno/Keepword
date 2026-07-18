import { createHash, randomBytes } from 'node:crypto';

import { and, eq, exists, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chatMemberships, chats, onboardingTokens, users } from '../db/schema.js';
import type { RepositoryDatabase } from '../repositories/database.js';
import { createUsersRepository } from '../repositories/users.js';

const onboardingTokenLifetimeMs = 24 * 60 * 60 * 1_000;
const notificationInviteIntervalMs = 24 * 60 * 60 * 1_000;

export class OnboardingError extends Error {
  readonly code: 'EXPIRED_TOKEN' | 'INVALID_TOKEN';

  constructor(code: 'EXPIRED_TOKEN' | 'INVALID_TOKEN' = 'EXPIRED_TOKEN') {
    super('The onboarding token is unavailable');
    this.code = code;
  }
}

export type ChatMembership = Readonly<{
  chatId: string;
  chatTitle: string;
  notificationsEnabled: boolean;
  userId: string;
  workspaceId: string;
}>;

export type NotificationStatus = Readonly<{
  connected: number;
  notConnected: readonly string[];
}>;

export type OnboardingService = Readonly<{
  claimNotificationInvite: (input: Readonly<{ chatId: string; telegramUserId: string }>) => Promise<boolean>;
  createOnboardingLink: (chatId: string) => Promise<string>;
  findActiveChatByTelegramChatId: (telegramChatId: string) => Promise<Readonly<{
    id: string;
    telegramChatId: string;
    title: string;
  }> | null>;
  notificationStatus: (chatId: string) => Promise<NotificationStatus>;
  notificationStatusForPrivateUser: (input: Readonly<{
    chatId: string;
    telegramUserId: string;
  }>) => Promise<NotificationStatus | null>;
  redeemOnboardingToken: (input: Readonly<{ token: string; telegramUserId: string }>) => Promise<ChatMembership>;
}>;

function hashOnboardingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseTelegramUserId(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new OnboardingError('INVALID_TOKEN');
  }
  const telegramUserId = Number(value);
  if (!Number.isSafeInteger(telegramUserId)) {
    throw new OnboardingError('INVALID_TOKEN');
  }
  return telegramUserId;
}

function firstRow<Row>(rows: readonly Row[]): Row {
  const row = rows[0];
  if (!row) {
    throw new OnboardingError();
  }
  return row;
}

export function createOnboardingService<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
  input: Readonly<{ botUsername: string }>,
): OnboardingService {
  const usersRepository = createUsersRepository(database);
  const getNotificationStatus = async (chatId: string): Promise<NotificationStatus> => {
    const rows = await database
      .select({
        connected: chatMemberships.notificationsEnabled,
        firstName: users.firstName,
        username: users.username,
      })
      .from(chatMemberships)
      .innerJoin(users, eq(chatMemberships.userId, users.id))
      .where(eq(chatMemberships.chatId, chatId));
    return {
      connected: rows.filter((row) => row.connected).length,
      notConnected: rows
        .filter((row) => !row.connected)
        .map((row) => row.username ? `@${row.username}` : row.firstName),
    };
  };
  return {
    async createOnboardingLink(chatId) {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = hashOnboardingToken(token);

      await database.transaction(async (transaction) => {
        const chat = (
          await transaction
            .select({ id: chats.id, workspaceId: chats.workspaceId })
            .from(chats)
            .where(and(eq(chats.id, chatId), eq(chats.isActive, true)))
            .limit(1)
        )[0];
        if (!chat) {
          throw new OnboardingError('INVALID_TOKEN');
        }

        await transaction.insert(onboardingTokens).values({
          chatId,
          expiresAt: new Date(Date.now() + onboardingTokenLifetimeMs),
          tokenHash,
          workspaceId: chat.workspaceId,
        });
      });

      return `https://t.me/${input.botUsername}?start=join_${token}`;
    },

    async redeemOnboardingToken(redemption) {
      const telegramUserId = parseTelegramUserId(redemption.telegramUserId);
      const tokenHash = hashOnboardingToken(redemption.token);
      const now = new Date();

      return database.transaction(async (transaction) => {
        const activeChat = exists(
          transaction
            .select({ id: chats.id })
            .from(chats)
            .where(
              and(
                eq(chats.id, onboardingTokens.chatId),
                eq(chats.workspaceId, onboardingTokens.workspaceId),
                eq(chats.isActive, true),
              ),
            ),
        );
        const availableToken = and(
          eq(onboardingTokens.tokenHash, tokenHash),
          isNull(onboardingTokens.usedAt),
          gt(onboardingTokens.expiresAt, now),
          activeChat,
        );
        const token = (
          await transaction
            .select({
              chatId: onboardingTokens.chatId,
              chatTitle: chats.title,
              isActive: chats.isActive,
              workspaceId: onboardingTokens.workspaceId,
            })
            .from(onboardingTokens)
            .innerJoin(
              chats,
              and(
                eq(onboardingTokens.chatId, chats.id),
                eq(onboardingTokens.workspaceId, chats.workspaceId),
              ),
            )
            .where(availableToken)
            .limit(1)
        )[0];
        if (!token || !token.isActive) {
          throw new OnboardingError();
        }

        const consumed = await transaction
          .update(onboardingTokens)
          .set({ usedAt: now, updatedAt: now })
          .where(availableToken)
          .returning({ id: onboardingTokens.id });
        if (consumed.length !== 1) {
          throw new OnboardingError();
        }

        const insertedUsers = await transaction
          .insert(users)
          .values({
            firstName: 'Telegram user',
            privateChatStartedAt: now,
            telegramUserId,
          })
          .onConflictDoNothing({ target: users.telegramUserId })
          .returning({ id: users.id });
        const user = insertedUsers[0] ?? firstRow(
          await transaction.select({ id: users.id }).from(users).where(eq(users.telegramUserId, telegramUserId)).limit(1),
        );
        await transaction
          .update(users)
          .set({ privateChatStartedAt: now, updatedAt: now })
          .where(eq(users.id, user.id));

        const membership = firstRow(
          await transaction
            .insert(chatMemberships)
            .values({
              chatId: token.chatId,
              notificationsConnectedAt: now,
              notificationsEnabled: true,
              userId: user.id,
              workspaceId: token.workspaceId,
            })
            .onConflictDoUpdate({
              set: {
                notificationsConnectedAt: now,
                notificationsEnabled: true,
                updatedAt: now,
              },
              target: [chatMemberships.chatId, chatMemberships.userId],
            })
            .returning(),
        );

        await transaction
          .update(onboardingTokens)
          .set({ usedByUserId: user.id, updatedAt: now })
          .where(eq(onboardingTokens.id, consumed[0]!.id));

        return {
          chatId: membership.chatId,
          chatTitle: token.chatTitle,
          notificationsEnabled: membership.notificationsEnabled,
          userId: membership.userId,
          workspaceId: membership.workspaceId,
        };
      });
    },

    async claimNotificationInvite(invite) {
      const telegramUserId = parseTelegramUserId(invite.telegramUserId);
      const user = await usersRepository.findByTelegramUserId(telegramUserId);
      if (!user) {
        return false;
      }
      const now = new Date();
      const previousInviteCutoff = new Date(now.getTime() - notificationInviteIntervalMs);
      const claimed = await database
        .update(chatMemberships)
        .set({ lastNotificationInviteAt: now, updatedAt: now })
        .where(
          and(
            eq(chatMemberships.chatId, invite.chatId),
            eq(chatMemberships.userId, user.id),
            eq(chatMemberships.notificationsEnabled, false),
            or(
              isNull(chatMemberships.lastNotificationInviteAt),
              lt(chatMemberships.lastNotificationInviteAt, previousInviteCutoff),
            ),
          ),
        )
        .returning({ id: chatMemberships.id });
      return claimed.length === 1;
    },

    async findActiveChatByTelegramChatId(telegramChatId) {
      const parsedTelegramChatId = Number(telegramChatId);
      if (!Number.isSafeInteger(parsedTelegramChatId)) {
        return null;
      }
      const chat = (
        await database
          .select({ id: chats.id, telegramChatId: chats.telegramChatId, title: chats.title })
          .from(chats)
          .where(and(eq(chats.telegramChatId, parsedTelegramChatId), eq(chats.isActive, true)))
          .limit(1)
      )[0];
      return chat ? { ...chat, telegramChatId: String(chat.telegramChatId) } : null;
    },

    async notificationStatus(chatId) {
      return getNotificationStatus(chatId);
    },

    async notificationStatusForPrivateUser(input) {
      const telegramUserId = parseTelegramUserId(input.telegramUserId);
      const membership = (
        await database
          .select({ id: chatMemberships.id })
          .from(chatMemberships)
          .innerJoin(users, eq(chatMemberships.userId, users.id))
          .where(
            and(
              eq(chatMemberships.chatId, input.chatId),
              eq(chatMemberships.notificationsEnabled, true),
              eq(users.telegramUserId, telegramUserId),
              isNotNull(users.privateChatStartedAt),
            ),
          )
          .limit(1)
      )[0];
      return membership ? getNotificationStatus(input.chatId) : null;
    },
  };
}
