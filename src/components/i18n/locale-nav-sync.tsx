"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";

import {
  LOCALE_AUTO,
  type AppLocale,
  isAppLocale,
} from "@/i18n/config";
import {
  readLocaleNavCookie,
  readLocalePreferenceCookie,
  writeLocaleNavCookie,
} from "@/i18n/cookie";
import { resolveFromNavigator } from "@/i18n/match";

const RELOAD_FLAG = "drbl-locale-nav-reload";

/**
 * Keeps Automatic language in sync with the device language list.
 * Writes a nav hint cookie the server can read when Accept-Language is weak,
 * and reloads once if the served locale does not match the system language.
 *
 * Player and team names are never localized; only UI chrome uses this locale.
 */
export function LocaleNavSync() {
  const activeLocale = useLocale();

  useEffect(() => {
    const preference = readLocalePreferenceCookie();
    if (preference && preference !== LOCALE_AUTO) return;

    const resolved = resolveFromNavigator();
    if (!isAppLocale(resolved)) return;

    const previous = readLocaleNavCookie();
    if (previous !== resolved) {
      writeLocaleNavCookie(resolved as AppLocale);
    }

    if (resolved === activeLocale) {
      try {
        sessionStorage.removeItem(RELOAD_FLAG);
      } catch {
        // ignore
      }
      return;
    }

    try {
      if (sessionStorage.getItem(RELOAD_FLAG) === resolved) return;
      sessionStorage.setItem(RELOAD_FLAG, resolved);
    } catch {
      return;
    }
    window.location.reload();
  }, [activeLocale]);

  return null;
}
