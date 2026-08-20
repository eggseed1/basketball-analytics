"use client";

import { Moon, Sun } from "lucide-react";

import { useOwnerTheme } from "@/components/design-system/theme-provider";

/** Header control — toggles light / dark. Sits next to site search. */
export function ColorSchemeSwitch() {
  const { resolvedDark, setScheme } = useOwnerTheme();
  return (
    <button
      type="button"
      onClick={() => setScheme(resolvedDark ? "light" : "dark")}
      className="color-scheme-switch flex size-9 shrink-0 items-center justify-center rounded-md text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={resolvedDark ? "Switch to light mode" : "Switch to dark mode"}
      title={resolvedDark ? "Light mode" : "Dark mode"}
    >
      {resolvedDark ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </button>
  );
}
