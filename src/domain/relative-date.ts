/**
 * Resolve a human deadline phrase (English, Russian, or Spanish) into a concrete
 * UTC instant, interpreted in the chat's time zone relative to a reference instant
 * (usually when the message was sent). Returns null when the phrase cannot be
 * resolved to a specific day, in which case the caller keeps the deadline as text
 * only and no reminder is scheduled.
 *
 * Supported: explicit ISO date-times; today / tomorrow / day-after-tomorrow;
 * weekday names; optional time-of-day ("18:00", evening / EOD cues). A bare day
 * defaults to 09:00 local; evening cues default to 18:00 local.
 */

const DEFAULT_HOUR = 9;
const EVENING_HOUR = 18;

// Explicit calendar date "YYYY-MM-DD" with an optional "T"/space "HH:MM".
const explicitDatePattern = /(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{1,2}):(\d{2}))?/i;
// An explicit UTC/offset suffix means the string is an absolute instant.
const explicitOffsetPattern = /(?:z|[+-]\d{2}:\d{2})\s*$/i;
// A time of day in a relative phrase; the separator may be ":", "." or a space.
const explicitTimePattern = /\b([01]?\d|2[0-3])[:.\s]([0-5]\d)\b/;

// Weekday stems by JS getDay() index (0 = Sunday … 6 = Saturday).
const weekdayStems: readonly (readonly string[])[] = [
  ['sunday', 'воскрес', 'domingo'],
  ['monday', 'понедельник', 'lunes'],
  ['tuesday', 'вторник', 'martes'],
  ['wednesday', 'сред', 'miercoles', 'miércoles'],
  ['thursday', 'четверг', 'jueves'],
  ['friday', 'пятниц', 'viernes'],
  ['saturday', 'суббот', 'sabado', 'sábado'],
];

const eveningCues = [
  'вечер', 'к вечеру', 'ночью', 'tonight', 'evening', 'noche', 'eod',
  'end of day', 'конце дня', 'концу дня',
];

const todayCues = ['сегодня', 'today', 'hoy', 'сейчас'];

function includesAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function zonedDateParts(instant: Date, timeZone: string): Readonly<{ day: number; month: number; year: number }> | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    }).formatToParts(instant);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = Number(values.get('year'));
    const month = Number(values.get('month'));
    const day = Number(values.get('day'));
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return null;
    }
    return { day, month, year };
  } catch {
    return null;
  }
}

function timezoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const hour = values.get('hour') === '24' ? '00' : values.get('hour');
  const asUtc = Date.UTC(
    Number(values.get('year')),
    Number(values.get('month')) - 1,
    Number(values.get('day')),
    Number(hour),
    Number(values.get('minute')),
    Number(values.get('second')),
  );
  return asUtc - instant.getTime();
}

function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = timezoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

function calendarWeekday(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function addDays(year: number, month: number, day: number, delta: number): Readonly<{ day: number; month: number; year: number }> {
  const shifted = new Date(Date.UTC(year, month - 1, day + delta));
  return { day: shifted.getUTCDate(), month: shifted.getUTCMonth() + 1, year: shifted.getUTCFullYear() };
}

export function resolveDueDate(text: string | null | undefined, reference: Date, timeZone: string): Date | null {
  if (!text) {
    return null;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const normalized = trimmed.toLowerCase();
  const hasEveningCue = includesAny(normalized, eveningCues);

  // Explicit calendar date. With an offset it is an absolute instant; otherwise
  // its wall clock is interpreted in the chat's time zone.
  const explicitDate = explicitDatePattern.exec(trimmed);
  if (explicitDate) {
    if (explicitOffsetPattern.test(trimmed)) {
      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed);
      }
    }
    const hour = explicitDate[4] !== undefined ? Number(explicitDate[4]) : (hasEveningCue ? EVENING_HOUR : DEFAULT_HOUR);
    const minute = explicitDate[5] !== undefined ? Number(explicitDate[5]) : 0;
    if (hour > 23 || minute > 59) {
      return null;
    }
    return zonedWallClockToUtc(Number(explicitDate[1]), Number(explicitDate[2]), Number(explicitDate[3]), hour, minute, timeZone);
  }

  const referenceParts = zonedDateParts(reference, timeZone);
  if (!referenceParts) {
    return null;
  }

  // Time of day.
  let hour = DEFAULT_HOUR;
  let minute = 0;
  const explicitTime = explicitTimePattern.exec(normalized);
  if (explicitTime) {
    hour = Number(explicitTime[1]);
    minute = Number(explicitTime[2]);
  } else if (hasEveningCue) {
    hour = EVENING_HOUR;
  }
  const hasTimeOnlyCue = Boolean(explicitTime) || hasEveningCue;

  // Target day, in precedence order: day-after-tomorrow, tomorrow, explicit
  // "today", a named weekday, and finally a time-only phrase which means today.
  let target: Readonly<{ day: number; month: number; year: number }> | null = null;
  if (includesAny(normalized, ['послезавтра', 'day after tomorrow', 'pasado mañana', 'pasado manana'])) {
    target = addDays(referenceParts.year, referenceParts.month, referenceParts.day, 2);
  } else if (includesAny(normalized, ['завтра', 'tomorrow', 'mañana', 'manana'])) {
    target = addDays(referenceParts.year, referenceParts.month, referenceParts.day, 1);
  } else if (includesAny(normalized, todayCues)) {
    target = referenceParts;
  } else {
    const referenceWeekday = calendarWeekday(referenceParts.year, referenceParts.month, referenceParts.day);
    for (let index = 0; index < weekdayStems.length; index += 1) {
      if (includesAny(normalized, weekdayStems[index]!)) {
        const delta = (index - referenceWeekday + 7) % 7;
        target = addDays(referenceParts.year, referenceParts.month, referenceParts.day, delta);
        break;
      }
    }
    if (!target && hasTimeOnlyCue) {
      target = referenceParts;
    }
  }

  if (!target) {
    return null;
  }
  return zonedWallClockToUtc(target.year, target.month, target.day, hour, minute, timeZone);
}
