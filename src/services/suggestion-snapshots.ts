import type { commitmentSuggestions } from '../db/schema.js';

type SuggestionRow = Pick<
  typeof commitmentSuggestions.$inferSelect,
  | 'assigneeUserId'
  | 'confidence'
  | 'description'
  | 'dueAt'
  | 'dueDateText'
  | 'needsAssigneeClarification'
  | 'needsDueDateClarification'
  | 'sourceMessageId'
  | 'title'
>;

export type SuggestionSnapshot = Readonly<{
  assigneeUserId: string | null;
  confidence: string;
  description: string | null;
  dueAt: string | null;
  dueDateText: string | null;
  needsAssigneeClarification: boolean;
  needsDueDateClarification: boolean;
  sourceMessageIds: readonly string[];
  title: string;
}>;

export type SuggestionEventSnapshot = Readonly<{
  after?: SuggestionSnapshot;
  before?: SuggestionSnapshot;
  final?: SuggestionSnapshot;
  original?: SuggestionSnapshot;
}>;

export function snapshotSuggestion(suggestion: SuggestionRow): SuggestionSnapshot {
  return {
    assigneeUserId: suggestion.assigneeUserId,
    confidence: suggestion.confidence,
    description: suggestion.description,
    dueAt: suggestion.dueAt?.toISOString() ?? null,
    dueDateText: suggestion.dueDateText,
    needsAssigneeClarification: suggestion.needsAssigneeClarification,
    needsDueDateClarification: suggestion.needsDueDateClarification,
    sourceMessageIds: [suggestion.sourceMessageId],
    title: suggestion.title,
  };
}
