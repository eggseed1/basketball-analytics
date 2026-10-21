/**
 * Single source of truth for supported UI locales.
 * Add a locale here, drop a matching messages/{code}.json, and expose it.
 */

export const LOCALE_COOKIE = "DRBL_LOCALE";
/**
 * Optional navigator hint written by the client when preference is Automatic.
 * Used when Accept-Language is missing or only falls back to English.
 * Never overrides an explicit language choice in `DRBL_LOCALE`.
 */
export const LOCALE_NAV_COOKIE = "DRBL_LOCALE_NAV";
/** Cookie value meaning “follow browser / Accept-Language / system hint”. */
export const LOCALE_AUTO = "auto";

/**
 * Deploy/runtime override that forces a single UI locale and ignores cookie +
 * Accept-Language. Set to an implemented locale (usually `en`) for English-only
 * rollback. Unset restores normal detection (not English — that requires `en`).
 * Read from process.env.DRBL_FORCE_LOCALE (Next) or env.DRBL_FORCE_LOCALE (Worker).
 */
export const FORCE_LOCALE_ENV = "DRBL_FORCE_LOCALE";

/** Locales with completed interface catalogs (offered in the selector). */
export const LOCALES = [
  "en",
  "es",
  "fr",
  "de",
  "pt-BR",
  "ko",
  "ja",
  "zh-Hans",
  "zh-Hant",
] as const;

export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

/**
 * Dev-only expansion locale. Not shown in the selector.
 * Prefixed English with wide characters to stress layout.
 */
export const PSEUDO_LOCALE = "en-XA" as const;

export type LocalePreference = AppLocale | typeof LOCALE_AUTO;

/** Language names in their own language (selector labels). */
export const LOCALE_NATIVE_NAMES: Record<AppLocale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  "pt-BR": "Português (Brasil)",
  ko: "한국어",
  ja: "日本語",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
};

/** BCP 47 tag for <html lang>. */
export function htmlLang(locale: string): string {
  if (locale === "zh-Hans") return "zh-Hans";
  if (locale === "zh-Hant") return "zh-Hant";
  if (locale === PSEUDO_LOCALE) return "en";
  return locale;
}

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function isLocalePreference(
  value: string | null | undefined
): value is LocalePreference {
  return value === LOCALE_AUTO || isAppLocale(value);
}

/** Locales the matcher may resolve to (includes pseudo in development). */
export function matchableLocales(includePseudo = false): readonly string[] {
  if (includePseudo && process.env.NODE_ENV !== "production") {
    return [...LOCALES, PSEUDO_LOCALE];
  }
  return LOCALES;
}
