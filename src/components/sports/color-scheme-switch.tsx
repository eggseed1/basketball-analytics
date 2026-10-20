"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";

import { useOwnerTheme } from "@/components/design-system/theme-provider";

/** Header control - toggles light / dark. Sits next to site search. */
export function ColorSchemeSwitch() {
  const t = useTranslations("Theme");
  const { resolvedDark, setScheme } = useOwnerTheme();
  const label = resolvedDark ? t("switchToLight") : t("switchToDark");
  return (
    <button
      type="button"
      onClick={() => setScheme(resolvedDark ? "light" : "dark")}
      className="color-scheme-switch flex size-9 shrink-0 items-center justify-center rounded-md text-foreground transition hover:bg-muted"
      aria-label={label}
      title={label}
    >
      {resolvedDark ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </button>
  );
}
