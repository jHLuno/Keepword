import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { suggestionEvents } from '../db/schema.js';

import type { RepositoryDatabase } from './database.js';

export const calibrationMinimumResolvedDecisions = 30;
const calibrationWindowMs = 90 * 24 * 60 * 60 * 1_000;

export type CalibrationSummary = Readonly<{
  acceptedAsProposed: number;
  editedBeforeConfirmation: number;
  rejected: number;
  resolved: number;
}>;

export type CalibrationRepository = Readonly<{
  findChatCalibration: (input: Readonly<{
    chatId: string;
    now: Date;
    workspaceId: string;
  }>) => Promise<CalibrationSummary | null>;
}>;

type ScopedSuggestionEvent = Readonly<{
  createdAt: Date;
  eventType: 'confirmed' | 'edited' | 'rejected' | 'suggested';
  suggestionId: string;
}>;

export function createCalibrationRepository<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): CalibrationRepository {
  return {
    async findChatCalibration(input) {
      const windowStart = new Date(input.now.getTime() - calibrationWindowMs);
      const events = await database
        .select({
          createdAt: suggestionEvents.createdAt,
          eventType: suggestionEvents.eventType,
          suggestionId: suggestionEvents.suggestionId,
        })
        .from(suggestionEvents)
        .where(and(
          eq(suggestionEvents.workspaceId, input.workspaceId),
          eq(suggestionEvents.chatId, input.chatId),
          gte(suggestionEvents.createdAt, windowStart),
          lte(suggestionEvents.createdAt, input.now),
        ))
        .orderBy(asc(suggestionEvents.createdAt));

      const eventsBySuggestion = new Map<string, ScopedSuggestionEvent[]>();
      for (const event of events as readonly ScopedSuggestionEvent[]) {
        const grouped = eventsBySuggestion.get(event.suggestionId) ?? [];
        grouped.push(event);
        eventsBySuggestion.set(event.suggestionId, grouped);
      }

      const summary = { acceptedAsProposed: 0, editedBeforeConfirmation: 0, rejected: 0, resolved: 0 };
      for (const suggestionEventsForSuggestion of eventsBySuggestion.values()) {
        const terminalEvent = suggestionEventsForSuggestion.findLast((event) =>
          (event.eventType === 'confirmed' || event.eventType === 'rejected')
            && event.createdAt >= windowStart
            && event.createdAt <= input.now,
        );
        if (!terminalEvent) {
          continue;
        }
        summary.resolved += 1;
        if (terminalEvent.eventType === 'rejected') {
          summary.rejected += 1;
          continue;
        }
        const wasEdited = suggestionEventsForSuggestion.some((event) =>
          event.eventType === 'edited' && event.createdAt <= terminalEvent.createdAt,
        );
        if (wasEdited) {
          summary.editedBeforeConfirmation += 1;
        } else {
          summary.acceptedAsProposed += 1;
        }
      }

      return summary.resolved >= calibrationMinimumResolvedDecisions ? summary : null;
    },
  };
}
