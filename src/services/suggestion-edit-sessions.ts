import { and, eq, gt, isNull } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { chats, commitmentSuggestions, suggestionEditSessions, users } from '../db/schema.js';
import { normalizeSuggestionTitle } from '../repositories/commitments.js';
import type { RepositoryDatabase } from '../repositories/database.js';

const editSessionLifetimeMs = 15 * 60 * 1_000;

export type SuggestionEditPatch = Readonly<{
  description?: string | null;
  dueDateText?: string | null;
  title?: string;
}>;

export class SuggestionEditSessionError extends Error {
  readonly code: 'EDIT_SESSION_UNAVAILABLE' | 'INVALID_EDIT_INPUT';

  constructor(code: 'EDIT_SESSION_UNAVAILABLE' | 'INVALID_EDIT_INPUT') {
    super(code);
    this.code = code;
  }
}

export type SuggestionEditSessionService = Readonly<{
  apply: (input: Readonly<{
    actorUserId: string;
    patch: SuggestionEditPatch;
    suggestionId: string;
  }>) => Promise<void>;
  begin: (input: Readonly<{ actorUserId: string; suggestionId: string }>) => Promise<void>;
  findActiveForTelegramUser: (telegramUserId: number) => Promise<Readonly<{
    actorUserId: string;
    suggestionId: string;
    telegramChatId: string;
  }> | null>;
}>;

function validatePatch(patch: SuggestionEditPatch): void {
  if (Object.keys(patch).length === 0) {
    throw new SuggestionEditSessionError('INVALID_EDIT_INPUT');
  }
  if (patch.title !== undefined && (patch.title.trim().length === 0 || patch.title.length > 200)) {
    throw new SuggestionEditSessionError('INVALID_EDIT_INPUT');
  }
  if (patch.description !== undefined && patch.description !== null && patch.description.length > 2_000) {
    throw new SuggestionEditSessionError('INVALID_EDIT_INPUT');
  }
  if (patch.dueDateText !== undefined && patch.dueDateText !== null && patch.dueDateText.length > 100) {
    throw new SuggestionEditSessionError('INVALID_EDIT_INPUT');
  }
}

export function parseSuggestionEditInput(text: string): SuggestionEditPatch {
  const patch: { description?: string | null; dueDateText?: string | null; title?: string } = {};
  for (const line of text.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      throw new SuggestionEditSessionError('INVALID_EDIT_INPUT');
    }
    const field = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (field === 'title' && patch.title === undefined) {
      patch.title = value;
    } else if (field === 'description' && patch.description === undefined) {
      patch.description = value === '-' ? null : value;
    } else if (field === 'due' && patch.dueDateText === undefined) {
      patch.dueDateText = value === '-' ? null : value;
    } else {
      throw new SuggestionEditSessionError('INVALID_EDIT_INPUT');
    }
  }
  validatePatch(patch);
  return patch;
}

export function createSuggestionEditSessionService<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): SuggestionEditSessionService {
  return {
    async apply(input) {
      validatePatch(input.patch);
      await database.transaction(async (transaction) => {
        const claimedSession = await transaction
          .update(suggestionEditSessions)
          .set({ usedAt: new Date() })
          .where(
            and(
              eq(suggestionEditSessions.actorUserId, input.actorUserId),
              eq(suggestionEditSessions.suggestionId, input.suggestionId),
              isNull(suggestionEditSessions.usedAt),
              gt(suggestionEditSessions.expiresAt, new Date()),
            ),
          )
          .returning({ id: suggestionEditSessions.id });
        if (!claimedSession[0]) {
          throw new SuggestionEditSessionError('EDIT_SESSION_UNAVAILABLE');
        }
        const currentRows = await transaction
          .select({ title: commitmentSuggestions.title })
          .from(commitmentSuggestions)
          .where(and(eq(commitmentSuggestions.id, input.suggestionId), eq(commitmentSuggestions.status, 'pending')))
          .limit(1);
        const current = currentRows[0];
        if (!current) {
          throw new SuggestionEditSessionError('EDIT_SESSION_UNAVAILABLE');
        }
        const rows = await transaction
          .update(commitmentSuggestions)
          .set({
            ...input.patch,
            ...(input.patch.title === undefined
              ? {}
              : { normalizedTitle: normalizeSuggestionTitle(input.patch.title) }),
            updatedAt: new Date(),
          })
          .where(and(eq(commitmentSuggestions.id, input.suggestionId), eq(commitmentSuggestions.status, 'pending')))
          .returning({ id: commitmentSuggestions.id });
        if (!rows[0]) {
          throw new SuggestionEditSessionError('EDIT_SESSION_UNAVAILABLE');
        }
      });
    },

    async begin(input) {
      await database.transaction(async (transaction) => {
        await transaction
          .update(suggestionEditSessions)
          .set({ usedAt: new Date() })
          .where(
            and(
              eq(suggestionEditSessions.actorUserId, input.actorUserId),
              eq(suggestionEditSessions.suggestionId, input.suggestionId),
              isNull(suggestionEditSessions.usedAt),
            ),
          );
        await transaction.insert(suggestionEditSessions).values({
          actorUserId: input.actorUserId,
          expiresAt: new Date(Date.now() + editSessionLifetimeMs),
          suggestionId: input.suggestionId,
        });
      });
    },

    async findActiveForTelegramUser(telegramUserId) {
      const rows = await database
        .select({
          actorUserId: suggestionEditSessions.actorUserId,
          suggestionId: suggestionEditSessions.suggestionId,
          telegramChatId: chats.telegramChatId,
        })
        .from(suggestionEditSessions)
        .innerJoin(users, eq(suggestionEditSessions.actorUserId, users.id))
        .innerJoin(commitmentSuggestions, eq(suggestionEditSessions.suggestionId, commitmentSuggestions.id))
        .innerJoin(
          chats,
          and(
            eq(commitmentSuggestions.chatId, chats.id),
            eq(commitmentSuggestions.workspaceId, chats.workspaceId),
          ),
        )
        .where(
          and(
            eq(users.telegramUserId, telegramUserId),
            isNull(suggestionEditSessions.usedAt),
            gt(suggestionEditSessions.expiresAt, new Date()),
            eq(commitmentSuggestions.status, 'pending'),
          ),
        )
        .limit(1);
      const session = rows[0];
      return session
        ? {
            actorUserId: session.actorUserId,
            suggestionId: session.suggestionId,
            telegramChatId: String(session.telegramChatId),
          }
        : null;
    },
  };
}
