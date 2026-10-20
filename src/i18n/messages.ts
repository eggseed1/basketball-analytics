import type { AppLocale } from "@/i18n/config";
import { DEFAULT_LOCALE, PSEUDO_LOCALE, isAppLocale } from "@/i18n/config";
import en from "../../messages/en.json";

type Messages = typeof en;

async function loadLocaleFile(locale: string): Promise<Messages | null> {
  try {
    if (locale === PSEUDO_LOCALE) {
      const mod = await import("../../messages/en-XA.json");
      return mod.default as Messages;
    }
    if (!isAppLocale(locale) && locale !== DEFAULT_LOCALE) return null;
    switch (locale as AppLocale) {
      case "en":
        return en;
      case "es":
        return (await import("../../messages/es.json")).default as Messages;
      case "fr":
        return (await import("../../messages/fr.json")).default as Messages;
      case "de":
        return (await import("../../messages/de.json")).default as Messages;
      case "pt-BR":
        return (await import("../../messages/pt-BR.json")).default as Messages;
      case "ko":
        return (await import("../../messages/ko.json")).default as Messages;
      case "ja":
        return (await import("../../messages/ja.json")).default as Messages;
      case "zh-Hans":
        return (await import("../../messages/zh-Hans.json")).default as Messages;
      case "zh-Hant":
        return (await import("../../messages/zh-Hant.json")).default as Messages;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Deep-merge so missing translations fall back to English without raw keys. */
export function mergeMessages(
  base: Record<string, unknown>,
  overlay: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!overlay) return { ...base };
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const prev = out[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      prev &&
      typeof prev === "object" &&
      !Array.isArray(prev)
    ) {
      out[key] = mergeMessages(
        prev as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export async function loadMessages(locale: string): Promise<Messages> {
  if (locale === DEFAULT_LOCALE || locale === "en") return en;
  const file = await loadLocaleFile(locale);
  if (!file) return en;
  return mergeMessages(en as Record<string, unknown>, file as Record<string, unknown>) as Messages;
}

export { en };
