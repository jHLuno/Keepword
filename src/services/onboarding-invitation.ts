import { createHash, randomBytes } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chats, onboardingTokens } from '../db/schema.js';
import type { RepositoryDatabase } from '../repositories/database.js';
import type { ConnectedChat } from './connect-chat.js';

export type OnboardingInvitation = Readonly<{
  chatId: string;
  onboardingToken: string;
  telegramChatId: string;
  workspaceId: string;
}>;

export type OnboardingInvitationService = Readonly<{
  markOnboardingMessageSent: (invitation: OnboardingInvitation) => Promise<boolean>;
  prepareInvitation: (chat: ConnectedChat) => Promise<OnboardingInvitation | null>;
}>;

const onboardingTokenLifetimeMs = 24 * 60 * 60 * 1_000;

function hashOnboardingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createOnboardingInvitationService<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): OnboardingInvitationService {
  return {
    async prepareInvitation(chat) {
      const onboardingToken = randomBytes(32).toString('base64url');

      return database.transaction(async (transaction) => {
        const scopedChats = await transaction
          .select({ onboardingMessageSentAt: chats.onboardingMessageSentAt })
          .from(chats)
          .where(and(eq(chats.id, chat.chatId), eq(chats.workspaceId, chat.workspaceId)))
          .limit(1);
        const scopedChat = scopedChats[0];

        if (!scopedChat) {
          throw new Error('Connected chat no longer exists');
        }
        if (scopedChat.onboardingMessageSentAt) {
          return null;
        }

        await transaction
          .delete(onboardingTokens)
          .where(
            and(
              eq(onboardingTokens.chatId, chat.chatId),
              eq(onboardingTokens.workspaceId, chat.workspaceId),
              isNull(onboardingTokens.usedAt),
            ),
          );
        await transaction.insert(onboardingTokens).values({
          chatId: chat.chatId,
          expiresAt: new Date(Date.now() + onboardingTokenLifetimeMs),
          tokenHash: hashOnboardingToken(onboardingToken),
          workspaceId: chat.workspaceId,
        });

        return {
          chatId: chat.chatId,
          onboardingToken,
          telegramChatId: chat.telegramChatId,
          workspaceId: chat.workspaceId,
        };
      });
    },
    async markOnboardingMessageSent(invitation) {
      const updatedChats = await database
        .update(chats)
        .set({ onboardingMessageSentAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(chats.id, invitation.chatId),
            eq(chats.workspaceId, invitation.workspaceId),
            isNull(chats.onboardingMessageSentAt),
          ),
        )
        .returning({ id: chats.id });

      return updatedChats.length === 1;
    },
  };
}
