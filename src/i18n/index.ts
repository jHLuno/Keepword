export const locales = ['en', 'ru', 'es'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/**
 * Normalize any language signal (a stored value, a Telegram `language_code`
 * such as `ru`, `ru-RU`, `es-419`, or a free-form label) to a supported
 * {@link Locale}. Falls back to {@link defaultLocale} (English) when the input
 * is absent or not one of the supported languages.
 */
export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) {
    return defaultLocale;
  }
  const primary = value.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(primary) ? primary : defaultLocale;
}

/**
 * A chat's configured language. `auto` means detect each message's language;
 * a specific {@link Locale} forces every reply in that chat into that language.
 */
export const chatLanguagePreferences = ['auto', ...locales] as const;

export type ChatLanguagePreference = (typeof chatLanguagePreferences)[number];

export function isChatLanguagePreference(value: unknown): value is ChatLanguagePreference {
  return typeof value === 'string' && (chatLanguagePreferences as readonly string[]).includes(value);
}
