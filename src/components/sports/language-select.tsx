"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  LOCALE_AUTO,
  LOCALE_NATIVE_NAMES,
  LOCALES,
  type AppLocale,
  type LocalePreference,
  isAppLocale,
} from "@/i18n/config";
import {
  clearLocaleNavCookie,
  readLocalePreferenceCookie,
  writeLocaleNavCookie,
  writeLocalePreferenceCookie,
} from "@/i18n/cookie";
import { resolveFromNavigator } from "@/i18n/match";
import { cn } from "@/lib/utils";

/**
 * Compact language control for Settings.
 * Automatic restores Accept-Language / system matching on the next request.
 * Player and team names stay in their published form in every language.
 */
export function LanguageSelect() {
  const t = useTranslations("Settings");
  const activeLocale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preference, setPreference] = useState<LocalePreference>(LOCALE_AUTO);

  useEffect(() => {
    const stored = readLocalePreferenceCookie();
    if (stored) {
      setPreference(stored);
      return;
    }
    setPreference(LOCALE_AUTO);
  }, [activeLocale]);

  function onChange(next: string) {
    const value: LocalePreference =
      next === LOCALE_AUTO || isAppLocale(next) ? (next as LocalePreference) : LOCALE_AUTO;
    setPreference(value);
    writeLocalePreferenceCookie(value);
    if (value === LOCALE_AUTO) {
      const nav = resolveFromNavigator();
      if (isAppLocale(nav)) writeLocaleNavCookie(nav as AppLocale);
    } else {
      clearLocaleNavCookie();
    }
    // Hard navigation so RSC payload + document language stay aligned with the
    // cookie. Soft refresh can leave a stale locale on client islands.
    startTransition(() => {
      if (typeof window !== "undefined") {
        window.location.reload();
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="drbl-language"
        className="type-caption font-medium text-muted-foreground"
      >
        {t("languageLabel")}
      </label>
      <select
        id="drbl-language"
        className={cn(
          "h-10 w-full min-w-0 rounded-md border border-border bg-background px-3 text-[14px] font-medium text-foreground outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring"
        )}
        value={preference}
        disabled={pending}
        aria-busy={pending}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value={LOCALE_AUTO}>{t("automatic")}</option>
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_NATIVE_NAMES[code]}
          </option>
        ))}
      </select>
      <p className="type-caption text-muted-foreground">
        {preference === LOCALE_AUTO ? t("automaticHint") : t("languageHint")}
      </p>
    </div>
  );
}
