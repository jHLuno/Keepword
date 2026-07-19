import { and, asc, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { chatMemberships, commitmentSuggestions, suggestionEvents, users } from '../../src/db/schema.js';
import { createMessagesRepository } from '../../src/repositories/messages.js';
import { createConfirmSuggestion, createRejectSuggestion } from '../../src/services/confirm-suggestion.js';
import { createConnectChat } from '../../src/services/connect-chat.js';
import { createDeleteChatData } from '../../src/services/delete-chat-data.js';
import { createSuggestion } from '../../src/services/create-suggestion.js';
import { createSuggestionEditSessionService } from '../../src/services/suggestion-edit-sessions.js';
import { createPgliteTestDatabase, type PgliteTestDatabase } from '../helpers/pglite.js';

let database: PgliteTestDatabase;
let nextTelegramChatId = 160_000;

type SuggestionFixture = Readonly<{
  chatId: string;
  sourceMessageId: string;
  userId: string;
  workspaceId: string;
}>;

function firstRow<Row>(rows: readonly Row[]): Row {
  const row = rows[0];
  if (!row) throw new Error('Expected a row');
  return row;
}

function errorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return [error.message, error.cause instanceof Error ? error.cause.message : ''].join('\n');
}

async function createFixture(): Promise<SuggestionFixture> {
  nextTelegramChatId += 1;
  const connected = await createConnectChat(database.db)({
    adminTelegramUserId: String(nextTelegramChatId),
    telegramChatId: String(nextTelegramChatId),
    timezone: 'UTC',
    title: 'Suggestion event test',
  });
  const source = await createMessagesRepository(database.db).persistCandidateSourceMessage({
    author: { firstName: 'Daniyar', telegramUserId: nextTelegramChatId },
    chatId: connected.chatId,
    sentAt: new Date('2026-07-19T00:00:00.000Z'),
    telegramMessageId: 1,
    text: 'Сегодня отправлю КП',
    workspaceId: connected.workspaceId,
  });
  const membership = firstRow(
    await database.db
      .select({ userId: chatMemberships.userId })
      .from(chatMemberships)
      .where(and(eq(chatMemberships.workspaceId, connected.workspaceId), eq(chatMemberships.chatId, connected.chatId)))
      .limit(1),
  );
  return {
    chatId: connected.chatId,
    sourceMessageId: source.id,
    userId: membership.userId,
    workspaceId: connected.workspaceId,
  };
}

async function createPendingSuggestion(fixture: SuggestionFixture, title = 'Отправить КП') {
  return createSuggestion(database.db)({
    assigneeUserId: fixture.userId,
    chatId: fixture.chatId,
    confidence: 'high',
    language: 'ru',
    description: 'Первоначальное описание',
    dueAt: new Date('2026-07-19T18:00:00.000Z'),
    dueDateText: 'сегодня до 18:00',
    needsAssigneeClarification: false,
    needsDueDateClarification: false,
    sourceMessageId: fixture.sourceMessageId,
    title,
    workspaceId: fixture.workspaceId,
  });
}

beforeAll(async () => {
  database = await createPgliteTestDatabase();
});

afterAll(async () => {
  await database.client.close();
});

