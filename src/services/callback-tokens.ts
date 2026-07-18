import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { callbackTokens } from '../db/schema.js';
import type { CallbackAction } from '../telegram/callback-data.js';
import type { RepositoryDatabase } from '../repositories/database.js';

const callbackLifetimeMs = 7 * 24 * 60 * 60 * 1_000;

type SuggestionCallbackAction = 'confirm' | 'edit' | 'reject';
type CommitmentCallbackAction = 'block' | 'cancel' | 'complete' | 'open' | 'overdue' | 'reschedule';
type CheckPageCallbackAction = 'check_page';

type ResolvedCallback =
  | Readonly<{ kind: 'suggestion'; suggestionId: string }>
  | Readonly<{ commitmentId: string; kind: 'commitment' }>
  | Readonly<{ kind: 'check_page'; page: number; telegramUserId: number }>;

export class CallbackTokenError extends Error {
  readonly code: 'CALLBACK_UNAVAILABLE';

  constructor() {
    super('Callback token is unavailable');
    this.code = 'CALLBACK_UNAVAILABLE';
  }
}

export type CallbackTokenService = Readonly<{
  issueCommitmentCallbacks: (input: Readonly<{
    actions: readonly CommitmentCallbackAction[];
    commitmentId: string;
  }>) => Promise<Readonly<Partial<Record<CommitmentCallbackAction, string>>>>;
  issueSuggestionCallbacks: (input: Readonly<{
    actions: readonly SuggestionCallbackAction[];
    suggestionId: string;
  }>) => Promise<Readonly<Partial<Record<SuggestionCallbackAction, string>>>>;
  issueCheckPageCallback: (input: Readonly<{ page: number; telegramUserId: number }>) => Promise<string>;
  claim: (input: Readonly<{ action: CallbackAction; nonce: string }>) => Promise<ResolvedCallback>;
  resolve: (input: Readonly<{ action: CallbackAction; nonce: string }>) => Promise<ResolvedCallback>;
}>;

function hashNonce(nonce: string): string {
  return createHash('sha256').update(nonce).digest('base64url');
}

function createNonce(): string {
  return randomBytes(18).toString('base64url');
}

export function createCallbackTokenService<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): CallbackTokenService {
  async function issue(
    actions: readonly CallbackAction[],
    target: Readonly<{ checkPage?: number; commitmentId?: string; suggestionId?: string; telegramUserId?: number }>,
  ): Promise<Readonly<Partial<Record<CallbackAction, string>>>> {
    const result: Partial<Record<CallbackAction, string>> = {};
    const expiresAt = new Date(Date.now() + callbackLifetimeMs);
    for (const action of actions) {
      const nonce = createNonce();
      await database.insert(callbackTokens).values({
        action,
        checkPage: target.checkPage ?? null,
        commitmentId: target.commitmentId ?? null,
        expiresAt,
        nonceHash: hashNonce(nonce),
        suggestionId: target.suggestionId ?? null,
        telegramUserId: target.telegramUserId ?? null,
      });
      result[action] = nonce;
    }
    return result;
  }

  return {
    async issueCommitmentCallbacks(input) {
      return issue(input.actions, { commitmentId: input.commitmentId });
    },

    async issueSuggestionCallbacks(input) {
      return issue(input.actions, { suggestionId: input.suggestionId });
    },

    async issueCheckPageCallback(input) {
      if (!Number.isSafeInteger(input.page) || input.page < 0 || !Number.isSafeInteger(input.telegramUserId)) {
        throw new CallbackTokenError();
      }
      const callbacks = await issue(['check_page' satisfies CheckPageCallbackAction], {
        checkPage: input.page,
        telegramUserId: input.telegramUserId,
      });
      const nonce = callbacks.check_page;
      if (!nonce) {
        throw new CallbackTokenError();
      }
      return nonce;
    },

    async claim(input) {
      const rows = await database
        .update(callbackTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(callbackTokens.action, input.action),
            eq(callbackTokens.nonceHash, hashNonce(input.nonce)),
            gt(callbackTokens.expiresAt, new Date()),
            isNull(callbackTokens.consumedAt),
          ),
        )
        .returning();
      const token = rows[0];
      if (!token) {
        throw new CallbackTokenError();
      }
      if (token.suggestionId) {
        return { kind: 'suggestion', suggestionId: token.suggestionId };
      }
      if (token.commitmentId) {
        return { commitmentId: token.commitmentId, kind: 'commitment' };
      }
      if (token.action === 'check_page' && token.checkPage !== null && token.telegramUserId !== null) {
        return { kind: 'check_page', page: token.checkPage, telegramUserId: token.telegramUserId };
      }
      throw new CallbackTokenError();
    },

    async resolve(input) {
      const rows = await database
        .select()
        .from(callbackTokens)
        .where(
          and(
            eq(callbackTokens.action, input.action),
            eq(callbackTokens.nonceHash, hashNonce(input.nonce)),
            gt(callbackTokens.expiresAt, new Date()),
            isNull(callbackTokens.consumedAt),
          ),
        )
        .limit(1);
      const token = rows[0];
      if (!token) {
        throw new CallbackTokenError();
      }
      if (token.suggestionId) {
        return { kind: 'suggestion', suggestionId: token.suggestionId };
      }
      if (token.commitmentId) {
        return { commitmentId: token.commitmentId, kind: 'commitment' };
      }
      if (token.action === 'check_page' && token.checkPage !== null && token.telegramUserId !== null) {
        return { kind: 'check_page', page: token.checkPage, telegramUserId: token.telegramUserId };
      }
      throw new CallbackTokenError();
    },
  };
}
