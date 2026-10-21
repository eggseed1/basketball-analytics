import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import {
  DEFAULT_LOCALE,
  FORCE_LOCALE_ENV,
  LOCALE_AUTO,
  LOCALE_COOKIE,
  LOCALE_NAV_COOKIE,
  PSEUDO_LOCALE,
  isAppLocale,
} from "@/i18n/config";
import { resolveFromAcceptLanguage } from "@/i18n/match";
import { loadMessages } from "@/i18n/messages";

function forcedLocale(): string | null {
  const raw = process.env[FORCE_LOCALE_ENV]?.trim();
  if (!raw) return null;
  if (isAppLocale(raw)) return raw;
  return null;
}

function resolveLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null,
  navHint: string | undefined
): string {
  const forced = forcedLocale();
  if (forced) return forced;

  // Pseudolocale is never honored in production, even if someone sets the cookie.
  if (cookieValue === PSEUDO_LOCALE) {
    if (process.env.NODE_ENV !== "production") return PSEUDO_LOCALE;
  }

  // Explicit language choice (not Automatic).
  if (
    cookieValue &&
    cookieValue !== LOCALE_AUTO &&
    isAppLocale(cookieValue)
  ) {
    return cookieValue;
  }

  // Automatic only when the user picks it — missing cookie stays English.
  if (cookieValue === LOCALE_AUTO) {
    const fromAccept = resolveFromAcceptLanguage(acceptLanguage);
    if (fromAccept !== PSEUDO_LOCALE && fromAccept !== DEFAULT_LOCALE) {
      return fromAccept;
    }
    if (isAppLocale(navHint)) return navHint;
    return fromAccept === PSEUDO_LOCALE ? DEFAULT_LOCALE : fromAccept;
  }

  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const hdrs = await headers();
  const locale = resolveLocale(
    store.get(LOCALE_COOKIE)?.value,
    hdrs.get("accept-language"),
    store.get(LOCALE_NAV_COOKIE)?.value
  );

  let messages;
  try {
    messages = await loadMessages(locale);
  } catch {
    messages = await loadMessages(DEFAULT_LOCALE);
  }

  return {
    locale: locale === PSEUDO_LOCALE ? PSEUDO_LOCALE : isAppLocale(locale) ? locale : DEFAULT_LOCALE,
    messages,
    getMessageFallback() {
      // English merge should cover gaps; never flash raw keys.
      return "";
    },
    onError(error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[i18n]", error.message);
      }
    },
  };
});
