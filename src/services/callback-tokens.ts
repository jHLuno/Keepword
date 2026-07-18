import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { callbackTokens } from '../db/schema.js';
import type { CallbackAction } from '../telegram/callback-data.js';
import type { RepositoryDatabase } from '../repositories/database.js';

const callbackLifetimeMs = 7 * 24 * 60 * 60 * 1_000;

type SuggestionCallbackAction = 'confirm' | 'edit' | 'reject';
type CommitmentCallbackAction = 'block' | 'cancel' | 'complete' | 'open' | 'overdue' | 'reschedule';

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
  claim: (input: Readonly<{ action: CallbackAction; nonce: string }>) => Promise<
    | Readonly<{ kind: 'suggestion'; suggestionId: string }>
    | Readonly<{ commitmentId: string; kind: 'commitment' }>
  >;
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
    target: Readonly<{ commitmentId?: string; suggestionId?: string }>,
  ): Promise<Readonly<Partial<Record<CallbackAction, string>>>> {
    const result: Partial<Record<CallbackAction, string>> = {};
    const expiresAt = new Date(Date.now() + callbackLifetimeMs);
    for (const action of actions) {
      const nonce = createNonce();
      await database.insert(callbackTokens).values({
        action,
        commitmentId: target.commitmentId ?? null,
        expiresAt,
        nonceHash: hashNonce(nonce),
        suggestionId: target.suggestionId ?? null,
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
      throw new CallbackTokenError();
    },
  };
}
