import { describe, expect, test } from 'vitest';

import { isChatLanguagePreference, isLocale, normalizeLocale } from '../../src/i18n/index.js';
import { renderReminderCard, renderSuggestion, t } from '../../src/telegram/messages.js';

describe('locale normalization', () => {
  test('maps Telegram language codes and labels to supported locales, defaulting to English', () => {
    expect(normalizeLocale('ru')).toBe('ru');
    expect(normalizeLocale('ru-RU')).toBe('ru');
    expect(normalizeLocale('es-419')).toBe('es');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('fr')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
    expect(normalizeLocale('')).toBe('en');
  });

  test('validates locales and chat language preferences', () => {
    expect(isLocale('es')).toBe(true);
    expect(isLocale('auto')).toBe(false);
    expect(isChatLanguagePreference('auto')).toBe(true);
    expect(isChatLanguagePreference('ru')).toBe(true);
    expect(isChatLanguagePreference('fr')).toBe(false);
  });
});

describe('localized rendering', () => {
  const suggestion = { dueDateText: 'today', id: 'id-1', title: 'Send the proposal' };
  const nonces = { confirm: 'c'.repeat(24), edit: 'e'.repeat(24), reject: 'r'.repeat(24) };

  test('renders the suggestion card chrome in each language', () => {
    expect(renderSuggestion('en', suggestion, nonces, 'secret').text).toContain('Keepword spotted a commitment');
    expect(renderSuggestion('ru', suggestion, nonces, 'secret').text).toContain('Keepword заметил договорённость');
    expect(renderSuggestion('es', suggestion, nonces, 'secret').text).toContain('Keepword detectó un compromiso');
  });

  test('localizes button labels and due prefix', () => {
    const en = renderSuggestion('en', suggestion, nonces, 'secret');
    expect(en.replyMarkup.inline_keyboard[0]?.map((b) => b.text)).toEqual(['Confirm', 'Edit', 'Skip']);
    expect(en.text).toContain('Due: today');
    const es = renderReminderCard('es', { dueDateText: 'hoy', status: 'overdue', title: 'Pagar' }, {
      block: 'b'.repeat(24), cancel: 'x'.repeat(24), complete: 'p'.repeat(24), reschedule: 'g'.repeat(24),
    }, 'secret');
    expect(es.text).toContain('Compromiso vencido');
    expect(es.text).toContain('Fecha límite: hoy');
  });

  test('falls back to English for an unknown locale via t()', () => {
    // @ts-expect-error deliberately passing an unsupported locale
    expect(t('de').btnConfirm).toBe(t('en').btnConfirm);
  });
});
