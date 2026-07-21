import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { callbackTokens } from '../db/schema.js';
import type { CallbackAction } from '../telegram/callback-data.js';
import type { RepositoryDatabase } from '../repositories/database.js';

const callbackLifetimeMs = 7 * 24 * 60 * 60 * 1_000;

type SuggestionCallbackAction = 'confirm' | 'edit' | 'reject';
type CommitmentCallbackAction = 'block' | 'cancel' | 'complete' | 'open' | 'overdue' | 'reschedule';
type CheckNavigationCallbackAction = 'check_back' | 'check_page';
type CheckCommitmentCallbackAction = 'check_commitment';

type ResolvedCallback =
  | Readonly<{ kind: 'suggestion'; suggestionId: string }>
  | Readonly<{ commitmentId: string; kind: 'commitment'; page: number | null; telegramUserId: number | null }>
  | Readonly<{ kind: 'check_commitment'; commitmentId: string; page: number; telegramUserId: number }>
  | Readonly<{ kind: 'check_navigation'; page: number; telegramUserId: number }>;

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
    page?: number | undefined;
    telegramUserId?: number | undefined;
  }>) => Promise<Readonly<Partial<Record<CommitmentCallbackAction, string>>>>;
  issueSuggestionCallbacks: (input: Readonly<{
    actions: readonly SuggestionCallbackAction[];
    suggestionId: string;
  }>) => Promise<Readonly<Partial<Record<SuggestionCallbackAction, string>>>>;
  issueCheckPageCallback: (input: Readonly<{ page: number; telegramUserId: number }>) => Promise<string>;
  issueCheckBackCallback: (input: Readonly<{ page: number; telegramUserId: number }>) => Promise<string>;
  issueCheckCommitmentCallback: (input: Readonly<{
    commitmentId: string;
    page: number;
    telegramUserId: number;
  }>) => Promise<string>;
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
  function assertCheckTarget(input: Readonly<{ page: number; telegramUserId: number }>): void {
    if (!Number.isSafeInteger(input.page) || input.page < 0 || !Number.isSafeInteger(input.telegramUserId)) {
      throw new CallbackTokenError();
    }
  }

  async function issue(
    actions: readonly CallbackAction[],
    target: Readonly<{
      checkPage?: number | undefined;
      commitmentId?: string | undefined;
      suggestionId?: string | undefined;
      telegramUserId?: number | undefined;
    }>,
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
      if (input.page !== undefined || input.telegramUserId !== undefined) {
        if (input.page === undefined || input.telegramUserId === undefined) {
          throw new CallbackTokenError();
        }
        assertCheckTarget({ page: input.page, telegramUserId: input.telegramUserId });
      }
      return issue(input.actions, {
        checkPage: input.page,
        commitmentId: input.commitmentId,
        telegramUserId: input.telegramUserId,
      });
    },

    async issueSuggestionCallbacks(input) {
      return issue(input.actions, { suggestionId: input.suggestionId });
    },

    async issueCheckPageCallback(input) {
      assertCheckTarget(input);
      const callbacks = await issue(['check_page' satisfies CheckNavigationCallbackAction], {
        checkPage: input.page,
        telegramUserId: input.telegramUserId,
      });
      const nonce = callbacks.check_page;
      if (!nonce) {
        throw new CallbackTokenError();
      }
      return nonce;
    },

    async issueCheckBackCallback(input) {
      assertCheckTarget(input);
      const callbacks = await issue(['check_back' satisfies CheckNavigationCallbackAction], {
        checkPage: input.page,
        telegramUserId: input.telegramUserId,
      });
      const nonce = callbacks.check_back;
      if (!nonce) {
        throw new CallbackTokenError();
      }
      return nonce;
    },

    async issueCheckCommitmentCallback(input) {
      assertCheckTarget(input);
      const callbacks = await issue(['check_commitment' satisfies CheckCommitmentCallbackAction], {
        checkPage: input.page,
        commitmentId: input.commitmentId,
        telegramUserId: input.telegramUserId,
      });
      const nonce = callbacks.check_commitment;
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
      if (token.action === 'check_commitment' && token.commitmentId && token.checkPage !== null && token.telegramUserId !== null) {
        return {
          commitmentId: token.commitmentId,
          kind: 'check_commitment',
          page: token.checkPage,
          telegramUserId: token.telegramUserId,
        };
      }
      if (token.commitmentId) {
        return {
          commitmentId: token.commitmentId,
          kind: 'commitment',
          page: token.checkPage,
          telegramUserId: token.telegramUserId,
        };
      }
      if ((token.action === 'check_page' || token.action === 'check_back') && token.checkPage !== null && token.telegramUserId !== null) {
        return { kind: 'check_navigation', page: token.checkPage, telegramUserId: token.telegramUserId };
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
      if (token.action === 'check_commitment' && token.commitmentId && token.checkPage !== null && token.telegramUserId !== null) {
        return {
          commitmentId: token.commitmentId,
          kind: 'check_commitment',
          page: token.checkPage,
          telegramUserId: token.telegramUserId,
        };
      }
      if (token.commitmentId) {
        return {
          commitmentId: token.commitmentId,
          kind: 'commitment',
          page: token.checkPage,
          telegramUserId: token.telegramUserId,
        };
      }
      if ((token.action === 'check_page' || token.action === 'check_back') && token.checkPage !== null && token.telegramUserId !== null) {
        return { kind: 'check_navigation', page: token.checkPage, telegramUserId: token.telegramUserId };
      }
      throw new CallbackTokenError();
    },
  };
}
