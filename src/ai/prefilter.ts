const russianDirectActionForms = [
  'созвонюсь', 'созвонимся', 'созвонись', 'созвонитесь',
  'позвоню', 'позвоним', 'позвони', 'позвоните',
  'составлю', 'составим', 'составь', 'составьте',
  'подготовлю', 'подготовим', 'подготовь', 'подготовьте',
  'отправлю', 'отправим', 'отправь', 'отправьте',
  'пришлю', 'пришлём', 'пришлем', 'перешлю', 'перешлём', 'перешлем',
  'проверю', 'проверим', 'проверь', 'проверьте',
  'согласую', 'согласуем', 'согласуй', 'согласуйте',
  'сделаю', 'сделаем', 'сделай', 'сделайте',
  'обновлю', 'обновим', 'обнови', 'обновите',
  'исправлю', 'исправим', 'исправь', 'исправьте',
  'проведу', 'проведём', 'проведем', 'проведи', 'проведите',
  'назначу', 'назначим', 'назначь', 'назначьте',
  'забронирую', 'забронируем', 'забронируй', 'забронируйте',
  'оплачу', 'оплатим', 'оплати', 'оплатите',
  'подпишу', 'подпишем', 'подпиши', 'подпишите',
  'закрою', 'закроем', 'закрой', 'закройте',
  'доделаю', 'доделаем', 'доделай', 'доделайте',
  'оформлю', 'оформим', 'оформи', 'оформите',
  'создам', 'создадим', 'создай', 'создайте',
  'напишу', 'напишем', 'напиши', 'напишите',
  'разберусь', 'разберёмся', 'разберемся',
] as const;

const russianInfinitiveActionForms = [
  'созвониться', 'позвонить', 'составить', 'подготовить', 'отправить',
  'прислать', 'переслать', 'проверить', 'согласовать', 'сделать',
  'обновить', 'исправить', 'провести', 'назначить', 'забронировать',
  'оплатить', 'подписать', 'закрыть', 'доделать', 'оформить', 'создать',
  'написать', 'разобраться',
] as const;

const russianCommitmentCues = [
  'нужно', 'надо', 'должен', 'должна', 'должны', 'пожалуйста', 'давайте',
  'сегодня', 'завтра', 'послезавтра', 'дедлайн', 'срок', 'до', 'к вечеру',
] as const;

const englishAction = '(?:call|schedule|meet|draft|prepare|send|share|review|check|approve|update|fix|book|pay|sign|close|finish|create|write|follow\\s+up)';
const englishDirectActionPattern = new RegExp(
  `\\b(?:i|we)\\s+(?:(?:will|shall)\\s+)?${englishAction}\\b|\\b(?:i'll|we'll)\\s+${englishAction}\\b|\\bplease\\s+${englishAction}\\b`,
  'iu',
);
const englishInfinitiveActionPattern = new RegExp(`\\b${englishAction}\\b`, 'iu');
const englishCommitmentCuePattern = /\b(?:need(?:s)?\s+to|must|should|please|today|tomorrow|tonight|deadline|eod|by|before)\b/iu;
const timeCuePattern = /\b\d{1,2}:\d{2}\b/u;

function normalizeText(text: string): string {
  return text.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesTerm(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => new RegExp(`(?:^|[^\\p{L}])${escapeRegex(term)}(?=$|[^\\p{L}])`, 'u').test(text));
}

export function isPotentialCommitment(text: string): boolean {
  const normalizedText = normalizeText(text);
  if (normalizedText.length === 0) {
    return false;
  }

  if (includesTerm(normalizedText, russianDirectActionForms) || englishDirectActionPattern.test(normalizedText)) {
    return true;
  }

  const hasAction = includesTerm(normalizedText, russianInfinitiveActionForms) || englishInfinitiveActionPattern.test(normalizedText);
  const hasCommitmentCue =
    includesTerm(normalizedText, russianCommitmentCues) ||
    englishCommitmentCuePattern.test(normalizedText) ||
    timeCuePattern.test(normalizedText);

  return hasAction && hasCommitmentCue;
}
