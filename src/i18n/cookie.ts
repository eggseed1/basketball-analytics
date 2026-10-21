import {
  LOCALE_AUTO,
  LOCALE_COOKIE,
  LOCALE_NAV_COOKIE,
  type AppLocale,
  type LocalePreference,
  isAppLocale,
  isLocalePreference,
} from "@/i18n/config";

const MAX_AGE_SEC = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  try {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${name}=`));
    if (!match) return null;
    return decodeURIComponent(match.split("=").slice(1).join("="));
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string, maxAge = MAX_AGE_SEC): boolean {
  if (typeof document === "undefined") return false;
  try {
    document.cookie = [
      `${name}=${encodeURIComponent(value)}`,
      "Path=/",
      `Max-Age=${maxAge}`,
      "SameSite=Lax",
    ].join("; ");
    return true;
  } catch {
    return false;
  }
}

function clearCookie(name: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    return true;
  } catch {
    return false;
  }
}

/** Read preference from document.cookie (client). */
export function readLocalePreferenceCookie(): LocalePreference | null {
  const value = readCookie(LOCALE_COOKIE);
  return isLocalePreference(value) ? value : null;
}

/**
 * Persist an explicit choice or Automatic.
 * Non-httpOnly so the selector can reflect it; SameSite=Lax for navigations.
 */
export function writeLocalePreferenceCookie(value: LocalePreference): boolean {
  return writeCookie(LOCALE_COOKIE, value);
}

export function clearLocalePreferenceCookie(): boolean {
  return clearCookie(LOCALE_COOKIE);
}

/** System-language hint used while preference is Automatic. */
export function readLocaleNavCookie(): AppLocale | null {
  const value = readCookie(LOCALE_NAV_COOKIE);
  return isAppLocale(value) ? value : null;
}

export function writeLocaleNavCookie(value: AppLocale): boolean {
  return writeCookie(LOCALE_NAV_COOKIE, value);
}

export function clearLocaleNavCookie(): boolean {
  return clearCookie(LOCALE_NAV_COOKIE);
}

export { LOCALE_AUTO, LOCALE_COOKIE, LOCALE_NAV_COOKIE };