describe('immutable suggestion event memory', () => {
  test('keeps original, edited, and confirmed snapshots with their exact source scope', async () => {
    const fixture = await createFixture();
    const suggestion = await createPendingSuggestion(fixture);
    const edits = createSuggestionEditSessionService(database.db);
    await edits.begin({ actorUserId: fixture.userId, suggestionId: suggestion.id });
    await edits.apply({
      actorUserId: fixture.userId,
      patch: { description: 'Исправленное описание', dueDateText: 'завтра', title: 'Отправить финальное КП' },
      suggestionId: suggestion.id,
    });
    await createConfirmSuggestion(database.db)({ confirmedByUserId: fixture.userId, suggestionId: suggestion.id });

    const events = await database.db
      .select()
      .from(suggestionEvents)
      .where(
        and(
          eq(suggestionEvents.workspaceId, fixture.workspaceId),
          eq(suggestionEvents.chatId, fixture.chatId),
          eq(suggestionEvents.suggestionId, suggestion.id),
        ),
      )
      .orderBy(asc(suggestionEvents.createdAt));

    expect(events.map((event) => event.eventType)).toEqual(['suggested', 'edited', 'confirmed']);
    expect(events.every((event) => event.actorUserId === fixture.userId)).toBe(true);
    expect(events[0]?.snapshot).toMatchObject({
      original: {
        confidence: 'high',
        description: 'Первоначальное описание',
        sourceMessageIds: [fixture.sourceMessageId],
        title: 'Отправить КП',
      },
    });
    expect(events[1]?.snapshot).toMatchObject({
      after: { description: 'Исправленное описание', dueDateText: 'завтра', title: 'Отправить финальное КП' },
      before: { description: 'Первоначальное описание', dueDateText: 'сегодня до 18:00', title: 'Отправить КП' },
    });
    expect(events[2]?.snapshot).toMatchObject({
      final: { description: 'Исправленное описание', dueDateText: 'завтра', title: 'Отправить финальное КП' },
    });
  });

  test('records one terminal event when confirm and reject race', async () => {
    const fixture = await createFixture();
    const suggestion = await createPendingSuggestion(fixture);

    const results = await Promise.allSettled([
      createConfirmSuggestion(database.db)({ confirmedByUserId: fixture.userId, suggestionId: suggestion.id }),
      createRejectSuggestion(database.db)({ rejectedByUserId: fixture.userId, suggestionId: suggestion.id }),
    ]);
    const terminalEvents = await database.db
      .select({ eventType: suggestionEvents.eventType })
      .from(suggestionEvents)
      .where(
        and(
          eq(suggestionEvents.workspaceId, fixture.workspaceId),
          eq(suggestionEvents.chatId, fixture.chatId),
          eq(suggestionEvents.suggestionId, suggestion.id),
        ),
      );
    const persistedSuggestion = firstRow(
      await database.db
        .select({ status: commitmentSuggestions.status })
        .from(commitmentSuggestions)
        .where(
          and(
            eq(commitmentSuggestions.id, suggestion.id),
            eq(commitmentSuggestions.workspaceId, fixture.workspaceId),
            eq(commitmentSuggestions.chatId, fixture.chatId),
          ),
        )
        .limit(1),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(terminalEvents.filter((event) => event.eventType !== 'suggested')).toHaveLength(1);
    expect(persistedSuggestion.status).toMatch(/^(confirmed|rejected)$/);
  });

  test('keeps rejected snapshots chat-scoped and removes all events with the deleted chat', async () => {
    const fixture = await createFixture();
    const otherFixture = await createFixture();
    const suggestion = await createPendingSuggestion(fixture);
    const otherSuggestion = await createPendingSuggestion(otherFixture);
    await createRejectSuggestion(database.db)({ rejectedByUserId: fixture.userId, suggestionId: suggestion.id });

    const rejection = firstRow(
      await database.db
        .select()
        .from(suggestionEvents)
        .where(
          and(
            eq(suggestionEvents.workspaceId, fixture.workspaceId),
            eq(suggestionEvents.chatId, fixture.chatId),
            eq(suggestionEvents.suggestionId, suggestion.id),
            eq(suggestionEvents.eventType, 'rejected'),
          ),
        )
        .limit(1),
    );
    expect(rejection.snapshot).toMatchObject({ final: { title: 'Отправить КП' } });

    await createDeleteChatData(database.db, () => Promise.resolve(true))({
      chatId: fixture.chatId,
      requestedByTelegramUserId: String(nextTelegramChatId - 1),
      workspaceId: fixture.workspaceId,
    });

    const [deletedCount, otherCount] = await Promise.all([
      database.db.select({ total: count() }).from(suggestionEvents).where(
        and(eq(suggestionEvents.workspaceId, fixture.workspaceId), eq(suggestionEvents.chatId, fixture.chatId)),
      ),
      database.db.select({ total: count() }).from(suggestionEvents).where(
        and(eq(suggestionEvents.workspaceId, otherFixture.workspaceId), eq(suggestionEvents.chatId, otherFixture.chatId), eq(suggestionEvents.suggestionId, otherSuggestion.id)),
      ),
    ]);
    expect(Number(deletedCount[0]?.total ?? 0)).toBe(0);
    expect(Number(otherCount[0]?.total ?? 0)).toBe(1);
  });

  test('keeps event history when an unrelated actor membership is removed', async () => {
    const fixture = await createFixture();
    const suggestion = await createPendingSuggestion(fixture);
    const actor = firstRow(
      await database.db
        .insert(users)
        .values({ firstName: 'Former actor', telegramUserId: nextTelegramChatId + 10_000 })
        .returning({ id: users.id }),
    );
    await database.db.insert(chatMemberships).values({
      chatId: fixture.chatId,
      role: 'member',
      userId: actor.id,
      workspaceId: fixture.workspaceId,
    });
    const event = firstRow(
      await database.db
        .insert(suggestionEvents)
        .values({
          actorUserId: actor.id,
          chatId: fixture.chatId,
          eventType: 'confirmed',
          snapshot: { final: { title: 'Отправить КП' } },
          suggestionId: suggestion.id,
          workspaceId: fixture.workspaceId,
        })
        .returning({ id: suggestionEvents.id }),
    );

    await database.db.delete(chatMemberships).where(and(
      eq(chatMemberships.chatId, fixture.chatId),
      eq(chatMemberships.workspaceId, fixture.workspaceId),
      eq(chatMemberships.userId, actor.id),
    ));

    const persisted = await database.db
      .select({ id: suggestionEvents.id })
      .from(suggestionEvents)
      .where(eq(suggestionEvents.id, event.id));
    expect(persisted).toEqual([{ id: event.id }]);
  });

  test('rejects an event whose suggestion belongs to another chat scope', async () => {
    const fixture = await createFixture();
    const otherFixture = await createFixture();
    const suggestion = await createPendingSuggestion(fixture);

    const error = await database.db
      .insert(suggestionEvents)
      .values({
        actorUserId: otherFixture.userId,
        chatId: otherFixture.chatId,
        eventType: 'suggested',
        snapshot: { original: { title: 'Cross-scope attempt' } },
        suggestionId: suggestion.id,
        workspaceId: otherFixture.workspaceId,
      })
      .then(
        () => null,
        (rejected: unknown) => rejected,
      );

    expect(errorDetails(error)).toMatch(/suggestion_events_suggestion_scope_fkey|foreign key/i);
  });
});
