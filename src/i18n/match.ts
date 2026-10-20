import { match as matchLocale } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

import {
  DEFAULT_LOCALE,
  LOCALES,
  PSEUDO_LOCALE,
  type AppLocale,
  isAppLocale,
  matchableLocales,
} from "@/i18n/config";

/**
 * Map regional / script tags onto our implemented set before matching.
 * zh → Hans by default (mainland-majority). HK / TW / MO → Hant.
 * pt without region → pt-BR (our only Portuguese catalog).
 */
export function normalizeLanguageTag(tag: string): string {
  const raw = tag.trim().replace(/_/g, "-");
  if (!raw) return raw;
  try {
    const loc = new Intl.Locale(raw);
    const lang = loc.language.toLowerCase();
    const region = (loc.region ?? "").toUpperCase();
    const script = (loc.script ?? "").toLowerCase();

    if (lang === "zh") {
      if (script === "hant" || region === "TW" || region === "HK" || region === "MO") {
        return "zh-Hant";
      }
      if (script === "hans" || region === "CN" || region === "SG") {
        return "zh-Hans";
      }
      // Bare "zh" or unknown region → Simplified (catalog we ship).
      return "zh-Hans";
    }

    if (lang === "pt") {
      return "pt-BR";
    }

    // Keep region when we ship it (pt-BR); otherwise language only for matching.
    if (lang === "en" || lang === "es" || lang === "fr" || lang === "de") {
      return lang;
    }
    if (lang === "ko" || lang === "ja") {
      return lang;
    }

    return loc.toString();
  } catch {
    return raw;
  }
}

/**
 * Pick the best implemented locale from an ordered preference list
 * (Accept-Language weights or navigator.languages).
 */
export function resolveFromPreferences(
  preferences: readonly string[],
  options?: { includePseudo?: boolean }
): AppLocale | typeof PSEUDO_LOCALE {
  const available = matchableLocales(options?.includePseudo);
  const normalized = preferences
    .map(normalizeLanguageTag)
    .filter(Boolean);
  if (!normalized.length) return DEFAULT_LOCALE;

  try {
    const matched = matchLocale(
      normalized,
      [...available],
      DEFAULT_LOCALE
    );
    if (matched === PSEUDO_LOCALE) return PSEUDO_LOCALE;
    if (isAppLocale(matched)) return matched;
    return DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Parse Accept-Language into ordered tags (highest weight first). */
export function preferencesFromAcceptLanguage(
  header: string | null | undefined
): string[] {
  if (!header?.trim()) return [];
  const negotiator = new Negotiator({
    headers: { "accept-language": header },
  });
  return negotiator.languages();
}

export function resolveFromAcceptLanguage(
  header: string | null | undefined,
  options?: { includePseudo?: boolean }
): AppLocale | typeof PSEUDO_LOCALE {
  return resolveFromPreferences(
    preferencesFromAcceptLanguage(header),
    options
  );
}

/** Client-side: navigator.languages then navigator.language. */
export function preferencesFromNavigator(): string[] {
  if (typeof navigator === "undefined") return [];
  const list =
    navigator.languages?.length
      ? [...navigator.languages]
      : navigator.language
        ? [navigator.language]
        : [];
  return list;
}

export function resolveFromNavigator(
  options?: { includePseudo?: boolean }
): AppLocale | typeof PSEUDO_LOCALE {
  return resolveFromPreferences(preferencesFromNavigator(), options);
}

/** All implemented locales for tests / docs. */
export function implementedLocales(): readonly AppLocale[] {
  return LOCALES;
}
