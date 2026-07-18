const commitmentTriggers = [
  'обещаю',
  'отправлю',
  'подготовлю',
  'сделаю',
  'проверю',
  'возьму на себя',
  'нужно сделать',
  'проверь',
  'сделайте',
  'назначаю',
  'i will',
  "i'll",
  'we will',
  'will send',
  'will prepare',
  'will review',
  'please check',
  'please send',
  'follow up',
] as const;

function normalizeText(text: string): string {
  return text.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function isPotentialCommitment(text: string): boolean {
  const normalizedText = normalizeText(text);

  return normalizedText.length > 0 && commitmentTriggers.some((trigger) => normalizedText.includes(trigger));
}
