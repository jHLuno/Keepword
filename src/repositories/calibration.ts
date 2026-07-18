import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
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

type TerminalSuggestionEvent = Readonly<{
  createdAt: Date;
  eventType: 'confirmed' | 'rejected';
  suggestionId: string;
}>;

type EditedSuggestionEvent = Readonly<{
  createdAt: Date;
  suggestionId: string;
}>;

export function createCalibrationRepository<TQueryResult extends PgQueryResultHKT>(
  database: RepositoryDatabase<TQueryResult>,
): CalibrationRepository {
  return {
    async findChatCalibration(input) {
      const windowStart = new Date(input.now.getTime() - calibrationWindowMs);
      const terminalEvents = await database
        .select({
          createdAt: suggestionEvents.createdAt,
          eventType: suggestionEvents.eventType,
          suggestionId: suggestionEvents.suggestionId,
        })
        .from(suggestionEvents)
        .where(and(
          eq(suggestionEvents.workspaceId, input.workspaceId),
          eq(suggestionEvents.chatId, input.chatId),
          inArray(suggestionEvents.eventType, ['confirmed', 'rejected']),
          gte(suggestionEvents.createdAt, windowStart),
          lte(suggestionEvents.createdAt, input.now),
        ))
        .orderBy(asc(suggestionEvents.createdAt));

      const terminalEventsBySuggestion = new Map<string, TerminalSuggestionEvent[]>();
      for (const event of terminalEvents as readonly TerminalSuggestionEvent[]) {
        const grouped = terminalEventsBySuggestion.get(event.suggestionId) ?? [];
        grouped.push(event);
        terminalEventsBySuggestion.set(event.suggestionId, grouped);
      }

      const suggestionIds = [...terminalEventsBySuggestion.keys()];
      const editedEvents = suggestionIds.length === 0
        ? []
        : await database
          .select({
            createdAt: suggestionEvents.createdAt,
            suggestionId: suggestionEvents.suggestionId,
          })
          .from(suggestionEvents)
          .where(and(
            eq(suggestionEvents.workspaceId, input.workspaceId),
            eq(suggestionEvents.chatId, input.chatId),
            eq(suggestionEvents.eventType, 'edited'),
            inArray(suggestionEvents.suggestionId, suggestionIds),
            lte(suggestionEvents.createdAt, input.now),
          ));
      const editedEventsBySuggestion = new Map<string, EditedSuggestionEvent[]>();
      for (const event of editedEvents as readonly EditedSuggestionEvent[]) {
        const grouped = editedEventsBySuggestion.get(event.suggestionId) ?? [];
        grouped.push(event);
        editedEventsBySuggestion.set(event.suggestionId, grouped);
      }

      const summary = { acceptedAsProposed: 0, editedBeforeConfirmation: 0, rejected: 0, resolved: 0 };
      for (const terminalEventsForSuggestion of terminalEventsBySuggestion.values()) {
        const terminalEvent = terminalEventsForSuggestion.at(-1);
        if (!terminalEvent) continue;
        summary.resolved += 1;
        if (terminalEvent.eventType === 'rejected') {
          summary.rejected += 1;
          continue;
        }
        const wasEdited = (editedEventsBySuggestion.get(terminalEvent.suggestionId) ?? []).some((event) =>
          event.createdAt <= terminalEvent.createdAt,
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
