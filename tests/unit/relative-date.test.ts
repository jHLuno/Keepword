import { describe, expect, test } from 'vitest';

import { resolveDueDate } from '../../src/domain/relative-date.js';

// 2026-07-19T06:00Z is a Sunday (getUTCDay() === 0); 11:00 in Asia/Almaty (UTC+5).
const reference = new Date('2026-07-19T06:00:00.000Z');

function iso(text: string, timeZone: string): string | null {
  return resolveDueDate(text, reference, timeZone)?.toISOString() ?? null;
}

describe('resolveDueDate', () => {
  test('resolves today, tomorrow, and day-after-tomorrow at the default 09:00 local', () => {
    expect(iso('сегодня', 'UTC')).toBe('2026-07-19T09:00:00.000Z');
    expect(iso('tomorrow', 'UTC')).toBe('2026-07-20T09:00:00.000Z');
    expect(iso('послезавтра', 'UTC')).toBe('2026-07-21T09:00:00.000Z');
    expect(iso('mañana', 'UTC')).toBe('2026-07-20T09:00:00.000Z');
  });

  test('honours explicit times and evening cues', () => {
    expect(iso('tomorrow 18:00', 'UTC')).toBe('2026-07-20T18:00:00.000Z');
    expect(iso('к вечеру', 'UTC')).toBe('2026-07-19T18:00:00.000Z');
    expect(iso('tonight', 'UTC')).toBe('2026-07-19T18:00:00.000Z');
  });

  test('resolves the next occurrence of a named weekday, keeping weekday over a bare time', () => {
    expect(iso('в пятницу', 'UTC')).toBe('2026-07-24T09:00:00.000Z');
    expect(iso('viernes', 'UTC')).toBe('2026-07-24T09:00:00.000Z');
    expect(iso('friday 9:30', 'UTC')).toBe('2026-07-24T09:30:00.000Z');
  });

  test('interprets the wall clock in the chat time zone', () => {
    // 09:00 in Almaty (UTC+5) on 2026-07-20 is 04:00Z.
    expect(iso('завтра', 'Asia/Almaty')).toBe('2026-07-20T04:00:00.000Z');
  });

  test('accepts a space between hours and minutes', () => {
    expect(iso('22 00', 'UTC')).toBe('2026-07-19T22:00:00.000Z');
  });

  test('treats an explicit ISO offset as absolute and a bare date-time as chat-local', () => {
    expect(iso('2026-08-01T10:00:00Z', 'UTC')).toBe('2026-08-01T10:00:00.000Z');
    expect(iso('2026-07-20T22:00:00+05:00', 'UTC')).toBe('2026-07-20T17:00:00.000Z');
    // No offset: the wall clock is interpreted in the chat time zone (UTC+5).
    expect(iso('2026-07-20 22:00', 'Asia/Almaty')).toBe('2026-07-20T17:00:00.000Z');
  });

  test('returns null for phrases without a resolvable day', () => {
    expect(iso('скоро', 'UTC')).toBeNull();
    expect(iso('as soon as possible', 'UTC')).toBeNull();
    expect(resolveDueDate('', reference, 'UTC')).toBeNull();
    expect(resolveDueDate(null, reference, 'UTC')).toBeNull();
  });
});
