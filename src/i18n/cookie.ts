import {
  LOCALE_AUTO,
  LOCALE_COOKIE,
  type LocalePreference,
  isLocalePreference,
} from "@/i18n/config";

const MAX_AGE_SEC = 60 * 60 * 24 * 365;

/** Read preference from document.cookie (client). */
export function readLocalePreferenceCookie(): LocalePreference | null {
  if (typeof document === "undefined") return null;
  try {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${LOCALE_COOKIE}=`));
    if (!match) return null;
    const value = decodeURIComponent(match.split("=").slice(1).join("="));
    return isLocalePreference(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Persist an explicit choice or Automatic.
 * Non-httpOnly so the selector can reflect it; SameSite=Lax for navigations.
 */
export function writeLocalePreferenceCookie(value: LocalePreference): boolean {
  if (typeof document === "undefined") return false;
  try {
    document.cookie = [
      `${LOCALE_COOKIE}=${encodeURIComponent(value)}`,
      "Path=/",
      `Max-Age=${MAX_AGE_SEC}`,
      "SameSite=Lax",
    ].join("; ");
    return true;
  } catch {
    return false;
  }
}

export function clearLocalePreferenceCookie(): boolean {
  if (typeof document === "undefined") return false;
  try {
    document.cookie = `${LOCALE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    return true;
  } catch {
    return false;
  }
}

export { LOCALE_AUTO, LOCALE_COOKIE };
